import { describe, it, expect } from 'vitest';
import {
  createAuditEvent,
  appendAuditEvent,
  formatAuditHistory,
  AUDIT_SCHEMA_VERSION,
} from './audit.js';
import type { AuditEvent, AuditLog } from './audit.js';

// ── createAuditEvent ──────────────────────────────────────────────────────────

describe('createAuditEvent', () => {
  it('assigns schemaVersion 1', () => {
    const event = createAuditEvent({
      type: 'user.created',
      actorId: 'user-1',
      resourceType: 'user',
      resourceId: 'user-1',
      metadata: {},
    });
    expect(event.schemaVersion).toBe(AUDIT_SCHEMA_VERSION);
    expect(event.schemaVersion).toBe(1);
  });

  it('generates a non-empty id', () => {
    const event = createAuditEvent({
      type: 'user.created',
      actorId: 'user-1',
      resourceType: 'user',
      resourceId: 'user-1',
      metadata: {},
    });
    expect(typeof event.id).toBe('string');
    expect(event.id.length).toBeGreaterThan(0);
  });

  it('generates unique ids for each event', () => {
    const a = createAuditEvent({
      type: 'import.started',
      actorId: 'user-1',
      resourceType: 'import',
      resourceId: 'file-1',
      metadata: {},
    });
    const b = createAuditEvent({
      type: 'import.started',
      actorId: 'user-1',
      resourceType: 'import',
      resourceId: 'file-2',
      metadata: {},
    });
    expect(a.id).not.toBe(b.id);
  });

  it('sets a valid ISO 8601 timestamp', () => {
    const event = createAuditEvent({
      type: 'user.authenticated',
      actorId: 'user-1',
      resourceType: 'user',
      resourceId: 'user-1',
      metadata: {},
    });
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('preserves all caller-supplied fields', () => {
    const event = createAuditEvent({
      type: 'import.completed',
      actorId: 'user-42',
      resourceType: 'import',
      resourceId: 'file-99',
      correlationId: 'corr-abc',
      metadata: { rowsImported: 10, parserId: 'icici-csv-v1' },
    });
    expect(event.type).toBe('import.completed');
    expect(event.actorId).toBe('user-42');
    expect(event.resourceType).toBe('import');
    expect(event.resourceId).toBe('file-99');
    expect(event.correlationId).toBe('corr-abc');
    expect(event.metadata['rowsImported']).toBe(10);
  });

  it('creates event with system actor for automated actions', () => {
    const event = createAuditEvent({
      type: 'transaction.categorized',
      actorId: 'system',
      resourceType: 'transaction',
      resourceId: 'tx-1',
      metadata: { ruleId: 'rule-5' },
    });
    expect(event.actorId).toBe('system');
  });

  it('does not require correlationId', () => {
    const event = createAuditEvent({
      type: 'user.pin_set',
      actorId: 'user-1',
      resourceType: 'user',
      resourceId: 'user-1',
      metadata: {},
    });
    expect(event.correlationId).toBeUndefined();
  });
});

// ── appendAuditEvent ──────────────────────────────────────────────────────────

describe('appendAuditEvent', () => {
  it('returns a new log with the event appended', () => {
    const emptyLog: AuditLog = [];
    const event = createAuditEvent({
      type: 'user.created',
      actorId: 'user-1',
      resourceType: 'user',
      resourceId: 'user-1',
      metadata: {},
    });

    const updated = appendAuditEvent(emptyLog, event);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toBe(event);
  });

  it('does not mutate the original log', () => {
    const original: AuditLog = [
      createAuditEvent({
        type: 'user.created',
        actorId: 'user-1',
        resourceType: 'user',
        resourceId: 'user-1',
        metadata: {},
      }),
    ];
    const event = createAuditEvent({
      type: 'user.authenticated',
      actorId: 'user-1',
      resourceType: 'user',
      resourceId: 'user-1',
      metadata: {},
    });

    appendAuditEvent(original, event);
    expect(original).toHaveLength(1);
  });

  it('preserves existing events in order', () => {
    const first = createAuditEvent({
      type: 'import.started',
      actorId: 'user-1',
      resourceType: 'import',
      resourceId: 'file-1',
      metadata: {},
    });
    const second = createAuditEvent({
      type: 'import.completed',
      actorId: 'user-1',
      resourceType: 'import',
      resourceId: 'file-1',
      metadata: {},
    });

    let log: AuditLog = [];
    log = appendAuditEvent(log, first);
    log = appendAuditEvent(log, second);

    expect(log).toHaveLength(2);
    expect(log[0]).toBe(first);
    expect(log[1]).toBe(second);
  });
});

// ── formatAuditHistory ────────────────────────────────────────────────────────

describe('formatAuditHistory', () => {
  it('returns an empty string for an empty log', () => {
    expect(formatAuditHistory([])).toBe('');
  });

  it('formats a single event correctly', () => {
    const event: AuditEvent = {
      id: 'abc123',
      schemaVersion: 1,
      type: 'import.completed',
      actorId: 'user-1',
      resourceType: 'import',
      resourceId: 'file-99',
      timestamp: '2024-01-05T10:00:00.000Z',
      metadata: {},
    };

    const result = formatAuditHistory([event]);
    expect(result).toBe('[2024-01-05T10:00:00.000Z] user-1 → import.completed (import:file-99)');
  });

  it('joins multiple events with newlines', () => {
    const events: AuditEvent[] = [
      {
        id: 'e1',
        schemaVersion: 1,
        type: 'import.started',
        actorId: 'user-1',
        resourceType: 'import',
        resourceId: 'file-1',
        timestamp: '2024-01-05T09:00:00.000Z',
        metadata: {},
      },
      {
        id: 'e2',
        schemaVersion: 1,
        type: 'import.completed',
        actorId: 'user-1',
        resourceType: 'import',
        resourceId: 'file-1',
        timestamp: '2024-01-05T09:01:00.000Z',
        metadata: {},
      },
    ];

    const result = formatAuditHistory(events);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('import.started');
    expect(lines[1]).toContain('import.completed');
  });

  it('includes the system actor label', () => {
    const event: AuditEvent = {
      id: 'sys1',
      schemaVersion: 1,
      type: 'transaction.categorized',
      actorId: 'system',
      resourceType: 'transaction',
      resourceId: 'tx-5',
      timestamp: '2024-02-01T12:00:00.000Z',
      metadata: {},
    };

    const result = formatAuditHistory([event]);
    expect(result).toContain('system →');
  });
});

// ── Privacy audit event types ─────────────────────────────────────────────────

describe('Privacy and workspace audit events', () => {
  it('creates a workspace.member_removed event', () => {
    const event = createAuditEvent({
      type: 'workspace.member_removed',
      actorId: 'u-owner',
      resourceType: 'workspace',
      resourceId: 'ws-1',
      metadata: { removedUserId: 'u-member' },
    });
    expect(event.type).toBe('workspace.member_removed');
    expect(event.metadata['removedUserId']).toBe('u-member');
  });

  it('creates a privacy.rule_created event', () => {
    const event = createAuditEvent({
      type: 'privacy.rule_created',
      actorId: 'u-owner',
      resourceType: 'privacy_rule',
      resourceId: 'rule-42',
      metadata: { scope: 'shared', resourceType: 'account' },
    });
    expect(event.type).toBe('privacy.rule_created');
    expect(event.metadata['scope']).toBe('shared');
  });

  it('creates a privacy.rule_updated event', () => {
    const event = createAuditEvent({
      type: 'privacy.rule_updated',
      actorId: 'u-owner',
      resourceType: 'privacy_rule',
      resourceId: 'rule-42',
      metadata: { previousScope: 'shared', newScope: 'workspace' },
    });
    expect(event.type).toBe('privacy.rule_updated');
  });

  it('creates a privacy.rule_deleted event', () => {
    const event = createAuditEvent({
      type: 'privacy.rule_deleted',
      actorId: 'u-owner',
      resourceType: 'privacy_rule',
      resourceId: 'rule-42',
      metadata: {},
    });
    expect(event.type).toBe('privacy.rule_deleted');
  });

  it('creates a privacy.access_denied event', () => {
    const event = createAuditEvent({
      type: 'privacy.access_denied',
      actorId: 'u-viewer',
      resourceType: 'account',
      resourceId: 'acc-1',
      metadata: { reason: 'scope_shared', workspaceId: 'ws-1' },
    });
    expect(event.type).toBe('privacy.access_denied');
    expect(event.metadata['reason']).toBe('scope_shared');
  });
});
