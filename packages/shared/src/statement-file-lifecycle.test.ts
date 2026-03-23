import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_RETENTION_DAYS,
  createStatementFileRecord,
  computeDeleteAfterAt,
  isExpired,
  findExpiredFiles,
  markDeleted,
  markDeletionFailed,
  markSkipped,
  runCleanup,
  reconcileOnStartup,
} from './statement-file-lifecycle.js';
import type { StatementFileRecord, FileDeleter } from './statement-file-lifecycle.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a date that is `days` days in the past relative to now. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/** Returns a date that is `days` days in the future relative to now. */
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ── DEFAULT_RETENTION_DAYS ────────────────────────────────────────────────────

describe('DEFAULT_RETENTION_DAYS', () => {
  it('is 7', () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(7);
  });
});

// ── createStatementFileRecord ─────────────────────────────────────────────────

describe('createStatementFileRecord', () => {
  it('creates a record with auto_delete policy by default', () => {
    const record = createStatementFileRecord('id-1', 'statement.csv');
    expect(record.id).toBe('id-1');
    expect(record.fileName).toBe('statement.csv');
    expect(record.retentionPolicy).toBe('auto_delete');
    expect(record.deletionStatus).toBe('pending');
  });

  it('sets deleteAfterAt based on uploadedAt + retentionDays', () => {
    const uploadedAt = new Date('2024-01-01T00:00:00.000Z');
    const record = createStatementFileRecord('id-1', 'file.csv', 'auto_delete', uploadedAt, 7);
    expect(record.deleteAfterAt).toEqual(new Date('2024-01-08T00:00:00.000Z'));
  });

  it('sets deleteAfterAt to null for keep policy', () => {
    const record = createStatementFileRecord('id-1', 'file.csv', 'keep');
    expect(record.deleteAfterAt).toBeNull();
  });

  it('uses the supplied uploadedAt timestamp', () => {
    const uploadedAt = new Date('2024-06-15T12:00:00.000Z');
    const record = createStatementFileRecord('id-1', 'file.csv', 'auto_delete', uploadedAt);
    expect(record.uploadedAt).toBe(uploadedAt);
  });

  it('sets updatedAt as a Date instance', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    expect(record.updatedAt).toBeInstanceOf(Date);
  });

  it('respects a custom retentionDays value', () => {
    const uploadedAt = new Date('2024-01-01T00:00:00.000Z');
    const record = createStatementFileRecord('id-1', 'file.csv', 'auto_delete', uploadedAt, 30);
    expect(record.deleteAfterAt).toEqual(new Date('2024-01-31T00:00:00.000Z'));
  });
});

// ── computeDeleteAfterAt ──────────────────────────────────────────────────────

describe('computeDeleteAfterAt', () => {
  it('adds retentionDays to uploadedAt', () => {
    const uploadedAt = new Date('2024-01-01T00:00:00.000Z');
    expect(computeDeleteAfterAt(uploadedAt, 7)).toEqual(new Date('2024-01-08T00:00:00.000Z'));
  });

  it('uses DEFAULT_RETENTION_DAYS when not specified', () => {
    const uploadedAt = new Date('2024-03-01T00:00:00.000Z');
    const expected = new Date('2024-03-08T00:00:00.000Z');
    expect(computeDeleteAfterAt(uploadedAt)).toEqual(expected);
  });

  it('does not mutate the input date', () => {
    const uploadedAt = new Date('2024-01-01T00:00:00.000Z');
    const original = uploadedAt.getTime();
    computeDeleteAfterAt(uploadedAt, 7);
    expect(uploadedAt.getTime()).toBe(original);
  });
});

// ── isExpired ─────────────────────────────────────────────────────────────────

