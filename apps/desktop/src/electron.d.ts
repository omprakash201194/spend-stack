/**
 * Type declarations for the narrow IPC bridge exposed by the preload script
 * via contextBridge.exposeInMainWorld('electronAPI', ...).
 *
 * Keep this file in sync with electron/preload.ts.
 */

import type { FeatureFlagName } from '@spendstack/shared';

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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
