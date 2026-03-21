import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETENTION_DAYS,
  createStatementFileRecord,
  computeDeleteAfterAt,
  isExpired,
  findExpiredFiles,
  markDeleted,
  markSkipped,
  buildRetentionNotice,
} from './file-retention.js';

const UPLOADED_AT = new Date('2024-01-01T10:00:00.000Z');

describe('computeDeleteAfterAt', () => {
  it('returns a date 7 days after upload by default', () => {
    const deleteAt = computeDeleteAfterAt(UPLOADED_AT);
    const expected = new Date('2024-01-08T10:00:00.000Z');
    expect(deleteAt.toISOString()).toBe(expected.toISOString());
  });

  it('respects a custom retention period', () => {
    const deleteAt = computeDeleteAfterAt(UPLOADED_AT, 30);
    const expected = new Date('2024-01-31T10:00:00.000Z');
    expect(deleteAt.toISOString()).toBe(expected.toISOString());
  });

  it('uses DEFAULT_RETENTION_DAYS constant', () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(7);
  });
});

describe('createStatementFileRecord', () => {
  it('creates a record with auto_delete policy by default', () => {
    const record = createStatementFileRecord('f-1', 'statement.csv', 'auto_delete', UPLOADED_AT);
    expect(record.id).toBe('f-1');
    expect(record.fileName).toBe('statement.csv');
    expect(record.retentionPolicy).toBe('auto_delete');
    expect(record.deleteAfterAt).not.toBeNull();
    expect(record.deletionStatus).toBe('pending');
  });

  it('sets deleteAfterAt to 7 days from uploadedAt', () => {
    const record = createStatementFileRecord('f-1', 'file.pdf', 'auto_delete', UPLOADED_AT);
    const expected = new Date('2024-01-08T10:00:00.000Z');
    expect(record.deleteAfterAt?.toISOString()).toBe(expected.toISOString());
  });

  it('sets deleteAfterAt to null when policy is keep', () => {
    const record = createStatementFileRecord('f-2', 'file.pdf', 'keep', UPLOADED_AT);
    expect(record.deleteAfterAt).toBeNull();
  });
});

describe('isExpired', () => {
  const record = createStatementFileRecord('f-1', 'file.csv', 'auto_delete', UPLOADED_AT);

  it('returns false before deletion deadline', () => {
    const before = new Date('2024-01-05T00:00:00.000Z');
    expect(isExpired(record, before)).toBe(false);
  });

  it('returns true on the deletion deadline', () => {
    const onDeadline = new Date('2024-01-08T10:00:00.000Z');
    expect(isExpired(record, onDeadline)).toBe(true);
  });

  it('returns true after the deletion deadline', () => {
    const after = new Date('2024-01-15T00:00:00.000Z');
    expect(isExpired(record, after)).toBe(true);
  });

  it('returns false for "keep" policy files', () => {
    const keepRecord = createStatementFileRecord('f-3', 'file.csv', 'keep', UPLOADED_AT);
    const after = new Date('2024-12-31T00:00:00.000Z');
    expect(isExpired(keepRecord, after)).toBe(false);
  });

  it('returns false for already deleted files', () => {
    const deleted = markDeleted(record);
    const after = new Date('2024-12-31T00:00:00.000Z');
    expect(isExpired(deleted, after)).toBe(false);
  });
});

describe('findExpiredFiles', () => {
  const files = [
    createStatementFileRecord('f-1', 'old.csv', 'auto_delete', new Date('2024-01-01T00:00:00.000Z')),
    createStatementFileRecord('f-2', 'recent.csv', 'auto_delete', new Date('2024-01-10T00:00:00.000Z')),
    createStatementFileRecord('f-3', 'kept.csv', 'keep', new Date('2024-01-01T00:00:00.000Z')),
  ];

  it('returns only expired files', () => {
    const now = new Date('2024-01-09T12:00:00.000Z'); // f-1 expired, f-2 not yet
    const expired = findExpiredFiles(files, now);
    expect(expired).toHaveLength(1);
    expect(expired[0]?.id).toBe('f-1');
  });

  it('does not include "keep" policy files', () => {
    const now = new Date('2024-12-31T00:00:00.000Z');
    const expired = findExpiredFiles(files, now);
    const ids = expired.map((f) => f.id);
    expect(ids).not.toContain('f-3');
  });

  it('returns empty array when no files are expired', () => {
    const now = new Date('2024-01-05T00:00:00.000Z');
    expect(findExpiredFiles(files, now)).toHaveLength(0);
  });
});

