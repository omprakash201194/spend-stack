import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeDiagnosticsBundle } from './diagnostics-exporter.js';
import type { DiagnosticsBundle } from '@spendstack/shared';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spendstack-diag-test-'));
}

function makeBundle(overrides: Partial<DiagnosticsBundle> = {}): DiagnosticsBundle {
  return {
    bundleId: 'diag-abc123',
    generatedAt: '2024-01-01T00:00:00.000Z',
    appVersion: '0.1.0',
    runtimeInfo: { nodeVersion: 'v22.0.0', platform: 'linux', arch: 'x64' },
    featureFlags: {
      cloudSync: false,
      aiCategorisation: false,
      multiCurrency: false,
      verboseLogs: false,
      insightsEnabled: false,
      aiInsights: false,
      pinUnlock: false,
      familyPrivacyControls: false,
      diagnosticsExport: true,
    },
    auditSummary: {
      totalEvents: 0,
      eventsByType: {},
      firstEventAt: null,
      lastEventAt: null,
    },
    extraContext: {},
    ...overrides,
  };
}

describe('writeDiagnosticsBundle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the bundle as pretty-printed JSON to the given path', () => {
    const bundle = makeBundle();
    const filePath = path.join(tmpDir, 'diagnostics.json');

    const result = writeDiagnosticsBundle(bundle, filePath);

    expect(result.success).toBe(true);
    expect(result.filePath).toBe(filePath);
    expect(result.error).toBeUndefined();

    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content) as DiagnosticsBundle;
    expect(parsed.bundleId).toBe('diag-abc123');
    expect(parsed.appVersion).toBe('0.1.0');
  });

  it('creates intermediate directories when they do not exist', () => {
    const bundle = makeBundle();
    const filePath = path.join(tmpDir, 'nested', 'deep', 'diagnostics.json');

    const result = writeDiagnosticsBundle(bundle, filePath);

    expect(result.success).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('returns success: false with an error message when the path is invalid', () => {
    const bundle = makeBundle();
    // Writing inside an existing file as if it were a directory causes an ENOTDIR error.
    const existingFile = path.join(tmpDir, 'not-a-dir.txt');
    fs.writeFileSync(existingFile, 'data', 'utf8');
    const invalidPath = path.join(existingFile, 'sub', 'diagnostics.json');

    const result = writeDiagnosticsBundle(bundle, invalidPath);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.filePath).toBeUndefined();
  });

  it('never throws — wraps all errors in the result', () => {
    const bundle = makeBundle();
    const existingFile = path.join(tmpDir, 'not-a-dir2.txt');
    fs.writeFileSync(existingFile, 'data', 'utf8');
    expect(() =>
      writeDiagnosticsBundle(bundle, path.join(existingFile, 'sub', 'diagnostics.json')),
    ).not.toThrow();
  });

  it('the written file contains all top-level bundle fields', () => {
    const bundle = makeBundle({ appVersion: '1.2.3', bundleId: 'diag-test-99' });
    const filePath = path.join(tmpDir, 'full.json');

    writeDiagnosticsBundle(bundle, filePath);

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DiagnosticsBundle;
    expect(parsed.bundleId).toBe('diag-test-99');
    expect(parsed.appVersion).toBe('1.2.3');
    expect(parsed.runtimeInfo).toBeDefined();
    expect(parsed.featureFlags).toBeDefined();
    expect(parsed.auditSummary).toBeDefined();
    expect(parsed.extraContext).toBeDefined();
  });

  it('overwrites an existing file at the same path', () => {
    const filePath = path.join(tmpDir, 'diag.json');
    fs.writeFileSync(filePath, '{"old":"data"}', 'utf8');

    const bundle = makeBundle({ bundleId: 'diag-new' });
    writeDiagnosticsBundle(bundle, filePath);

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DiagnosticsBundle;
    expect(parsed.bundleId).toBe('diag-new');
  });
});
