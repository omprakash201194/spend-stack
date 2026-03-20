/**
 * Statement file lifecycle management for SpendStack.
 *
 * Uploaded bank statement files are retained temporarily for traceability,
 * then automatically removed from app-managed storage after a configurable
 * retention period (default: 7 days).  Normalized transaction data is
 * kept indefinitely — only the source files are subject to cleanup.
 *
 * Key design principles:
 * - All state is represented in immutable records; no mutations.
 * - The actual file deletion is injected as a callback so callers control
 *   I/O and the module stays pure and testable.
 * - Cleanup is idempotent: already-deleted files are silently skipped.
 * - Cleanup is failure-tolerant: a failed deletion is recorded but does
 *   not abort the run for remaining files.
 * - Every cleanup action emits an audit event for full traceability.
 */

import { createAuditEvent } from './audit.js';
import type { AuditEvent } from './audit.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of days to retain a statement file before automatic deletion. */
export const DEFAULT_RETENTION_DAYS = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Determines how long a statement file is kept in app-managed storage. */
export type RetentionPolicy = 'auto_delete' | 'keep';

/**
 * Tracks where a file is in the deletion lifecycle.
 *
 * - `pending`  – File is within its retention window (or deletion not yet attempted).
 * - `deleted`  – File was successfully removed from storage.
 * - `failed`   – The most recent deletion attempt encountered an error; will be retried.
 * - `skipped`  – File was manually opted out of auto-deletion (policy changed to `keep`).
 */
export type DeletionStatus = 'pending' | 'deleted' | 'failed' | 'skipped';

/**
 * Metadata record for a stored bank statement file.
 *
 * All timestamps are ISO 8601 UTC strings.  The record is immutable — use
 * the helper functions to derive updated copies.
 */
