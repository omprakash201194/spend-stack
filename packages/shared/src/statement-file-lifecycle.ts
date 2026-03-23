/**
 * File lifecycle management for uploaded bank statement files.
 *
 * Uploaded statements are automatically deleted after a configurable
 * retention period (default: 7 days) per the SpendStack security policy.
 * Normalized transaction data is retained even after source file cleanup.
 *
 * The public API is intentionally side-effect-free: all mutation helpers
 * return new record objects.  Actual I/O (filesystem deletion) is
 * performed by a {@link FileDeleter} callback supplied by the caller.
 */

/** Number of days to retain a statement file before auto-deletion. */
export const DEFAULT_RETENTION_DAYS = 7;

export type RetentionPolicy = 'auto_delete' | 'keep';
export type DeletionStatus = 'pending' | 'deleted' | 'failed' | 'skipped';

/**
 * Represents a stored bank statement file with lifecycle metadata.
 * Mirrors the StatementFile entity from the domain model.
 */
export interface StatementFileRecord {
  id: string;
  fileName: string;
  uploadedAt: Date;
  retentionPolicy: RetentionPolicy;
  /** Timestamp after which the file should be deleted. `null` when policy is "keep". */
  deleteAfterAt: Date | null;
  deletionStatus: DeletionStatus;
  /** Timestamp of when the record was last modified. */
  updatedAt: Date;
  /** Short description of why deletion failed. Populated by {@link markDeletionFailed}. */
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new {@link StatementFileRecord} with the retention schedule pre-computed.
 *
 * @param id              Unique identifier for this file record.
 * @param fileName        Original file name as uploaded by the user.
 * @param retentionPolicy `"auto_delete"` (default) or `"keep"` if the user opted out.
 * @param uploadedAt      Upload timestamp (defaults to now).
 * @param retentionDays   Days before deletion (defaults to {@link DEFAULT_RETENTION_DAYS}).
 */
export function createStatementFileRecord(
  id: string,
  fileName: string,
  retentionPolicy: RetentionPolicy = 'auto_delete',
  uploadedAt: Date = new Date(),
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): StatementFileRecord {
  const now = new Date();
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
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Retention helpers
// ---------------------------------------------------------------------------

/**
 * Computes the timestamp after which the file should be deleted.
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
 * Returns `true` when a file is past its retention deadline and should be deleted.
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
 */
export function findExpiredFiles(
  files: StatementFileRecord[],
  now: Date = new Date(),
): StatementFileRecord[] {
  return files.filter((f) => isExpired(f, now));
}

// ---------------------------------------------------------------------------
// Lifecycle state transitions
// ---------------------------------------------------------------------------

/**
 * Returns an updated copy of `file` with `deletionStatus` set to `'deleted'`.
 * Does not mutate the original record.
 */
export function markDeleted(file: StatementFileRecord): StatementFileRecord {
  return { ...file, deletionStatus: 'deleted', updatedAt: new Date() };
}

/**
 * Returns an updated copy of `file` with `deletionStatus` set to `'failed'`.
 * Does not mutate the original record.
 *
 * @param reason  Optional short description of why deletion failed (e.g. `"file not found"`).
 */
export function markDeletionFailed(
  file: StatementFileRecord,
  reason?: string,
): StatementFileRecord {
  return {
    ...file,
    deletionStatus: 'failed',
    updatedAt: new Date(),
    ...(reason !== undefined ? { failureReason: reason } : {}),
  };
}

/**
 * Returns an updated copy of `file` with policy switched to `'keep'` and
 * `deletionStatus` set to `'skipped'`.
 * Does not mutate the original record.
 */
export function markSkipped(file: StatementFileRecord): StatementFileRecord {
  return {
    ...file,
    deletionStatus: 'skipped',
    retentionPolicy: 'keep',
    deleteAfterAt: null,
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Cleanup run
// ---------------------------------------------------------------------------

/**
 * Async callback that performs the actual file deletion.
 *
 * @param file  The file record to delete.
 * @returns `true` when the file was successfully deleted; `false` on failure.
 */
export type FileDeleter = (file: StatementFileRecord) => Promise<boolean>;

/** Options for {@link runCleanup}. */
export interface RunCleanupOptions {
  /** Override the current time for testing. */
  now?: Date;
}

/** Per-file outcome from a cleanup run. */
export interface CleanupOutcome {
  file: StatementFileRecord;
  result: 'deleted' | 'failed' | 'skipped';
}

/** Aggregate result returned by {@link runCleanup}. */
export interface CleanupResult {
  /** Files that were successfully deleted. */
  deleted: StatementFileRecord[];
  /** Files where deletion failed. */
  failed: StatementFileRecord[];
  /** Files that were skipped (policy === 'keep' or not yet expired). */
  skipped: StatementFileRecord[];
  /** Detailed per-file outcomes. */
  outcomes: CleanupOutcome[];
}

/**
 * Iterates over `files`, attempts to delete those that have expired, and
 * returns an aggregate {@link CleanupResult}.
 *
 * Files that are still within their retention window, or whose policy is
 * `'keep'`, are silently skipped.
 *
 * @param files    Full list of file records to evaluate.
 * @param deleter  Callback that performs the actual I/O deletion.
 * @param options  Optional override for the current time.
 *
 * @example
 * ```ts
 * const result = await runCleanup(files, async (f) => {
 *   await fs.promises.unlink(f.id);
 *   return true;
 * });
 * ```
 */
export async function runCleanup(
  files: StatementFileRecord[],
  deleter: FileDeleter,
  options: RunCleanupOptions = {},
): Promise<CleanupResult> {
  const now = options.now ?? new Date();
  const expired = findExpiredFiles(files, now);

  const deleted: StatementFileRecord[] = [];
  const failed: StatementFileRecord[] = [];
  const skipped: StatementFileRecord[] = files.filter((f) => !isExpired(f, now));
  const outcomes: CleanupOutcome[] = [];

  for (const file of expired) {
    let success: boolean;
    try {
      success = await deleter(file);
    } catch {
      success = false;
    }

    if (success) {
      const updated = markDeleted(file);
      deleted.push(updated);
      outcomes.push({ file: updated, result: 'deleted' });
    } else {
      const updated = markDeletionFailed(file);
      failed.push(updated);
      outcomes.push({ file: updated, result: 'failed' });
    }
  }

  for (const file of skipped) {
    outcomes.push({ file, result: 'skipped' });
  }

  return { deleted, failed, skipped, outcomes };
}

// ---------------------------------------------------------------------------
// Startup reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconciles the in-memory file store on application startup.
 *
 * Returns the same array with all records in their current state.  This is
 * a diagnostic pass: it does not modify any records, but it is the correct
 * place to add startup-time validation or logging before the first
 * {@link runCleanup} call handles any overdue files.
 *
 * Files that were pending deletion before the last shutdown will be picked up
 * by the next {@link runCleanup} call because {@link isExpired} evaluates
 * their `deleteAfterAt` against the current clock — no status change is needed
 * here.
 *
 * @param files  The current list of file records (e.g. loaded from disk/DB).
 * @param now    Override for the current time (useful in tests).
 */
export function reconcileOnStartup(
  files: StatementFileRecord[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  now: Date = new Date(),
): StatementFileRecord[] {
  return [...files];
}
