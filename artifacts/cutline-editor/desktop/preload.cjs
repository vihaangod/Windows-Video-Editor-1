const { contextBridge, ipcRenderer } = require('electron');

const MEDIA_REMOVAL_CHANNEL = 'cutline:confirm-media-removal';
const MAX_MEDIA_NAME_LENGTH = 120;
const MAX_CLIP_COUNT = 1_000_000;

contextBridge.exposeInMainWorld('cutlineDesktop', Object.freeze({
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
}));
