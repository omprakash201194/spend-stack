import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal, safe API to the renderer process.
contextBridge.exposeInMainWorld('electronAPI', {
  onMainProcessMessage: (callback: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message);
    };
    ipcRenderer.on('main-process-message', handler);
    // Return a cleanup function so callers can remove the listener.
    return () => {
      ipcRenderer.removeListener('main-process-message', handler);
    };
  },
});
