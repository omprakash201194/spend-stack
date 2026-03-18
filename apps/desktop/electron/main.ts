import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createLogger, flags } from '@spendstack/shared';
import { createFileLogSink } from '@spendstack/infrastructure';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env['DIST'] = path.join(__dirname, '../dist');
process.env['VITE_PUBLIC'] = app.isPackaged
  ? process.env['DIST']!
  : path.join(process.env['DIST']!, '../public');

// Initialise structured logger backed by a rotating file sink.
const logDir = path.join(app.getPath('userData'), 'logs');
const log = createLogger({
  context: 'main',
  sink: createFileLogSink({ logDir }),
});

let win: BrowserWindow | null = null;

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
  log.info('Creating main window');

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'SpendStack',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toISOString());
  });

  if (VITE_DEV_SERVER_URL !== undefined) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env['DIST']!, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    log.info('All windows closed — quitting');
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Expose all resolved feature flags to the renderer process.
ipcMain.handle('get-feature-flags', () => flags.getAll());

app.whenReady().then(() => {
  log.info('Application ready', { version: app.getVersion() });
  createWindow();
}).catch((err: unknown) => {
  log.error('Application failed to initialise', { error: String(err) });
});