describe('isExpired', () => {
  it('returns true when deleteAfterAt is in the past', () => {
    const record = createStatementFileRecord('id-1', 'file.csv', 'auto_delete', daysAgo(10), 7);
    expect(isExpired(record)).toBe(true);
  });

  it('returns false when deleteAfterAt is in the future', () => {
    const record = createStatementFileRecord('id-1', 'file.csv', 'auto_delete', new Date(), 7);
    expect(isExpired(record)).toBe(false);
  });

  it('returns false for keep policy', () => {
    const record = createStatementFileRecord('id-1', 'file.csv', 'keep', daysAgo(30));
    expect(isExpired(record)).toBe(false);
  });

  it('returns false for already deleted records', () => {
    const record = markDeleted(
      createStatementFileRecord('id-1', 'file.csv', 'auto_delete', daysAgo(10), 7),
    );
    expect(isExpired(record)).toBe(false);
  });

  it('returns false when deleteAfterAt is null', () => {
    const record: StatementFileRecord = {
      id: 'id-1',
      fileName: 'file.csv',
      uploadedAt: daysAgo(10),
      retentionPolicy: 'auto_delete',
      deleteAfterAt: null,
      deletionStatus: 'pending',
      updatedAt: new Date(),
    };
    expect(isExpired(record)).toBe(false);
  });

  it('respects the supplied `now` override', () => {
    const uploadedAt = new Date('2024-01-01T00:00:00.000Z');
    const record = createStatementFileRecord('id-1', 'file.csv', 'auto_delete', uploadedAt, 7);
    // Before expiry
    expect(isExpired(record, new Date('2024-01-07T23:59:59.000Z'))).toBe(false);
    // Exactly at expiry
    expect(isExpired(record, new Date('2024-01-08T00:00:00.000Z'))).toBe(true);
    // After expiry
    expect(isExpired(record, new Date('2024-01-10T00:00:00.000Z'))).toBe(true);
  });
});

// ── findExpiredFiles ──────────────────────────────────────────────────────────

describe('findExpiredFiles', () => {
  it('returns only expired files', () => {
    const expired = createStatementFileRecord('id-1', 'old.csv', 'auto_delete', daysAgo(10), 7);
    const fresh = createStatementFileRecord('id-2', 'new.csv', 'auto_delete', new Date(), 7);
    const result = findExpiredFiles([expired, fresh]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('id-1');
  });

  it('returns an empty array when no files are expired', () => {
    const fresh = createStatementFileRecord('id-1', 'new.csv', 'auto_delete', new Date(), 7);
    expect(findExpiredFiles([fresh])).toHaveLength(0);
  });

  it('returns an empty array for an empty list', () => {
    expect(findExpiredFiles([])).toHaveLength(0);
  });
});

// ── markDeleted ───────────────────────────────────────────────────────────────

describe('markDeleted', () => {
  it('sets deletionStatus to deleted', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markDeleted(record);
    expect(updated.deletionStatus).toBe('deleted');
  });

  it('does not mutate the original record', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    markDeleted(record);
    expect(record.deletionStatus).toBe('pending');
  });

  it('preserves all other fields', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markDeleted(record);
    expect(updated.id).toBe('id-1');
    expect(updated.fileName).toBe('file.csv');
  });
});

// ── markDeletionFailed ────────────────────────────────────────────────────────

describe('markDeletionFailed', () => {
  it('sets deletionStatus to failed', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markDeletionFailed(record);
    expect(updated.deletionStatus).toBe('failed');
  });

  it('does not mutate the original record', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    markDeletionFailed(record);
    expect(record.deletionStatus).toBe('pending');
  });

  it('preserves all other fields', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markDeletionFailed(record);
    expect(updated.id).toBe('id-1');
    expect(updated.retentionPolicy).toBe('auto_delete');
  });

  it('attaches a failureReason when provided', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markDeletionFailed(record, 'file not found');
    expect(updated.failureReason).toBe('file not found');
  });

  it('leaves failureReason undefined when no reason is provided', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markDeletionFailed(record);
    expect(updated.failureReason).toBeUndefined();
  });
});

