/**
 * File lifecycle management for uploaded bank statement files.
 *
 * Uploaded statements are automatically deleted after a configurable
 * retention period (default: 7 days) per the SpendStack security policy.
 * Normalized transaction data is retained even after source file cleanup.
 */

/** Number of days to retain a statement file before auto-deletion. */
export const DEFAULT_RETENTION_DAYS = 7;

export type RetentionPolicy = 'auto_delete' | 'keep';
export type DeletionStatus = 'pending' | 'deleted' | 'skipped';

/**
 * Represents a stored bank statement file with lifecycle metadata.
 * Mirrors the StatementFile entity from the domain model.
 */
export interface StatementFileRecord {
  id: string;
  fileName: string;
  uploadedAt: Date;
  retentionPolicy: RetentionPolicy;
  /** Timestamp after which the file should be deleted. Null when policy is "keep". */
  deleteAfterAt: Date | null;
  deletionStatus: DeletionStatus;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new StatementFileRecord with the retention schedule pre-computed.
 *
 * @param id            Unique identifier for this file record.
 * @param fileName      Original file name as uploaded by the user.
 * @param retentionPolicy  "auto_delete" (default) or "keep" if the user opted out.
 * @param uploadedAt    Upload timestamp (defaults to now).
 * @param retentionDays Days before deletion (defaults to DEFAULT_RETENTION_DAYS).
 */
export function createStatementFileRecord(
  id: string,
  fileName: string,
  retentionPolicy: RetentionPolicy = 'auto_delete',
  uploadedAt: Date = new Date(),
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): StatementFileRecord {
  return {
    id,
    fileName,
    uploadedAt,
    retentionPolicy,
    deleteAfterAt:
      retentionPolicy === 'auto_delete'
        ? computeDeleteAfterAt(uploadedAt, retentionDays)
        : null,
    deletionStatus: 'pending',
  };
}

// ---------------------------------------------------------------------------
// Retention helpers
// ---------------------------------------------------------------------------

/**
 * Computes the timestamp after which the file should be deleted.
 *
 * @param uploadedAt   Upload timestamp.
 * @param retentionDays Number of days to retain the file.
 */
export function computeDeleteAfterAt(
  uploadedAt: Date,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Date {
  const deleteAt = new Date(uploadedAt.getTime());
  deleteAt.setDate(deleteAt.getDate() + retentionDays);
  return deleteAt;
}

/**
 * Returns true when a file is past its retention deadline and should be deleted.
 *
 * @param file  The file record to check.
 * @param now   Current time (defaults to `new Date()`).
 */
export function isExpired(file: StatementFileRecord, now: Date = new Date()): boolean {
  if (file.retentionPolicy === 'keep') return false;
  if (file.deletionStatus === 'deleted') return false;
  if (file.deleteAfterAt === null) return false;
  return now.getTime() >= file.deleteAfterAt.getTime();
}

/**
 * Filters a list of file records to return only those that have passed their
 * retention deadline and are still pending deletion.
 *
 * @param files  All file records to check.
 * @param now    Current time (defaults to `new Date()`).
 */
export function findExpiredFiles(
  files: StatementFileRecord[],
  now: Date = new Date(),
): StatementFileRecord[] {
  return files.filter((f) => isExpired(f, now));
}

/**
 * Marks a file record as deleted by returning an updated copy.
 * Does not mutate the original record.
 */
export function markDeleted(file: StatementFileRecord): StatementFileRecord {
  return { ...file, deletionStatus: 'deleted' };
}

/**
 * Marks a file record as skipped (user opted to keep) by returning an
 * updated copy.  Does not mutate the original record.
 */
export function markSkipped(file: StatementFileRecord): StatementFileRecord {
  return { ...file, deletionStatus: 'skipped', retentionPolicy: 'keep', deleteAfterAt: null };
}

// ---------------------------------------------------------------------------
// User-facing retention notice
// ---------------------------------------------------------------------------

/**
 * A user-facing notification explaining the file retention policy
 * for a specific statement upload.
 */
export interface RetentionNotice {
  /** Short heading for the notice. */
  title: string;
  /** Full human-readable explanation of when the file will be removed and what is kept. */
  body: string;
  /** The scheduled deletion timestamp, or null when the file is retained indefinitely. */
  deleteAfterAt: Date | null;
  /** The configured retention period in days (for display purposes). */
  retentionDays: number;
}

/**
 * Builds a user-facing retention notice for an uploaded statement file.
 *
 * The notice explains:
 * - The source file is stored temporarily (for `retentionDays` days).
 * - The file will be deleted automatically on the computed date.
 * - All imported transaction data is kept permanently after cleanup.
 *
 * @param file          The statement file record.
 * @param retentionDays Retention period in days used for display copy
 *                      (defaults to DEFAULT_RETENTION_DAYS).
 */
export function buildRetentionNotice(
  file: StatementFileRecord,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): RetentionNotice {
  if (file.retentionPolicy === 'keep') {
    return {
      title: 'File kept indefinitely',
      body: 'This statement file is set to be kept and will not be removed automatically. Your imported transactions are always stored separately and remain safe.',
      deleteAfterAt: null,
      retentionDays,
    };
  }

  const deleteAt = file.deleteAfterAt;
  const dateStr = deleteAt
    ? deleteAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'an upcoming date';
  const dayLabel = retentionDays === 1 ? 'day' : 'days';

  return {
    title: `Source file removed after ${retentionDays} ${dayLabel}`,
    body: `To protect your privacy, the uploaded statement file will be automatically deleted on ${dateStr}. Your imported transactions are stored permanently and will not be affected by this cleanup.`,
    deleteAfterAt: deleteAt,
    retentionDays,
  };
}
