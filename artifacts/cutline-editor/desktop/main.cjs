const path = require('node:path');
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
const { confirmMediaRemoval, resolveRendererFile } = require('./security-utils.cjs');

const APP_SCHEME = 'cutline';
const APP_HOST = 'editor';
const APP_PARTITION = 'persist:cutline-editor';
const MEDIA_REMOVAL_CHANNEL = 'cutline:confirm-media-removal';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || '';

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
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

  function registerAppProtocol() {
    const rendererRoot = path.resolve(__dirname, '..', 'dist', 'public');
    session.fromPartition(APP_PARTITION).protocol.handle(APP_SCHEME, async (request) => {
      const filePath = resolveRendererFile(rendererRoot, request.url);
      if (!filePath) return new Response('Not found', { status: 404 });
      try {
        return await net.fetch(pathToFileURL(filePath).href);
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
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    const startUrl = DEV_SERVER_URL || `${APP_SCHEME}://${APP_HOST}/`;
    void mainWindow.loadURL(startUrl);
  }

  ipcMain.handle(MEDIA_REMOVAL_CHANNEL, async (event, payload) => {
    if (event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame.url)) {
      return false;
    }

    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    return confirmMediaRemoval(
      (parentWindow, options) => parentWindow
        ? dialog.showMessageBox(parentWindow, options)
        : dialog.showMessageBox(options),
      ownerWindow,
      payload,
    );
  });

  app.whenReady().then(() => {
    if (!DEV_SERVER_URL) registerAppProtocol();
    createMainWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