// ── markSkipped ───────────────────────────────────────────────────────────────

describe('markSkipped', () => {
  it('sets deletionStatus to skipped', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markSkipped(record);
    expect(updated.deletionStatus).toBe('skipped');
  });

  it('switches retentionPolicy to keep', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markSkipped(record);
    expect(updated.retentionPolicy).toBe('keep');
  });

  it('sets deleteAfterAt to null', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    const updated = markSkipped(record);
    expect(updated.deleteAfterAt).toBeNull();
  });

  it('does not mutate the original record', () => {
    const record = createStatementFileRecord('id-1', 'file.csv');
    markSkipped(record);
    expect(record.retentionPolicy).toBe('auto_delete');
  });
});

// ── runCleanup ────────────────────────────────────────────────────────────────

describe('runCleanup', () => {
  const now = new Date('2024-01-20T00:00:00.000Z');
  const uploadedExpired = new Date('2024-01-01T00:00:00.000Z'); // 19 days ago — expired
  const uploadedFresh = new Date('2024-01-18T00:00:00.000Z');   // 2 days ago — not expired

  it('deletes expired files when deleter returns true', async () => {
    const expiredFile = createStatementFileRecord('id-1', 'old.csv', 'auto_delete', uploadedExpired, 7);
    const deleter: FileDeleter = vi.fn().mockResolvedValue(true);
    const result = await runCleanup([expiredFile], deleter, { now });
    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0]?.deletionStatus).toBe('deleted');
    expect(result.failed).toHaveLength(0);
  });

  it('marks files as failed when deleter returns false', async () => {
    const expiredFile = createStatementFileRecord('id-1', 'old.csv', 'auto_delete', uploadedExpired, 7);
    const deleter: FileDeleter = vi.fn().mockResolvedValue(false);
    const result = await runCleanup([expiredFile], deleter, { now });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.deletionStatus).toBe('failed');
    expect(result.deleted).toHaveLength(0);
  });

  it('marks files as failed when deleter throws', async () => {
    const expiredFile = createStatementFileRecord('id-1', 'old.csv', 'auto_delete', uploadedExpired, 7);
    const deleter: FileDeleter = vi.fn().mockRejectedValue(new Error('disk error'));
    const result = await runCleanup([expiredFile], deleter, { now });
    expect(result.failed).toHaveLength(1);
    expect(result.deleted).toHaveLength(0);
  });

  it('skips non-expired files', async () => {
    const freshFile = createStatementFileRecord('id-2', 'new.csv', 'auto_delete', uploadedFresh, 7);
    const deleter: FileDeleter = vi.fn();
    const result = await runCleanup([freshFile], deleter, { now });
    expect(result.skipped).toHaveLength(1);
    expect(result.deleted).toHaveLength(0);
    expect(deleter).not.toHaveBeenCalled();
  });

  it('skips files with keep policy', async () => {
    const keepFile = createStatementFileRecord('id-3', 'keep.csv', 'keep', uploadedExpired);
    const deleter: FileDeleter = vi.fn();
    const result = await runCleanup([keepFile], deleter, { now });
    expect(result.skipped).toHaveLength(1);
    expect(deleter).not.toHaveBeenCalled();
  });

  it('handles a mixed list of expired and fresh files', async () => {
    const expiredFile = createStatementFileRecord('id-1', 'old.csv', 'auto_delete', uploadedExpired, 7);
    const freshFile = createStatementFileRecord('id-2', 'new.csv', 'auto_delete', uploadedFresh, 7);
    const deleter: FileDeleter = vi.fn().mockResolvedValue(true);
    const result = await runCleanup([expiredFile, freshFile], deleter, { now });
    expect(result.deleted).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.outcomes).toHaveLength(2);
  });

  it('returns outcomes for every file', async () => {
    const expiredFile = createStatementFileRecord('id-1', 'old.csv', 'auto_delete', uploadedExpired, 7);
    const deleter: FileDeleter = vi.fn().mockResolvedValue(true);
    const result = await runCleanup([expiredFile], deleter, { now });
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]?.result).toBe('deleted');
  });

  it('returns an empty result for an empty file list', async () => {
    const deleter: FileDeleter = vi.fn();
    const result = await runCleanup([], deleter, { now });
    expect(result.deleted).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.outcomes).toHaveLength(0);
  });
});

