import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFlagResolver, FEATURE_FLAGS } from './feature-flags.js';
import type { FeatureFlagName } from './feature-flags.js';

describe('createFlagResolver', () => {
  beforeEach(() => {
    delete process.env['SPENDSTACK_FLAGS'];
  });

  afterEach(() => {
    delete process.env['SPENDSTACK_FLAGS'];
  });

  it('returns false for all flags by default', () => {
    const resolver = createFlagResolver();
    for (const flag of Object.keys(FEATURE_FLAGS) as FeatureFlagName[]) {
      expect(resolver.isEnabled(flag)).toBe(false);
    }
  });

  it('runtime override enables a flag', () => {
    const resolver = createFlagResolver({ aiCategorisation: true });
    expect(resolver.isEnabled('aiCategorisation')).toBe(true);
    expect(resolver.isEnabled('cloudSync')).toBe(false);
  });

  it('runtime override takes precedence over env var', () => {
    process.env['SPENDSTACK_FLAGS'] = JSON.stringify({ cloudSync: true });
    const resolver = createFlagResolver({ cloudSync: false });
    expect(resolver.isEnabled('cloudSync')).toBe(false);
  });

  it('reads flags from SPENDSTACK_FLAGS env var', () => {
    process.env['SPENDSTACK_FLAGS'] = JSON.stringify({ verboseLogs: true });
    const resolver = createFlagResolver();
    expect(resolver.isEnabled('verboseLogs')).toBe(true);
    expect(resolver.isEnabled('cloudSync')).toBe(false);
  });

  it('ignores malformed SPENDSTACK_FLAGS env var', () => {
    process.env['SPENDSTACK_FLAGS'] = 'not-valid-json';
    const resolver = createFlagResolver();
    expect(resolver.isEnabled('cloudSync')).toBe(false);
  });

  it('getAll returns a snapshot of all resolved flags', () => {
    const resolver = createFlagResolver({ multiCurrency: true });
    const all = resolver.getAll();
    expect(all).toMatchObject({
      multiCurrency: true,
      cloudSync: false,
    });
    expect(Object.keys(all)).toEqual(Object.keys(FEATURE_FLAGS));
  });
});
