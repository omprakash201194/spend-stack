import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal, safe API to the renderer process.
contextBridge.exposeInMainWorld('electronAPI', {
  onMainProcessMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('main-process-message', (_event, message: string) => {
      callback(message);
    });
  },
});