// ── reconcileOnStartup ────────────────────────────────────────────────────────

describe('reconcileOnStartup', () => {
  const now = new Date('2024-01-20T00:00:00.000Z');

  it('returns all records unchanged when none are overdue', () => {
    const fresh = createStatementFileRecord(
      'id-1',
      'new.csv',
      'auto_delete',
      new Date('2024-01-18T00:00:00.000Z'),
      7,
    );
    const result = reconcileOnStartup([fresh], now);
    expect(result).toHaveLength(1);
    expect(result[0]?.deletionStatus).toBe('pending');
  });

  it('returns overdue-pending records as-is (to be cleaned up by runCleanup)', () => {
    const overdue = createStatementFileRecord(
      'id-1',
      'old.csv',
      'auto_delete',
      new Date('2024-01-01T00:00:00.000Z'),
      7,
    );
    const result = reconcileOnStartup([overdue], now);
    // reconcileOnStartup does not mark them deleted — that is runCleanup's job
    expect(result).toHaveLength(1);
    expect(result[0]?.deletionStatus).toBe('pending');
  });

  it('does not change already-deleted records', () => {
    const deleted = markDeleted(
      createStatementFileRecord(
        'id-1',
        'old.csv',
        'auto_delete',
        new Date('2024-01-01T00:00:00.000Z'),
        7,
      ),
    );
    const result = reconcileOnStartup([deleted], now);
    expect(result[0]?.deletionStatus).toBe('deleted');
  });

  it('returns an empty array for an empty list', () => {
    expect(reconcileOnStartup([], now)).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const original = [createStatementFileRecord('id-1', 'file.csv')];
    reconcileOnStartup(original, now);
    expect(original).toHaveLength(1);
  });
});

// ── File lifecycle audit event type coverage ──────────────────────────────────

describe('File lifecycle audit event types', () => {
  it('file.retained is a valid AuditEventType usable in createAuditEvent', async () => {
    const { createAuditEvent } = await import('./audit.js');
    const event = createAuditEvent({
      type: 'file.retained',
      actorId: 'system',
      resourceType: 'file',
      resourceId: 'file-1',
      metadata: { retentionDays: 7 },
    });
    expect(event.type).toBe('file.retained');
  });

  it('file.deleted is a valid AuditEventType', async () => {
    const { createAuditEvent } = await import('./audit.js');
    const event = createAuditEvent({
      type: 'file.deleted',
      actorId: 'system',
      resourceType: 'file',
      resourceId: 'file-1',
      metadata: {},
    });
    expect(event.type).toBe('file.deleted');
  });

  it('file.deletion_failed is a valid AuditEventType', async () => {
    const { createAuditEvent } = await import('./audit.js');
    const event = createAuditEvent({
      type: 'file.deletion_failed',
      actorId: 'system',
      resourceType: 'file',
      resourceId: 'file-1',
      metadata: { reason: 'not found' },
    });
    expect(event.type).toBe('file.deletion_failed');
  });

  it('file.cleanup_run_completed is a valid AuditEventType', async () => {
    const { createAuditEvent } = await import('./audit.js');
    const event = createAuditEvent({
      type: 'file.cleanup_run_completed',
      actorId: 'system',
      resourceType: 'cleanup',
      resourceId: 'run-1',
      metadata: { deleted: 3, failed: 0, skipped: 1 },
    });
    expect(event.type).toBe('file.cleanup_run_completed');
    expect(event.metadata['deleted']).toBe(3);
  });
});
