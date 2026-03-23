/**
 * Type declarations for the narrow IPC bridge exposed by the preload script
 * via contextBridge.exposeInMainWorld('electronAPI', ...).
 *
 * Keep this file in sync with electron/preload.ts.
 */

import type { FeatureFlagName } from '@spendstack/shared';

export interface DiagnosticsExportResult {
  success: boolean;
  /** True when the user dismissed the save dialog without choosing a path. */
  canceled?: boolean;
  /** Absolute path of the file that was written (present on success). */
  filePath?: string;
  /** Human-readable error description (present on failure). */
  error?: string;
}

export interface ElectronAPI {
  /**
   * Subscribe to a timestamped message sent by the main process after the
   * renderer finishes loading.  The returned cleanup function removes the
   * listener.
   */
  onMainProcessMessage: (callback: (message: string) => void) => () => void;

  /**
   * Returns a snapshot of all resolved feature flags.
   * Flags are resolved in priority order: runtime overrides → env var → defaults.
   */
  getFlags: () => Promise<Record<FeatureFlagName, boolean>>;

  /**
   * Opens a native save dialog and exports a diagnostics bundle to the chosen
   * path.  Returns the result including success/failure and the written path.
   */
  exportDiagnostics: () => Promise<DiagnosticsExportResult>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
