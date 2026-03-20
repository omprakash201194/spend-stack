/**
 * Feature flag framework for SpendStack.
 *
 * Flags gate unfinished or experimental functionality so that
 * incomplete features can be merged without impacting users.
 * Values are resolved in priority order:
 *   1. Runtime overrides (set programmatically)
 *   2. Environment variable `SPENDSTACK_FLAGS` (JSON object)
 *   3. Default values defined in the flag registry
 */

/** All known feature flags with their default values. */
export const FEATURE_FLAGS = {
  /** Enable the cloud-sync experimental UI. */
  cloudSync: false,
  /** Enable the AI-powered categorisation suggestion panel. */
  aiCategorisation: false,
  /** Enable the multi-currency display. */
  multiCurrency: false,
  /** Enable verbose diagnostic logging in production builds. */
  verboseLogs: false,
  /** Enable the balance and cashflow insights panel. */
  insightsEnabled: false,
  /** Enable AI-assisted insight generation (requires explicit user consent). */
  aiInsights: false,
  /** Enable optional PIN convenience unlock after primary authentication. */
  pinUnlock: false,
  /** Enable relationship-based privacy controls inside a family workspace. */
  familyPrivacyControls: false,
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;
export type FeatureFlagValue = boolean;

type FlagOverrides = Partial<Record<FeatureFlagName, FeatureFlagValue>>;

/**
 * Parses the `SPENDSTACK_FLAGS` environment variable.
 * Returns an empty object if the variable is absent or malformed.
 */
function parseEnvFlags(): FlagOverrides {
  const raw =
    typeof process !== 'undefined' &&
    typeof process.env !== 'undefined' &&
    process.env !== undefined
      ? process.env['SPENDSTACK_FLAGS']
      : undefined;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as FlagOverrides;
    }
  } catch {
    // silently ignore parse errors
  }
  return {};
}

/**
 * Creates a feature flag resolver.
 *
 * @example
 * ```ts
 * const flags = createFlagResolver({ aiCategorisation: true });
 * if (flags.isEnabled('aiCategorisation')) {
 *   // show AI panel
 * }
 * ```
 */
export function createFlagResolver(runtimeOverrides: FlagOverrides = {}) {
  const envFlags = parseEnvFlags();

  function isEnabled(flag: FeatureFlagName): boolean {
    if (flag in runtimeOverrides) return Boolean(runtimeOverrides[flag]);
    if (flag in envFlags) return Boolean(envFlags[flag]);
    return FEATURE_FLAGS[flag];
  }

  function getAll(): Record<FeatureFlagName, FeatureFlagValue> {
    return (Object.keys(FEATURE_FLAGS) as FeatureFlagName[]).reduce(
      (acc, key) => {
        acc[key] = isEnabled(key);
        return acc;
      },
      {} as Record<FeatureFlagName, FeatureFlagValue>,
    );
  }

  return { isEnabled, getAll };
}

export type FlagResolver = ReturnType<typeof createFlagResolver>;

/** Default singleton resolver (reads env vars at startup). */
export const flags = createFlagResolver();
