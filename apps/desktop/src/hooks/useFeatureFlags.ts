import { useEffect, useState } from 'react';
import type { FeatureFlagName } from '@spendstack/shared';
import { FEATURE_FLAGS } from '@spendstack/shared';

type FlagMap = Record<FeatureFlagName, boolean>;

/** Default flag state — all flags off — used before the IPC response arrives. */
const DEFAULT_FLAGS = Object.fromEntries(
  Object.keys(FEATURE_FLAGS).map((k) => [k, false]),
) as FlagMap;

/**
 * Fetches the resolved feature flags from the main process once on mount.
 * `flags` holds the current snapshot; `isReady` is false until the IPC response
 * (or fallback) has been applied — always check `isReady` before gating UI.
 *
 * @example
 * ```tsx
 * const { flags, isReady } = useFeatureFlags();
 * if (!isReady) return null;
 * if (flags.aiCategorisation) {
 *   // render AI panel
 * }
 * ```
 */
export function useFeatureFlags(): { flags: FlagMap; isReady: boolean } {
  const [flagState, setFlagState] = useState<FlagMap>(DEFAULT_FLAGS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      // Running outside Electron (e.g. plain browser dev mode) — keep defaults.
      setIsReady(true);
      return;
    }

    api
      .getFlags()
      .then((resolved) => {
        // Merge IPC payload into DEFAULT_FLAGS so every known key is always
        // present as a boolean, even if the payload is missing some keys or
        // contains unexpected ones from a version mismatch.
        const normalized: FlagMap = { ...DEFAULT_FLAGS };
        for (const key of Object.keys(DEFAULT_FLAGS) as FeatureFlagName[]) {
          if (key in resolved && typeof resolved[key] === 'boolean') {
            normalized[key] = resolved[key] as boolean;
          }
        }
        setFlagState(normalized);
        setIsReady(true);
      })
      .catch((err: unknown) => {
        // If the IPC call fails for any reason, fall back to all-off defaults.
        console.error('[useFeatureFlags] Failed to load feature flags:', err);
        setIsReady(true);
      });
  }, []);

  return { flags: flagState, isReady };
}
