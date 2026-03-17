import { describe, it, expect } from 'vitest';
import { buildDiagnosticsBundle } from './diagnostics.js';
import { createAuditEvent, appendAuditEvent } from './audit.js';
import type { AuditLog } from './audit.js';
import type { FeatureFlagName, FeatureFlagValue } from './feature-flags.js';

const MOCK_FLAGS: Record<FeatureFlagName, FeatureFlagValue> = {
  cloudSync: false,
  aiCategorisation: false,
  multiCurrency: false,
  verboseLogs: false,
};

// ── buildDiagnosticsBundle ────────────────────────────────────────────────────

describe('buildDiagnosticsBundle', () => {
  it('returns a bundle with a unique bundleId prefixed with "diag-"', () => {
    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    expect(bundle.bundleId).toMatch(/^diag-/);
  });

  it('generates unique bundleIds on each call', () => {
    const a = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    const b = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    expect(a.bundleId).not.toBe(b.bundleId);
  });

  it('includes a valid ISO 8601 generatedAt timestamp', () => {
    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    expect(bundle.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('preserves the appVersion', () => {
    const bundle = buildDiagnosticsBundle({
      appVersion: '1.2.3',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    expect(bundle.appVersion).toBe('1.2.3');
  });

  it('includes runtimeInfo with nodeVersion, platform, arch', () => {
    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    expect(typeof bundle.runtimeInfo.nodeVersion).toBe('string');
    expect(typeof bundle.runtimeInfo.platform).toBe('string');
    expect(typeof bundle.runtimeInfo.arch).toBe('string');
    expect(bundle.runtimeInfo.nodeVersion).toMatch(/^v\d+/);
  });

  it('includes the feature flags snapshot', () => {
    const flags: Record<FeatureFlagName, FeatureFlagValue> = {
      ...MOCK_FLAGS,
      aiCategorisation: true,
    };
    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: flags,
      auditLog: [],
    });
    expect(bundle.featureFlags['aiCategorisation']).toBe(true);
    expect(bundle.featureFlags['cloudSync']).toBe(false);
  });

  it('summarizes an empty audit log correctly', () => {
    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    expect(bundle.auditSummary.totalEvents).toBe(0);
    expect(bundle.auditSummary.eventsByType).toEqual({});
    expect(bundle.auditSummary.firstEventAt).toBeNull();
    expect(bundle.auditSummary.lastEventAt).toBeNull();
  });

  it('summarizes a non-empty audit log correctly', () => {
    let log: AuditLog = [];
    log = appendAuditEvent(
      log,
      createAuditEvent({
        type: 'import.started',
        actorId: 'user-1',
        resourceType: 'import',
        resourceId: 'file-1',
        metadata: {},
      }),
    );
    log = appendAuditEvent(
      log,
      createAuditEvent({
        type: 'import.completed',
        actorId: 'user-1',
        resourceType: 'import',
        resourceId: 'file-1',
        metadata: {},
      }),
    );
    log = appendAuditEvent(
      log,
      createAuditEvent({
        type: 'import.started',
        actorId: 'user-1',
        resourceType: 'import',
        resourceId: 'file-2',
        metadata: {},
      }),
    );

    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: log,
    });

    expect(bundle.auditSummary.totalEvents).toBe(3);
    expect(bundle.auditSummary.eventsByType['import.started']).toBe(2);
    expect(bundle.auditSummary.eventsByType['import.completed']).toBe(1);
    expect(bundle.auditSummary.firstEventAt).toBe(log[0]?.timestamp);
    expect(bundle.auditSummary.lastEventAt).toBe(log[2]?.timestamp);
  });

  it('redacts sensitive fields in extraContext', () => {
    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
      extraContext: {
        lastImportFileId: 'file-123',
        apiKey: 'super-secret-key',
        token: 'bearer-token-xyz',
      },
    });

    expect(bundle.extraContext['lastImportFileId']).toBe('file-123');
    expect(bundle.extraContext['apiKey']).toBe('[REDACTED]');
    expect(bundle.extraContext['token']).toBe('[REDACTED]');
  });

  it('uses an empty object when extraContext is omitted', () => {
    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    expect(bundle.extraContext).toEqual({});
  });

  it('does not include raw audit event payloads in the bundle', () => {
    // The bundle should contain only a summary — not the raw log array.
    const bundle = buildDiagnosticsBundle({
      appVersion: '0.1.0',
      featureFlags: MOCK_FLAGS,
      auditLog: [],
    });
    expect('auditLog' in bundle).toBe(false);
  });
});