describe('markDeleted / markSkipped', () => {
  const record = createStatementFileRecord('f-1', 'file.csv', 'auto_delete', UPLOADED_AT);

  it('markDeleted returns a copy with deletionStatus=deleted', () => {
    const deleted = markDeleted(record);
    expect(deleted.deletionStatus).toBe('deleted');
    // original must not be mutated
    expect(record.deletionStatus).toBe('pending');
  });

  it('markSkipped returns a copy with deletionStatus=skipped and policy=keep', () => {
    const skipped = markSkipped(record);
    expect(skipped.deletionStatus).toBe('skipped');
    expect(skipped.retentionPolicy).toBe('keep');
    expect(skipped.deleteAfterAt).toBeNull();
    // original must not be mutated
    expect(record.retentionPolicy).toBe('auto_delete');
  });
});

describe('buildRetentionNotice', () => {
  const uploadedAt = new Date('2024-03-01T09:00:00.000Z');

  it('returns the correct retentionDays for auto_delete policy', () => {
    const file = createStatementFileRecord('f-1', 'march.csv', 'auto_delete', uploadedAt);
    const notice = buildRetentionNotice(file);
    expect(notice.retentionDays).toBe(DEFAULT_RETENTION_DAYS);
  });

  it('uses a custom retentionDays value in the title copy', () => {
    const file = createStatementFileRecord('f-1', 'march.csv', 'auto_delete', uploadedAt, 30);
    const notice = buildRetentionNotice(file, 30);
    expect(notice.title).toContain('30');
    expect(notice.retentionDays).toBe(30);
  });

  it('title uses singular "day" when retentionDays is 1', () => {
    const file = createStatementFileRecord('f-1', 'march.csv', 'auto_delete', uploadedAt, 1);
    const notice = buildRetentionNotice(file, 1);
    expect(notice.title).toMatch(/\b1 day\b/);
    expect(notice.title).not.toMatch(/\b1 days\b/);
  });

  it('title uses plural "days" when retentionDays > 1', () => {
    const file = createStatementFileRecord('f-1', 'march.csv', 'auto_delete', uploadedAt);
    const notice = buildRetentionNotice(file);
    expect(notice.title).toMatch(/days/);
  });

  it('body mentions permanent transaction storage', () => {
    const file = createStatementFileRecord('f-1', 'march.csv', 'auto_delete', uploadedAt);
    const notice = buildRetentionNotice(file);
    expect(notice.body.toLowerCase()).toMatch(/transaction/);
    expect(notice.body.toLowerCase()).toMatch(/permanent/);
  });

  it('sets deleteAfterAt to the file deletion date for auto_delete', () => {
    const file = createStatementFileRecord('f-1', 'march.csv', 'auto_delete', uploadedAt);
    const notice = buildRetentionNotice(file);
    expect(notice.deleteAfterAt).toEqual(file.deleteAfterAt);
  });

  it('returns keep notice with null deleteAfterAt for keep policy', () => {
    const file = createStatementFileRecord('f-2', 'march.csv', 'keep', uploadedAt);
    const notice = buildRetentionNotice(file);
    expect(notice.deleteAfterAt).toBeNull();
    expect(notice.title.toLowerCase()).toContain('kept');
    expect(notice.body.toLowerCase()).toMatch(/transaction/);
  });

  it('does not mutate the file record', () => {
    const file = createStatementFileRecord('f-1', 'march.csv', 'auto_delete', uploadedAt);
    const originalDeleteAt = file.deleteAfterAt;
    buildRetentionNotice(file);
    expect(file.deleteAfterAt).toEqual(originalDeleteAt);
  });
});
