const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
} = require('electron');
const {
  confirmMediaRemoval,
  createContentSecurityPolicy,
  createNativeMediaDescriptor,
  resolveRendererFile,
  SUPPORTED_MEDIA_EXTENSIONS,
} = require('./security-utils.cjs');

const APP_SCHEME = 'cutline';
const APP_HOST = 'editor';
const APP_PARTITION = 'persist:cutline-editor';
const MEDIA_REMOVAL_CHANNEL = 'cutline:confirm-media-removal';
const MEDIA_PICK_CHANNEL = 'cutline:pick-media-files';
const MEDIA_RELEASE_CHANNEL = 'cutline:release-media-files';
const CLOSE_REQUESTED_CHANNEL = 'cutline:close-requested';
const CLOSE_CANCELLED_CHANNEL = 'cutline:close-cancelled';
const CLOSE_RESULT_CHANNEL = 'cutline:close-result';
const CLOSE_SAVE_TIMEOUT_MS = 15_000;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || '';
function getConfiguredSupabaseOrigin() {
  if (process.env.CUTLINE_SUPABASE_ORIGIN) return process.env.CUTLINE_SUPABASE_ORIGIN;
  try {
    const configPath = path.join(__dirname, '..', 'dist', 'public', 'cutline-desktop-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return typeof config.supabaseOrigin === 'string' ? config.supabaseOrigin : '';
  } catch {
    return '';
  }
}
const CONTENT_SECURITY_POLICY = createContentSecurityPolicy(getConfiguredSupabaseOrigin());
const MEDIA_EXTENSIONS = [
  ...new Set([...SUPPORTED_MEDIA_EXTENSIONS, 'flac']),
];

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}]);

