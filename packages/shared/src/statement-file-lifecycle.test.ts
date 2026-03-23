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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const UPLOADED_AT = '2024-01-01T10:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

function makeAutoRecord(id: string, uploadedAt = UPLOADED_AT): StatementFileRecord {
  return createStatementFileRecord(id, `${id}.csv`, 'auto_delete', uploadedAt);
}

function makeKeepRecord(id: string, uploadedAt = UPLOADED_AT): StatementFileRecord {
  return createStatementFileRecord(id, `${id}.csv`, 'keep', uploadedAt);
}

// ── DEFAULT_RETENTION_DAYS ────────────────────────────────────────────────────

describe('DEFAULT_RETENTION_DAYS', () => {
  it('is 7', () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(7);
  });
});

// ── computeDeleteAfterAt ──────────────────────────────────────────────────────

describe('computeDeleteAfterAt', () => {
  it('returns 7 days after the upload timestamp by default', () => {
    const result = computeDeleteAfterAt(UPLOADED_AT);
    expect(result).toBe('2024-01-08T10:00:00.000Z');
  });

  it('respects a custom retention period', () => {
    const result = computeDeleteAfterAt(UPLOADED_AT, 30);
    expect(result).toBe('2024-01-31T10:00:00.000Z');
  });

  it('returns an ISO 8601 UTC string', () => {
    const result = computeDeleteAfterAt(UPLOADED_AT);
    expect(Number.isNaN(new Date(result).getTime())).toBe(false);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('throws RangeError for an invalid uploadedAt', () => {
    expect(() => computeDeleteAfterAt('not-a-date')).toThrow(RangeError);
  });

  it('throws RangeError for zero retentionDays', () => {
    expect(() => computeDeleteAfterAt(UPLOADED_AT, 0)).toThrow(RangeError);
  });

  it('throws RangeError for negative retentionDays', () => {
    expect(() => computeDeleteAfterAt(UPLOADED_AT, -1)).toThrow(RangeError);
  });

  it('throws RangeError for NaN retentionDays', () => {
    expect(() => computeDeleteAfterAt(UPLOADED_AT, NaN)).toThrow(RangeError);
  });
});

// ── createStatementFileRecord ─────────────────────────────────────────────────

describe('createStatementFileRecord', () => {
  it('creates a record with auto_delete policy by default', () => {
    const record = createStatementFileRecord('f-1', 'statement.csv');
    expect(record.retentionPolicy).toBe('auto_delete');
    expect(record.deletionStatus).toBe('pending');
    expect(record.deleteAfterAt).not.toBeNull();
  });

  it('populates all fields correctly', () => {
    const record = createStatementFileRecord('f-1', 'bank.pdf', 'auto_delete', UPLOADED_AT);
    expect(record.id).toBe('f-1');
    expect(record.fileName).toBe('bank.pdf');
    expect(record.uploadedAt).toBe(UPLOADED_AT);
    expect(record.deletionStatus).toBe('pending');
  });

  it('sets deleteAfterAt to 7 days from uploadedAt', () => {
    const record = createStatementFileRecord('f-1', 'file.csv', 'auto_delete', UPLOADED_AT);
    expect(record.deleteAfterAt).toBe('2024-01-08T10:00:00.000Z');
  });

  it('sets deleteAfterAt to null when policy is keep', () => {
    const record = createStatementFileRecord('f-2', 'file.csv', 'keep', UPLOADED_AT);
    expect(record.deleteAfterAt).toBeNull();
  });

  it('sets deletionStatus to pending', () => {
    const record = createStatementFileRecord('f-3', 'file.csv', 'auto_delete', UPLOADED_AT);
    expect(record.deletionStatus).toBe('pending');
  });

  it('respects a custom retentionDays value', () => {
    const record = createStatementFileRecord('f-4', 'file.csv', 'auto_delete', UPLOADED_AT, 14);
    expect(record.deleteAfterAt).toBe('2024-01-15T10:00:00.000Z');
  });

  it('throws RangeError for an invalid uploadedAt', () => {
    expect(() => createStatementFileRecord('f-5', 'file.csv', 'auto_delete', 'bad-date')).toThrow(RangeError);
  });

  it('throws RangeError for zero retentionDays', () => {
    expect(() => createStatementFileRecord('f-6', 'file.csv', 'auto_delete', UPLOADED_AT, 0)).toThrow(RangeError);
  });

  it('throws RangeError for negative retentionDays', () => {
    expect(() => createStatementFileRecord('f-7', 'file.csv', 'auto_delete', UPLOADED_AT, -3)).toThrow(RangeError);
  });
});

// ── isExpired ─────────────────────────────────────────────────────────────────

describe('isExpired', () => {
  const record = makeAutoRecord('f-1');

  it('returns false before the deletion deadline', () => {
    const before = new Date(new Date(UPLOADED_AT).getTime() + 3 * DAY_MS);
    expect(isExpired(record, before)).toBe(false);
  });

  it('returns true on the exact deletion deadline', () => {
    const onDeadline = new Date('2024-01-08T10:00:00.000Z');
    expect(isExpired(record, onDeadline)).toBe(true);
  });

  it('returns true after the deletion deadline', () => {
    const after = new Date('2024-01-15T00:00:00.000Z');
    expect(isExpired(record, after)).toBe(true);
  });

  it('returns false for keep policy files', () => {
    const keepRecord = makeKeepRecord('f-keep');
    expect(isExpired(keepRecord, new Date('2024-12-31T00:00:00.000Z'))).toBe(false);
  });

  it('returns false for already deleted files', () => {
    const deleted = markDeleted(record);
    expect(isExpired(deleted, new Date('2024-12-31T00:00:00.000Z'))).toBe(false);
  });

  it('returns false for skipped files', () => {
    const skipped = markSkipped(record);
    expect(isExpired(skipped, new Date('2024-12-31T00:00:00.000Z'))).toBe(false);
  });

  it('returns true for failed files past the deadline (retry semantics)', () => {
    const failed = markDeletionFailed(record, 'I/O error');
    const after = new Date('2024-12-31T00:00:00.000Z');
    expect(isExpired(failed, after)).toBe(true);
  });
});

// ── findExpiredFiles ──────────────────────────────────────────────────────────

describe('findExpiredFiles', () => {
  const files = [
    makeAutoRecord('old', '2024-01-01T00:00:00.000Z'),
    makeAutoRecord('recent', '2024-01-10T00:00:00.000Z'),
    makeKeepRecord('kept', '2024-01-01T00:00:00.000Z'),
  ];

  it('returns only files that are expired', () => {
    const now = new Date('2024-01-09T12:00:00.000Z'); // old expired, recent not yet
    const expired = findExpiredFiles(files, now);
    expect(expired).toHaveLength(1);
    expect(expired[0]?.id).toBe('old');
  });

  it('does not include keep-policy files', () => {
    const now = new Date('2024-12-31T00:00:00.000Z');
    const ids = findExpiredFiles(files, now).map((f) => f.id);
    expect(ids).not.toContain('kept');
  });

  it('returns empty array when nothing is expired', () => {
    const now = new Date('2024-01-05T00:00:00.000Z');
    expect(findExpiredFiles(files, now)).toHaveLength(0);
  });

  it('returns multiple expired files', () => {
    const now = new Date('2024-12-31T00:00:00.000Z');
    const expired = findExpiredFiles(files, now);
    expect(expired.map((f) => f.id).sort()).toEqual(['old', 'recent']);
  });
});

// ── markDeleted ───────────────────────────────────────────────────────────────

describe('markDeleted', () => {
  it('sets deletionStatus to deleted', () => {
    const record = makeAutoRecord('f-1');
    expect(markDeleted(record).deletionStatus).toBe('deleted');
  });

  it('does not mutate the original record', () => {
    const record = makeAutoRecord('f-1');
    markDeleted(record);
    expect(record.deletionStatus).toBe('pending');
  });

  it('clears a previous deletionFailureReason', () => {
    const failed = markDeletionFailed(makeAutoRecord('f-1'), 'disk full');
    const deleted = markDeleted(failed);
    expect(deleted.deletionFailureReason).toBeUndefined();
  });
});

// ── markDeletionFailed ────────────────────────────────────────────────────────

describe('markDeletionFailed', () => {
  it('sets deletionStatus to failed', () => {
    const record = makeAutoRecord('f-1');
    expect(markDeletionFailed(record, 'oops').deletionStatus).toBe('failed');
  });

  it('stores the failure reason', () => {
    const record = makeAutoRecord('f-1');
    expect(markDeletionFailed(record, 'disk full').deletionFailureReason).toBe('disk full');
  });

  it('does not mutate the original record', () => {
    const record = makeAutoRecord('f-1');
    markDeletionFailed(record, 'err');
    expect(record.deletionStatus).toBe('pending');
  });
});

// ── markSkipped ───────────────────────────────────────────────────────────────

describe('markSkipped', () => {
  it('sets deletionStatus to skipped', () => {
    const record = makeAutoRecord('f-1');
    expect(markSkipped(record).deletionStatus).toBe('skipped');
  });

  it('sets retentionPolicy to keep', () => {
    const record = makeAutoRecord('f-1');
    expect(markSkipped(record).retentionPolicy).toBe('keep');
  });

  it('sets deleteAfterAt to null', () => {
    const record = makeAutoRecord('f-1');
    expect(markSkipped(record).deleteAfterAt).toBeNull();
  });

  it('clears a deletionFailureReason', () => {
    const failed = markDeletionFailed(makeAutoRecord('f-1'), 'err');
    expect(markSkipped(failed).deletionFailureReason).toBeUndefined();
  });

  it('does not mutate the original record', () => {
    const record = makeAutoRecord('f-1');
    markSkipped(record);
    expect(record.retentionPolicy).toBe('auto_delete');
  });
});

// ── runCleanup ────────────────────────────────────────────────────────────────

describe('runCleanup', () => {
  const OLD_UPLOAD = '2024-01-01T00:00:00.000Z';
  const NEW_UPLOAD = '2024-12-01T00:00:00.000Z';
  const RUN_NOW = new Date('2024-01-10T12:00:00.000Z');

  it('deletes expired files and returns updated records', async () => {
    const files = [
      createStatementFileRecord('expired-1', 'old.csv', 'auto_delete', OLD_UPLOAD),
      createStatementFileRecord('fresh-1', 'new.csv', 'auto_delete', NEW_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    expect(deleter).toHaveBeenCalledTimes(1);
    expect(deleter).toHaveBeenCalledWith('expired-1');
    expect(result.deletedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.eligibleCount).toBe(1);

    const updatedExpired = result.updatedRecords.find((r) => r.id === 'expired-1');
    expect(updatedExpired?.deletionStatus).toBe('deleted');

    const untouched = result.updatedRecords.find((r) => r.id === 'fresh-1');
    expect(untouched?.deletionStatus).toBe('pending');
  });

  it('emits a file.deleted audit event per deleted file', async () => {
    const files = [
      createStatementFileRecord('f-del', 'old.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    const deletedEvent = result.auditEvents.find((e) => e.type === 'file.deleted');
    expect(deletedEvent).toBeDefined();
    expect(deletedEvent?.resourceId).toBe('f-del');
    expect(deletedEvent?.actorId).toBe('system');
    expect(deletedEvent?.metadata['fileName']).toBe('old.csv');
  });

  it('marks files as failed and emits file.deletion_failed when deleter throws', async () => {
    const files = [
      createStatementFileRecord('f-err', 'bad.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockRejectedValue(new Error('disk full'));

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    expect(result.deletedCount).toBe(0);
    expect(result.failedCount).toBe(1);

    const updated = result.updatedRecords.find((r) => r.id === 'f-err');
    expect(updated?.deletionStatus).toBe('failed');
    expect(updated?.deletionFailureReason).toBe('disk full');

    const failedEvent = result.auditEvents.find((e) => e.type === 'file.deletion_failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.resourceId).toBe('f-err');
    expect(failedEvent?.metadata['reason']).toBe('disk full');
  });

  it('continues processing remaining files after a deletion failure (failure tolerance)', async () => {
    const files = [
      createStatementFileRecord('f-err', 'bad.csv', 'auto_delete', OLD_UPLOAD),
      createStatementFileRecord('f-ok', 'ok.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    expect(result.deletedCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it('emits a file.cleanup_run_completed summary event', async () => {
    const files = [
      createStatementFileRecord('f-1', 'a.csv', 'auto_delete', OLD_UPLOAD),
      createStatementFileRecord('f-2', 'b.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    const summary = result.auditEvents.find((e) => e.type === 'file.cleanup_run_completed');
    expect(summary).toBeDefined();
    expect(summary?.metadata['trigger']).toBe('scheduled');
    expect(summary?.metadata['eligibleCount']).toBe(2);
    expect(summary?.metadata['deletedCount']).toBe(2);
    expect(summary?.metadata['failedCount']).toBe(0);
    expect(summary?.metadata['evaluatedAt']).toBe(RUN_NOW.toISOString());
    // resourceId should be a non-empty hex string, not a raw timestamp
    expect(typeof summary?.resourceId).toBe('string');
    expect(summary?.resourceId.length).toBeGreaterThan(0);
    expect(summary?.resourceId).not.toBe(RUN_NOW.toISOString());
  });

  it('uses a hex resourceId (not a timestamp) in the summary event when no correlationId', async () => {
    const files = [
      createStatementFileRecord('f-hex', 'hex.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    const summary = result.auditEvents.find((e) => e.type === 'file.cleanup_run_completed');
    expect(summary?.resourceId).toMatch(/^[0-9a-f]+$/);
  });

  it('is idempotent — already-deleted files are not passed to deleter', async () => {
    const alreadyDeleted = markDeleted(
      createStatementFileRecord('f-done', 'done.csv', 'auto_delete', OLD_UPLOAD),
    );
    const files = [alreadyDeleted];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    expect(deleter).not.toHaveBeenCalled();
    expect(result.deletedCount).toBe(0);
    expect(result.eligibleCount).toBe(0);
  });

  it('retries files with failed status (idempotent retry)', async () => {
    const previouslyFailed = markDeletionFailed(
      createStatementFileRecord('f-retry', 'retry.csv', 'auto_delete', OLD_UPLOAD),
      'previous error',
    );
    const files = [previouslyFailed];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    expect(deleter).toHaveBeenCalledWith('f-retry');
    expect(result.deletedCount).toBe(1);
  });

  it('passes correlationId to all audit events when provided', async () => {
    const files = [
      createStatementFileRecord('f-corr', 'corr.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, {
      now: RUN_NOW,
      correlationId: 'run-abc-123',
    });

    for (const event of result.auditEvents) {
      expect(event.correlationId).toBe('run-abc-123');
    }
  });

  it('uses the provided actorId in audit events', async () => {
    const files = [
      createStatementFileRecord('f-actor', 'actor.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, {
      now: RUN_NOW,
      actorId: 'admin-user-1',
    });

    for (const event of result.auditEvents) {
      expect(event.actorId).toBe('admin-user-1');
    }
  });

  it('returns all original records in updatedRecords', async () => {
    const files = [
      createStatementFileRecord('f-1', 'a.csv', 'auto_delete', OLD_UPLOAD),
      createStatementFileRecord('f-2', 'b.csv', 'auto_delete', NEW_UPLOAD),
      createStatementFileRecord('f-3', 'c.csv', 'keep', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    expect(result.updatedRecords).toHaveLength(3);
    const ids = result.updatedRecords.map((r) => r.id).sort();
    expect(ids).toEqual(['f-1', 'f-2', 'f-3']);
  });

  it('does nothing when there are no eligible files', async () => {
    const files = [
      createStatementFileRecord('f-fresh', 'new.csv', 'auto_delete', NEW_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn();

    const result = await runCleanup(files, deleter, { now: RUN_NOW });

    expect(deleter).not.toHaveBeenCalled();
    expect(result.deletedCount).toBe(0);
    expect(result.eligibleCount).toBe(0);
    // Still emits the summary event
    expect(result.auditEvents).toHaveLength(1);
    expect(result.auditEvents[0]?.type).toBe('file.cleanup_run_completed');
  });
});

// ── reconcileOnStartup ────────────────────────────────────────────────────────

describe('reconcileOnStartup', () => {
  const OLD_UPLOAD = '2024-01-01T00:00:00.000Z';
  const RUN_NOW = new Date('2024-01-10T12:00:00.000Z');

  it('deletes expired files identical to runCleanup', async () => {
    const files = [
      createStatementFileRecord('f-old', 'old.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileOnStartup(files, deleter, { now: RUN_NOW });

    expect(result.deletedCount).toBe(1);
    expect(result.updatedRecords.find((r) => r.id === 'f-old')?.deletionStatus).toBe('deleted');
  });

  it('records trigger as startup in the summary audit event', async () => {
    const files = [
      createStatementFileRecord('f-start', 'startup.csv', 'auto_delete', OLD_UPLOAD),
    ];
    const deleter: FileDeleter = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileOnStartup(files, deleter, { now: RUN_NOW });

    const summary = result.auditEvents.find((e) => e.type === 'file.cleanup_run_completed');
    expect(summary?.metadata['trigger']).toBe('startup');
  });

  it('is idempotent when all files are already deleted', async () => {
    const alreadyDeleted = markDeleted(
      createStatementFileRecord('f-done', 'done.csv', 'auto_delete', OLD_UPLOAD),
    );
    const deleter: FileDeleter = vi.fn();

    const result = await reconcileOnStartup([alreadyDeleted], deleter, { now: RUN_NOW });

    expect(deleter).not.toHaveBeenCalled();
    expect(result.deletedCount).toBe(0);
  });
});
