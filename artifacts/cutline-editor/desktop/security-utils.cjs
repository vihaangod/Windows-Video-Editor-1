const fs = require('node:fs');
const path = require('node:path');

const REMOVE_MEDIA_RESPONSE = 1;
const MAX_MEDIA_NAME_LENGTH = 120;
const MAX_CLIP_COUNT = 1_000_000;
const MEDIA_CONTENT_TYPES = Object.freeze({
  '.aac': 'audio/aac',
  '.avif': 'image/avif',
  '.avi': 'video/x-msvideo',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
});
const SUPPORTED_MEDIA_EXTENSIONS = Object.freeze(Object.keys(MEDIA_CONTENT_TYPES).map((extension) => extension.slice(1)));

function getMediaContentType(fileName) {
  if (typeof fileName !== 'string') return null;
  return MEDIA_CONTENT_TYPES[path.extname(fileName).toLowerCase()] || null;
}

function createNativeMediaDescriptor(filePath, token) {
  if (typeof filePath !== 'string' || typeof token !== 'string' || !/^[a-f0-9-]{36}$/i.test(token)) {
    return null;
  }

  try {
    const absolutePath = path.resolve(filePath);
    const fileName = path.basename(absolutePath).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    const mimeType = getMediaContentType(fileName);
    const stats = fs.statSync(absolutePath);
    if (!fileName || !mimeType || !stats.isFile() || !Number.isSafeInteger(stats.size)) return null;

    return {
      token,
      filePath: absolutePath,
      fileName: fileName.slice(0, 255),
      mimeType,
      byteSize: stats.size,
    };
  } catch {
    return null;
  }
}

function normalizeMediaRemovalRequest(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const fileName = typeof payload.fileName === 'string'
    ? payload.fileName.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_MEDIA_NAME_LENGTH)
    : '';
  const clipCount = payload.clipCount;

  if (!fileName || !Number.isSafeInteger(clipCount) || clipCount < 0 || clipCount > MAX_CLIP_COUNT) {
    return null;
  }

  return { fileName, clipCount };
}

function createMediaRemovalDialogOptions(payload) {
  const details = normalizeMediaRemovalRequest(payload);
  if (!details) return null;

  const clipDescription = details.clipCount === 0
    ? 'No timeline clips currently reference this item.'
    : `${details.clipCount} timeline clip${details.clipCount === 1 ? '' : 's'} and linked filters or transitions will be removed from this project.`;

  return {
    type: 'warning',
    title: 'Remove media from this project?',
    message: `Remove “${details.fileName}” from this project?`,
    detail: `${clipDescription}\nThe original source file on your computer will not be deleted.`,
    buttons: ['Cancel', 'Remove media'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
}

async function confirmMediaRemoval(showMessageBox, parentWindow, payload) {
  const options = createMediaRemovalDialogOptions(payload);
  if (!options) return false;

  const result = parentWindow
    ? await showMessageBox(parentWindow, options)
    : await showMessageBox(options);

  return result?.response === REMOVE_MEDIA_RESPONSE;
}

function resolveRendererFile(rendererRoot, requestUrl) {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== 'cutline:' || url.hostname !== 'editor') return null;

    const decodedPath = decodeURIComponent(url.pathname);
    const root = path.resolve(rendererRoot);
    let filePath = path.resolve(root, `.${decodedPath || '/index.html'}`);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(root, 'index.html');
    }
    return fs.existsSync(filePath) ? filePath : null;
  } catch {
    return null;
  }
}

module.exports = {
  createNativeMediaDescriptor,
  createMediaRemovalDialogOptions,
  confirmMediaRemoval,
  getMediaContentType,
  normalizeMediaRemovalRequest,
  resolveRendererFile,
  SUPPORTED_MEDIA_EXTENSIONS,
};