app.setName('Cutline');
app.setPath('userData', path.join(app.getPath('appData'), 'Cutline'));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow = null;
  let devServerOrigin = null;
  const selectedMediaFiles = new Map();
  let allowWindowClose = false;
  let closeAttemptPending = false;
  let closeResolutionInProgress = false;
  let activeCloseRequestId = null;
  let closeRequestTimeout = null;

  if (DEV_SERVER_URL) {
    const parsedDevUrl = new URL(DEV_SERVER_URL);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(parsedDevUrl.hostname)) {
      throw new Error('The Electron development URL must use a loopback host.');
    }
    devServerOrigin = parsedDevUrl.origin;
  }

  function isTrustedRendererUrl(candidate) {
    try {
      const url = new URL(candidate);
      if (devServerOrigin) return url.origin === devServerOrigin;
      return url.protocol === `${APP_SCHEME}:` && url.hostname === APP_HOST;
    } catch {
      return false;
    }
  }

  function isTrustedIpcEvent(event) {
    return Boolean(
      event.senderFrame &&
      event.senderFrame === event.sender.mainFrame &&
      isTrustedRendererUrl(event.senderFrame.url)
    );
  }

  function createLocalMediaResponse(request, mediaFile) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    try {
      const stats = fs.statSync(mediaFile.filePath);
      if (!stats.isFile() || stats.size !== mediaFile.byteSize) {
        return new Response('Media file is no longer available', { status: 404 });
      }

      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': String(stats.size),
        'Content-Type': mediaFile.mimeType,
        'X-Content-Type-Options': 'nosniff',
      });
      const requestOrigin = request.headers.get('origin');
      if (devServerOrigin && requestOrigin === devServerOrigin) {
        headers.set('Access-Control-Allow-Origin', devServerOrigin);
        headers.set('Vary', 'Origin');
      }

      const body = request.method === 'HEAD'
        ? null
        : Readable.toWeb(fs.createReadStream(mediaFile.filePath));
      return new Response(body, { status: 200, headers });
    } catch {
      return new Response('Media file is no longer available', { status: 404 });
    }
  }

  async function finishWindowClose(ownerWindow, requestId, saved) {
    if (
      mainWindow !== ownerWindow ||
      activeCloseRequestId !== requestId ||
      closeResolutionInProgress
    ) return false;
    closeResolutionInProgress = true;
    if (closeRequestTimeout) clearTimeout(closeRequestTimeout);
    closeRequestTimeout = null;

    if (!saved) {
      const result = await dialog.showMessageBox(ownerWindow, {
        type: 'warning',
        title: 'Project save did not finish',
        message: 'Cutline could not confirm that your latest editing changes were saved.',
        detail: 'Keep the app open to try saving again, or close without saving those latest changes.',
        buttons: ['Keep Cutline open', 'Close without saving'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response !== 1 || mainWindow !== ownerWindow) {
        if (!ownerWindow.isDestroyed()) ownerWindow.webContents.send(CLOSE_CANCELLED_CHANNEL);
        activeCloseRequestId = null;
        closeAttemptPending = false;
        closeResolutionInProgress = false;
        return true;
      }
    }

    activeCloseRequestId = null;
    closeAttemptPending = false;
    closeResolutionInProgress = false;
    allowWindowClose = true;
    ownerWindow.close();
    return true;
  }

  function registerAppProtocol() {
    const rendererRoot = path.resolve(__dirname, '..', 'dist', 'public');
    session.fromPartition(APP_PARTITION).protocol.handle(APP_SCHEME, async (request) => {
      let requestUrl;
      try {
        requestUrl = new URL(request.url);
      } catch {
        return new Response('Not found', { status: 404 });
      }

      const mediaMatch = requestUrl.pathname.match(/^\/local-media\/([a-f0-9-]{36})$/i);
      if (requestUrl.protocol === `${APP_SCHEME}:` && requestUrl.hostname === APP_HOST && mediaMatch) {
        const mediaFile = selectedMediaFiles.get(mediaMatch[1]);
        return mediaFile
          ? createLocalMediaResponse(request, mediaFile)
          : new Response('Not found', { status: 404 });
      }

      const filePath = resolveRendererFile(rendererRoot, request.url);
      if (!filePath) return new Response('Not found', { status: 404 });
      try {
        const response = await net.fetch(pathToFileURL(filePath).href);
        if (path.extname(filePath).toLowerCase() !== '.html') return response;
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
  }

  function createMainWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 920,
      minHeight: 640,
      autoHideMenuBar: true,
      backgroundColor: '#17191d',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: APP_PARTITION,
      },
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
      if (!isTrustedRendererUrl(targetUrl)) event.preventDefault();
    });
    mainWindow.on('close', (event) => {
      if (allowWindowClose) return;
      event.preventDefault();
      if (closeAttemptPending) return;

      closeAttemptPending = true;
      activeCloseRequestId = randomUUID();
      const requestId = activeCloseRequestId;
      const closingWindow = mainWindow;
      closeRequestTimeout = setTimeout(() => {
        void finishWindowClose(closingWindow, requestId, false);
      }, CLOSE_SAVE_TIMEOUT_MS);
      closingWindow.webContents.send(CLOSE_REQUESTED_CHANNEL, requestId);
    });
    mainWindow.on('closed', () => {
      if (closeRequestTimeout) clearTimeout(closeRequestTimeout);
      closeRequestTimeout = null;
      activeCloseRequestId = null;
      closeAttemptPending = false;
      closeResolutionInProgress = false;
      allowWindowClose = false;
      mainWindow = null;
    });

    const startUrl = DEV_SERVER_URL || `${APP_SCHEME}://${APP_HOST}/`;
    void mainWindow.loadURL(startUrl);
  }

  ipcMain.handle(MEDIA_REMOVAL_CHANNEL, async (event, payload) => {
    if (!isTrustedIpcEvent(event)) return false;

    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    return confirmMediaRemoval(
      (parentWindow, options) => parentWindow
        ? dialog.showMessageBox(parentWindow, options)
        : dialog.showMessageBox(options),
      ownerWindow,
      payload,
    );
  });

  ipcMain.handle(MEDIA_PICK_CHANNEL, async (event, requestedKind) => {
    if (!isTrustedIpcEvent(event)) return [];

    const kind = requestedKind === 'video' || requestedKind === 'audio' ? requestedKind : 'all';
    const videoExtensions = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm']);
    const audioExtensions = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav']);
    const filteredExtensions = MEDIA_EXTENSIONS.filter((extension) =>
      kind === 'video' ? videoExtensions.has(extension) :
        kind === 'audio' ? audioExtensions.has(extension) : true,
    );
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: kind === 'video' ? 'Add video clips to Cutline' : kind === 'audio' ? 'Add audio to Cutline' : 'Import media into Cutline',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: kind === 'video' ? 'Video files' : kind === 'audio' ? 'Audio files' : 'Supported media', extensions: filteredExtensions },
        ...(kind === 'all' ? [{ name: 'All files', extensions: ['*'] }] : []),
      ],
    });
    if (result.canceled) return [];

    return result.filePaths.flatMap((filePath) => {
      const token = randomUUID();
      const descriptor = createNativeMediaDescriptor(filePath, token);
      if (!descriptor) return [];
      selectedMediaFiles.set(token, descriptor);
      return [{
        token,
        name: descriptor.fileName,
        mimeType: descriptor.mimeType,
        byteSize: descriptor.byteSize,
        url: `${APP_SCHEME}://${APP_HOST}/local-media/${token}`,
      }];
    });
  });

  ipcMain.handle(MEDIA_RELEASE_CHANNEL, (event, tokens) => {
    if (!isTrustedIpcEvent(event) || !Array.isArray(tokens) || tokens.length > 500) return false;
    for (const token of tokens) {
      if (typeof token === 'string') selectedMediaFiles.delete(token);
    }
    return true;
  });

  ipcMain.handle(CLOSE_RESULT_CHANNEL, async (event, result) => {
    if (!isTrustedIpcEvent(event) || !result || typeof result !== 'object') return false;
    if (typeof result.requestId !== 'string' || typeof result.saved !== 'boolean') return false;
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (!ownerWindow) return false;
    return finishWindowClose(ownerWindow, result.requestId, result.saved);
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    createMainWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
