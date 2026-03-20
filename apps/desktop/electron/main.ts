import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
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

function resolvePreloadPath(): string {
  const candidates = ['preload.mjs', 'preload.js'];
  for (const candidate of candidates) {
    const fullPath = path.join(__dirname, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return path.join(__dirname, 'preload.js');
}

function createWindow() {
  log.info('Creating main window');

  const isDev = VITE_DEV_SERVER_URL !== undefined;

  const preloadPath = resolvePreloadPath();
  log.info('Resolved preload script', { preloadPath });
  if (isDev) {
    console.log('[main] preload script:', preloadPath);
  }

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'SpendStack',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error('Renderer failed to load', {
      errorCode,
      errorDescription,
      validatedURL,
    });
    if (isDev) {
      console.error('[main] did-fail-load', { errorCode, errorDescription, validatedURL });
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone', { details });
    if (isDev) {
      console.error('[main] render-process-gone', details);
    }
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelName = level === 0 ? 'info' : level === 1 ? 'warn' : 'error';
    // Mirror renderer console messages into the main process logs for easier debugging.
    log.info('Renderer console', {
      level: levelName,
      message,
      line,
      sourceId,
    });

    if (isDev) {
      const text = `[renderer:${levelName}] ${message} (${sourceId}:${line})`;
      if (levelName === 'error') console.error(text);
      else if (levelName === 'warn') console.warn(text);
      else console.log(text);
    }
  });

  win.webContents.on('dom-ready', () => {
    log.info('Renderer DOM ready', { url: win?.webContents.getURL() });
    if (isDev) {
      console.log('[main] dom-ready', win?.webContents.getURL());
    }
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toISOString());
    log.info('Renderer finished load', { url: win?.webContents.getURL() });
    if (isDev) {
      console.log('[main] did-finish-load', win?.webContents.getURL());
    }
  });

  if (VITE_DEV_SERVER_URL !== undefined) {
    log.info('Loading renderer from dev server', { url: VITE_DEV_SERVER_URL });
    console.log('[main] loading dev URL:', VITE_DEV_SERVER_URL);
    win.loadURL(VITE_DEV_SERVER_URL);
    // Dev-time help: opt-in DevTools popup for debugging.
    if (process.env['SPENDSTACK_OPEN_DEVTOOLS'] === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    log.info('Loading renderer from packaged dist', { dist: process.env['DIST'] });
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
