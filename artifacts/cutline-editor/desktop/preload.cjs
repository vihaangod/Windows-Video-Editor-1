const { contextBridge, ipcRenderer } = require('electron');

const MEDIA_REMOVAL_CHANNEL = 'cutline:confirm-media-removal';
const MEDIA_PICK_CHANNEL = 'cutline:pick-media-files';
const MEDIA_RELEASE_CHANNEL = 'cutline:release-media-files';
const CLOSE_REQUESTED_CHANNEL = 'cutline:close-requested';
const CLOSE_CANCELLED_CHANNEL = 'cutline:close-cancelled';
const CLOSE_RESULT_CHANNEL = 'cutline:close-result';
const MAX_MEDIA_NAME_LENGTH = 120;
const MAX_CLIP_COUNT = 1_000_000;
const MAX_MEDIA_FILE_COUNT = 500;
const MEDIA_TOKEN_PATTERN = /^[a-f0-9-]{36}$/i;

const desktopBridge = Object.freeze({
  confirmMediaRemoval(details) {
    const fileName = typeof details?.fileName === 'string'
      ? details.fileName.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_MEDIA_NAME_LENGTH)
      : '';
    const clipCount = details?.clipCount;
    if (!fileName || !Number.isSafeInteger(clipCount) || clipCount < 0 || clipCount > MAX_CLIP_COUNT) {
      return Promise.resolve(false);
    }
    return ipcRenderer.invoke(MEDIA_REMOVAL_CHANNEL, { fileName, clipCount });
  },
  pickMediaFiles(kind) {
    const safeKind = kind === 'video' || kind === 'audio' ? kind : 'all';
    return ipcRenderer.invoke(MEDIA_PICK_CHANNEL, safeKind);
  },
  releaseMediaFiles(tokens) {
    const safeTokens = Array.isArray(tokens)
      ? tokens.filter((token) => typeof token === 'string' && MEDIA_TOKEN_PATTERN.test(token)).slice(0, MAX_MEDIA_FILE_COUNT)
      : [];
    return ipcRenderer.invoke(MEDIA_RELEASE_CHANNEL, safeTokens);
  },
  onCloseRequested(listener) {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, requestId) => {
      if (typeof requestId === 'string' && MEDIA_TOKEN_PATTERN.test(requestId)) listener(requestId);
    };
    ipcRenderer.on(CLOSE_REQUESTED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(CLOSE_REQUESTED_CHANNEL, handler);
  },
  onCloseCancelled(listener) {
    if (typeof listener !== 'function') return () => {};
    const handler = () => listener();
    ipcRenderer.on(CLOSE_CANCELLED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(CLOSE_CANCELLED_CHANNEL, handler);
  },
  completeCloseRequest(requestId, saved) {
    if (typeof requestId !== 'string' || !MEDIA_TOKEN_PATTERN.test(requestId) || typeof saved !== 'boolean') {
      return Promise.resolve(false);
    }
    return ipcRenderer.invoke(CLOSE_RESULT_CHANNEL, { requestId, saved });
  },
});

contextBridge.exposeInMainWorld('cutlineDesktop', desktopBridge);
