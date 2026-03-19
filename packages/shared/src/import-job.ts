/**
 * Import job model and orchestration for the SpendStack statement import system.
 *
 * An ImportJob tracks the full lifecycle of a single statement upload from the
 * moment it is queued through to successful completion or failure.  All state
 * transitions are validated to prevent impossible moves and each transition is
 * timestamped so the history can be reconstructed from the entity alone.
 *
 * Functions return new objects — they do not mutate their inputs.  Persistence,
 * clock injection, and ID generation are the caller's responsibility.
 */

import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * All possible statuses for an import job.
 *
 * State machine (valid transitions):
 *   queued       → processing
 *   processing   → completed | failed | needs_review
 *   needs_review → processing | completed | failed
 *   failed       → queued  (retry)
 */
export type ImportJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'needs_review';

/** Returns true when no further transitions are possible without an explicit retry. */
export function isTerminalJobStatus(status: ImportJobStatus): boolean {
  return status === 'completed' || status === 'failed';
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Diagnostic details recorded when a job transitions to `failed`.
 *
 * Prefer structured `code` values (e.g. `"NO_PARSER_FOUND"`, `"EXTRACTION_ERROR"`)
 * so that the UI can render targeted help text.  `details` carries additional
 * free-form context that is useful for support but not required for display.
 */
export interface ImportJobError {
  /** Short machine-readable code identifying the failure category. */
  code: string;
  /** Human-readable explanation of what went wrong. */
  message: string;
  /** Optional additional context (stack trace excerpt, raw parser output, etc.). */
  details?: string;
  /** ISO 8601 UTC timestamp of when the error was recorded. */
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Result summary attached to a completed or needs-review import job.
 *
 * Provides a breakdown of what happened to every row in the source file so
 * that callers can surface meaningful feedback to the user without having to
 * inspect the full transaction list.
 */
export interface ImportJobSummary {
  /** Total rows detected in the source file. */
  totalRowsDetected: number;
  /** Rows that were successfully normalised and persisted (or queued for persistence). */
  rowsProcessed: number;
  /** Rows skipped because they were exact duplicates of existing transactions. */
  rowsSkipped: number;
  /** Rows that could not be parsed or normalised. */
  rowsFailed: number;
  /** Rows that require human review before they can be finalised. */
  rowsFlaggedForReview: number;
  /** Stable identifier of the parser that processed this file. */
  parserId: string;
  /** Semver version of the parser. */
  parserVersion: string;
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/** Parameters required to create a new import job. */
export interface CreateImportJobParams {
  /**
   * Explicit stable ID for this job.  When omitted a random hex ID is
   * generated.  Pass the file's own ID here to keep a single stable
   * identifier across the import lifecycle (pipeline source traces, job
   * entity, and UI all reference the same value).
   */
  id?: string;
  /** ID of the file being imported. */
  fileId: string;
  /** Original file name as uploaded. */
  fileName: string;
  /** Account the statement belongs to. */
  accountId: string;
  /** ID of the user who initiated the upload. */
  uploadedByUserId: string;
}

/**
 * An import job entity.
 *
 * Represents the full lifecycle of a single statement upload.  The entity is
 * immutable — all mutation functions return a new object.
 */
export interface ImportJob {
  /** Unique stable identifier for this job. */
  id: string;
  /** ID of the file this job is processing. */
  fileId: string;
  /** Original file name as uploaded by the user. */
  fileName: string;
  /** Account the statement belongs to. */
  accountId: string;
  /** ID of the user who initiated the upload. */
  uploadedByUserId: string;
  /** Current job status. */
  status: ImportJobStatus;
  /** ISO 8601 UTC timestamp of when the job was created (queued). */
  createdAt: string;
  /** ISO 8601 UTC timestamp of when the job was last updated. */
  updatedAt: string;
  /** ISO 8601 UTC timestamp of when processing started (set on first processing transition). */
  startedAt?: string;
  /** ISO 8601 UTC timestamp of when the job reached a terminal state. */
  completedAt?: string;
  /** Diagnostic details — populated when `status` is `'failed'`. */
  error?: ImportJobError;
  /** Result summary — populated when `status` is `'completed'` or `'needs_review'`. */
  summary?: ImportJobSummary;
}

// ---------------------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<ImportJobStatus, readonly ImportJobStatus[]> = {
  queued: ['processing'],
  processing: ['completed', 'failed', 'needs_review'],
  needs_review: ['processing', 'completed', 'failed'],
  failed: ['queued'],
  completed: [],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new import job in the `queued` state.
 *
 * @example
 * ```ts
 * const job = createImportJob({
 *   fileId: 'file-abc',
 *   fileName: 'statement.csv',
 *   accountId: 'acc-1',
 *   uploadedByUserId: 'user-42',
 * });
 * ```
 */
export function createImportJob(params: CreateImportJobParams): ImportJob {
  const now = new Date().toISOString();
  return {
    id: params.id ?? randomBytes(8).toString('hex'),
    fileId: params.fileId,
    fileName: params.fileName,
    accountId: params.accountId,
    uploadedByUserId: params.uploadedByUserId,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transitions a job to a new status, enforcing the valid state machine.
 *
 * Returns a new `ImportJob` with updated `status` and `updatedAt`.  The
 * `startedAt` timestamp is set automatically on the first `processing`
 * transition; `completedAt` is set when reaching `completed` or `failed`.
 *
 * @throws {Error} when the transition is not permitted by the state machine.
 *
 * @example
 * ```ts
 * const processing = transitionJobStatus(job, 'processing');
 * ```
 */
export function transitionJobStatus(job: ImportJob, next: ImportJobStatus): ImportJob {
  const allowed = VALID_TRANSITIONS[job.status];
  if (!allowed.includes(next)) {
    throw new Error(
      `Invalid import job transition: "${job.status}" → "${next}". ` +
        `Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none'}.`,
    );
  }

  const now = new Date().toISOString();
  const updated: ImportJob = {
    ...job,
    status: next,
    updatedAt: now,
  };

  if (next === 'processing' && !job.startedAt) {
    updated.startedAt = now;
  }

  if (next === 'completed' || next === 'failed') {
    updated.completedAt = now;
  }

  // Retry: when re-queuing a failed job, clear all terminal-state fields so
  // the entity accurately reflects the fresh queued state (no stale error,
  // summary, or completedAt from the previous run).
  if (next === 'queued') {
    delete updated.completedAt;
    delete updated.error;
    delete updated.summary;
  }

  return updated;
}

/**
 * Records a failure on a job that is currently `processing` or `needs_review`.
 *
 * Transitions the job to `failed` and attaches diagnostic error details so
 * that the cause of failure can be surfaced in the UI and stored for support.
 *
 * @throws {Error} when the current status does not permit a transition to `failed`.
 *
 * @example
 * ```ts
 * const failed = recordJobError(job, {
 *   code: 'NO_PARSER_FOUND',
 *   message: 'No parser could handle this file format.',
 * });
 * ```
 */
export function recordJobError(
  job: ImportJob,
  error: Omit<ImportJobError, 'occurredAt'>,
): ImportJob {
  const withTransition = transitionJobStatus(job, 'failed');
  return {
    ...withTransition,
    error: {
      ...error,
      occurredAt: withTransition.updatedAt,
    },
  };
}

/**
 * Marks a job as completed and attaches a result summary.
 *
 * Transitions the job from `processing` or `needs_review` to `completed`
 * and records a breakdown of processed, skipped, and failed rows.
 *
 * @throws {Error} when the current status does not permit a transition to `completed`.
 *
 * @example
 * ```ts
 * const done = finalizeImportJob(job, {
 *   totalRowsDetected: 120,
 *   rowsProcessed: 115,
 *   rowsSkipped: 3,
 *   rowsFailed: 2,
 *   rowsFlaggedForReview: 0,
 *   parserId: 'icici-csv-v1',
 *   parserVersion: '1.0.0',
 * });
 * ```
 */
export function finalizeImportJob(job: ImportJob, summary: ImportJobSummary): ImportJob {
  const withTransition = transitionJobStatus(job, 'completed');
  return {
    ...withTransition,
    summary,
  };
}

/**
 * Attaches a result summary to a job transitioning to `needs_review`.
 *
 * Use this when the pipeline has flagged rows for human review before the
 * job can be fully finalised.
 *
 * @throws {Error} when the current status does not permit a transition to `needs_review`.
 */
export function markJobNeedsReview(job: ImportJob, summary: ImportJobSummary): ImportJob {
  const withTransition = transitionJobStatus(job, 'needs_review');
  return {
    ...withTransition,
    summary,
  };
}

/**
 * Returns a concise human-readable label for a job status, suitable for
 * display in a UI badge or status column.
 *
 * @example
 * ```ts
 * formatJobStatusLabel('needs_review') // => 'Needs Review'
 * ```
 */
export function formatJobStatusLabel(status: ImportJobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'needs_review':
      return 'Needs Review';
  }
}