export interface StatementFileRecord {
  /** Unique identifier for this file record. */
  id: string;
  /** Original file name as uploaded by the user. */
  fileName: string;
  /** ISO 8601 UTC timestamp of when the file was uploaded / imported. */
  uploadedAt: string;
  /** Controls whether the file will be auto-deleted after the retention window. */
  retentionPolicy: RetentionPolicy;
  /**
   * ISO 8601 UTC timestamp after which the file should be deleted.
   * `null` when `retentionPolicy` is `'keep'`.
   */
  deleteAfterAt: string | null;
  /** Current deletion status of this record. */
  deletionStatus: DeletionStatus;
  /** Human-readable reason populated when `deletionStatus` is `'failed'`. */
  deletionFailureReason?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new {@link StatementFileRecord} with the retention schedule
 * pre-computed.
 *
 * @param id             Unique identifier for this file record.
 * @param fileName       Original file name as uploaded by the user.
 * @param retentionPolicy `'auto_delete'` (default) schedules deletion after
 *                        the retention window; `'keep'` skips auto-deletion.
 * @param uploadedAt     Upload timestamp as an ISO 8601 string (defaults to now).
 * @param retentionDays  Days before deletion (defaults to {@link DEFAULT_RETENTION_DAYS}).
 *
 * @example
 * ```ts
 * const record = createStatementFileRecord('file-1', 'statement.csv');
 * // record.retentionPolicy === 'auto_delete'
 * // record.deleteAfterAt  === <7 days from now>
 * // record.deletionStatus === 'pending'
 * ```
 */
export function createStatementFileRecord(
  id: string,
  fileName: string,
  retentionPolicy: RetentionPolicy = 'auto_delete',
  uploadedAt: string = new Date().toISOString(),
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
 * Computes the ISO 8601 UTC timestamp after which the file should be deleted.
 *
 * @param uploadedAt    Upload timestamp as an ISO 8601 string.
 * @param retentionDays Number of days to retain the file (default: {@link DEFAULT_RETENTION_DAYS}).
 *
 * @example
 * ```ts
 * computeDeleteAfterAt('2024-01-01T00:00:00.000Z');
 * // => '2024-01-08T00:00:00.000Z'
 * ```
 */
export function computeDeleteAfterAt(
  uploadedAt: string,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): string {
  const d = new Date(uploadedAt);
  d.setDate(d.getDate() + retentionDays);
  return d.toISOString();
}

/**
 * Returns `true` when a file is past its retention deadline and should be
 * deleted.
 *
 * A file is **not** expired if:
 * - Its `retentionPolicy` is `'keep'`.
 * - Its `deletionStatus` is already `'deleted'` or `'skipped'`.
 * - Its `deleteAfterAt` is `null`.
 *
 * A file with `deletionStatus === 'failed'` **is** considered expired so
 * that a subsequent cleanup run will retry the deletion.
 *
 * @param file The file record to check.
 * @param now  Reference timestamp (defaults to `new Date()`).
 */
export function isExpired(file: StatementFileRecord, now: Date = new Date()): boolean {
  if (file.retentionPolicy === 'keep') return false;
  if (file.deletionStatus === 'deleted' || file.deletionStatus === 'skipped') return false;
  if (file.deleteAfterAt === null) return false;
  return now.getTime() >= new Date(file.deleteAfterAt).getTime();
}

/**
 * Filters a collection of file records to those that have passed their
 * retention deadline and are still awaiting deletion (or need to be retried).
 *
 * @param files All file records to check.
 * @param now   Reference timestamp (defaults to `new Date()`).
 */
export function findExpiredFiles(
  files: StatementFileRecord[],
  now: Date = new Date(),
): StatementFileRecord[] {
  return files.filter((f) => isExpired(f, now));
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

/**
 * Returns an updated copy of `file` with `deletionStatus` set to `'deleted'`.
 * Clears any previously recorded failure reason.
 * Does not mutate the original record.
 */
export function markDeleted(file: StatementFileRecord): StatementFileRecord {
  const updated = { ...file, deletionStatus: 'deleted' as DeletionStatus };
  delete updated.deletionFailureReason;
  return updated;
}

/**
 * Returns an updated copy of `file` with `deletionStatus` set to `'failed'`
 * and `deletionFailureReason` populated with the provided message.
 * Does not mutate the original record.
 */
export function markDeletionFailed(
  file: StatementFileRecord,
  reason: string,
): StatementFileRecord {
  return { ...file, deletionStatus: 'failed', deletionFailureReason: reason };
}

/**
 * Returns an updated copy of `file` with `retentionPolicy` changed to `'keep'`
 * and `deletionStatus` set to `'skipped'`.  Sets `deleteAfterAt` to `null`
 * since the file will no longer be auto-deleted.
 * Does not mutate the original record.
 */
export function markSkipped(file: StatementFileRecord): StatementFileRecord {
  const updated: StatementFileRecord = {
    ...file,
    retentionPolicy: 'keep',
    deletionStatus: 'skipped',
    deleteAfterAt: null,
  };
  delete updated.deletionFailureReason;
  return updated;
}

// ---------------------------------------------------------------------------
// Cleanup runner
// ---------------------------------------------------------------------------

/**
 * Callback type for the actual file deletion operation.
 *
 * Should throw an error (or return a rejected `Promise`) when deletion fails
 * so that the cleanup runner can record the failure correctly.
 */
export type FileDeleter = (fileId: string) => Promise<void>;

/** Options that customise a {@link runCleanup} or {@link reconcileOnStartup} run. */
export interface RunCleanupOptions {
  /**
   * ID of the actor performing cleanup.  Use `'system'` (default) for
   * automated scheduled runs and startup reconciliation.
   */
  actorId?: string;
  /**
   * Optional correlation ID to link all audit events in this run together.
   * If omitted the cleanup run emits a summary event without a correlationId.
   */
  correlationId?: string;
  /** Reference timestamp for expiry checks (defaults to `new Date()`). */
  now?: Date;
}

/**
 * Summary of a single cleanup run returned by {@link runCleanup} and
 * {@link reconcileOnStartup}.
 */
export interface CleanupResult {
  /**
   * All file records after this run.  Records that were eligible for
   * deletion have their `deletionStatus` updated; untouched records are
   * returned as-is.
   */
  updatedRecords: StatementFileRecord[];
  /** Number of files successfully deleted in this run. */
  deletedCount: number;
  /** Number of files where the deletion attempt failed in this run. */
  failedCount: number;
  /** Number of eligible files found at the start of this run. */
  eligibleCount: number;
  /**
   * Ordered list of audit events emitted during this run.
   * Callers should persist these to the audit log.
   */
  auditEvents: AuditEvent[];
}

/**
 * Deletes all expired statement files, emitting audit events for each
 * individual deletion outcome and a summary event for the run itself.
 *
 * **Idempotent** — already-deleted and skipped files are silently excluded.
 *
 * **Failure-tolerant** — if `deleter` throws for a particular file, that
 * file is marked `'failed'` and the run continues for the remaining files.
 *
 * @param files   Full list of {@link StatementFileRecord}s to evaluate.
 * @param deleter Callback that performs the actual file deletion.
 * @param options Optional run configuration (actor, correlation ID, clock).
 *
 * @example
 * ```ts
 * const result = await runCleanup(allFiles, async (id) => {
 *   await storageAdapter.delete(id);
 * });
 * // Persist result.auditEvents to the audit log.
 * // Persist result.updatedRecords to the file metadata store.
 * ```
 */
export async function runCleanup(
  files: StatementFileRecord[],
  deleter: FileDeleter,
  options: RunCleanupOptions = {},
): Promise<CleanupResult> {
  return _executeCleanup(files, deleter, 'scheduled', options);
}

/**
 * Startup reconciliation pass — functionally identical to {@link runCleanup}
 * but records `trigger: 'startup'` in the cleanup-run audit event.
 *
 * Call this once when the application starts to catch any files that should
 * have been removed during a previous session (e.g., after a crash or period
 * of downtime).
 *
 * @param files   Full list of {@link StatementFileRecord}s to evaluate.
 * @param deleter Callback that performs the actual file deletion.
 * @param options Optional run configuration (actor, correlation ID, clock).
 *
 * @example
 * ```ts
 * // On application startup:
 * const result = await reconcileOnStartup(storedFiles, storageAdapter.delete);
 * await auditStore.appendAll(result.auditEvents);
 * await fileMetaStore.saveAll(result.updatedRecords);
 * ```
 */
export async function reconcileOnStartup(
  files: StatementFileRecord[],
  deleter: FileDeleter,
  options: RunCleanupOptions = {},
): Promise<CleanupResult> {
  return _executeCleanup(files, deleter, 'startup', options);
}

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

async function _executeCleanup(
  files: StatementFileRecord[],
  deleter: FileDeleter,
  trigger: 'scheduled' | 'startup',
  options: RunCleanupOptions,
): Promise<CleanupResult> {
  const actorId = options.actorId ?? 'system';
  const correlationId = options.correlationId;
  const now = options.now ?? new Date();

  const expired = findExpiredFiles(files, now);
  const auditEvents: AuditEvent[] = [];

  // Build a mutable map for efficient record updates.
  const recordMap = new Map<string, StatementFileRecord>(files.map((f) => [f.id, f]));

  let deletedCount = 0;
  let failedCount = 0;

  for (const file of expired) {
    try {
      await deleter(file.id);
      const updated = markDeleted(file);
      recordMap.set(file.id, updated);
      deletedCount += 1;

      auditEvents.push(
        createAuditEvent({
          type: 'file.deleted',
          actorId,
          resourceType: 'statement_file',
          resourceId: file.id,
          ...(correlationId !== undefined ? { correlationId } : {}),
          metadata: { fileName: file.fileName, uploadedAt: file.uploadedAt },
        }),
      );
    } catch (err: unknown) {
      const reason =
        err instanceof Error ? err.message : 'Unknown deletion error';
      const updated = markDeletionFailed(file, reason);
      recordMap.set(file.id, updated);
      failedCount += 1;

      auditEvents.push(
        createAuditEvent({
          type: 'file.deletion_failed',
          actorId,
          resourceType: 'statement_file',
          resourceId: file.id,
          ...(correlationId !== undefined ? { correlationId } : {}),
          metadata: {
            fileName: file.fileName,
            uploadedAt: file.uploadedAt,
            reason,
          },
        }),
      );
    }
  }

  // Emit a summary event for the entire run.
  auditEvents.push(
    createAuditEvent({
      type: 'file.cleanup_run_completed',
      actorId,
      resourceType: 'cleanup_run',
      resourceId: now.toISOString(),
      ...(correlationId !== undefined ? { correlationId } : {}),
      metadata: {
        trigger,
        eligibleCount: expired.length,
        deletedCount,
        failedCount,
      },
    }),
  );

  return {
    updatedRecords: Array.from(recordMap.values()),
    deletedCount,
    failedCount,
    eligibleCount: expired.length,
    auditEvents,
  };
}
