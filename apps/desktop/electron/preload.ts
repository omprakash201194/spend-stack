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

  /**
   * Returns a snapshot of all resolved feature flags from the main process.
   * The main process is the authoritative source because it has full access to
   * environment variables and runtime overrides.
   */
  getFlags: (): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('get-feature-flags'),
});
