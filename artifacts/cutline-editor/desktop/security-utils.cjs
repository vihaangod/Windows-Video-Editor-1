const fs = require('node:fs');
const path = require('node:path');

const REMOVE_MEDIA_RESPONSE = 1;
const MAX_MEDIA_NAME_LENGTH = 120;
const MAX_CLIP_COUNT = 1_000_000;

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
  createMediaRemovalDialogOptions,
  confirmMediaRemoval,
  normalizeMediaRemovalRequest,
  resolveRendererFile,
};
