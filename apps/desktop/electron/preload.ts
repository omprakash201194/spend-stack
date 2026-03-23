import { contextBridge, ipcRenderer } from 'electron';
import type { FeatureFlagName } from '@spendstack/shared';

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
  getFlags: (): Promise<Record<FeatureFlagName, boolean>> =>
    ipcRenderer.invoke('get-feature-flags') as Promise<Record<FeatureFlagName, boolean>>,

  /**
   * Asks the main process to export a diagnostics bundle to a user-chosen
   * file path via a native save dialog.
   */
  exportDiagnostics: (): Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('export-diagnostics') as Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>,
});
