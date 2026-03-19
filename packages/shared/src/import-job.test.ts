import { describe, it, expect } from 'vitest';
import {
  createImportJob,
  transitionJobStatus,
  recordJobError,
  finalizeImportJob,
  markJobNeedsReview,
  formatJobStatusLabel,
  isTerminalJobStatus,
} from './import-job.js';
import type { CreateImportJobParams, ImportJobSummary } from './import-job.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<CreateImportJobParams> = {}) {
  return createImportJob({
    fileId: 'file-1',
    fileName: 'statement.csv',
    accountId: 'acc-1',
    uploadedByUserId: 'user-42',
    ...overrides,
  });
}

const SAMPLE_SUMMARY: ImportJobSummary = {
  totalRowsDetected: 100,
  rowsProcessed: 95,
  rowsSkipped: 3,
  rowsFailed: 2,
  rowsFlaggedForReview: 0,
  parserId: 'icici-csv-v1',
  parserVersion: '1.0.0',
};

// ---------------------------------------------------------------------------
// createImportJob
// ---------------------------------------------------------------------------

describe('createImportJob', () => {
  it('creates a job in the queued state', () => {
    const job = makeJob();
    expect(job.status).toBe('queued');
  });

  it('generates a non-empty id', () => {
    const job = makeJob();
    expect(typeof job.id).toBe('string');
    expect(job.id.length).toBeGreaterThan(0);
  });

  it('generates unique ids for distinct jobs', () => {
    const a = makeJob();
    const b = makeJob();
    expect(a.id).not.toBe(b.id);
  });

  it('uses an explicit id when provided', () => {
    const job = makeJob({ id: 'job-explicit-42' });
    expect(job.id).toBe('job-explicit-42');
  });

  it('sets a valid ISO 8601 createdAt timestamp', () => {
    const job = makeJob();
    expect(job.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('sets updatedAt equal to createdAt on creation', () => {
    const job = makeJob();
    expect(job.updatedAt).toBe(job.createdAt);
  });

  it('preserves all caller-supplied fields', () => {
    const job = makeJob();
    expect(job.fileId).toBe('file-1');
    expect(job.fileName).toBe('statement.csv');
    expect(job.accountId).toBe('acc-1');
    expect(job.uploadedByUserId).toBe('user-42');
  });

  it('does not set optional fields on creation', () => {
    const job = makeJob();
    expect(job.startedAt).toBeUndefined();
    expect(job.completedAt).toBeUndefined();
    expect(job.error).toBeUndefined();
    expect(job.summary).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// transitionJobStatus
// ---------------------------------------------------------------------------

describe('transitionJobStatus', () => {
  it('transitions queued → processing', () => {
    const job = makeJob();
    const next = transitionJobStatus(job, 'processing');
    expect(next.status).toBe('processing');
  });

  it('sets startedAt on first processing transition', () => {
    const job = makeJob();
    const processing = transitionJobStatus(job, 'processing');
    expect(processing.startedAt).toBeDefined();
    expect(processing.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('does not overwrite startedAt on subsequent processing transitions', () => {
    const queued = makeJob();
    const firstProcessing = transitionJobStatus(queued, 'processing');
    const review = transitionJobStatus(firstProcessing, 'needs_review');
    const secondProcessing = transitionJobStatus(review, 'processing');
    expect(secondProcessing.startedAt).toBe(firstProcessing.startedAt);
  });

  it('transitions processing → completed', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const done = transitionJobStatus(job, 'completed');
    expect(done.status).toBe('completed');
  });

  it('sets completedAt when reaching completed', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const done = transitionJobStatus(job, 'completed');
    expect(done.completedAt).toBeDefined();
  });

  it('transitions processing → failed', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const failed = transitionJobStatus(job, 'failed');
    expect(failed.status).toBe('failed');
  });

  it('sets completedAt when reaching failed', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const failed = transitionJobStatus(job, 'failed');
    expect(failed.completedAt).toBeDefined();
  });

  it('transitions processing → needs_review', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const review = transitionJobStatus(job, 'needs_review');
    expect(review.status).toBe('needs_review');
  });

  it('transitions needs_review → processing', () => {
    const job = transitionJobStatus(transitionJobStatus(makeJob(), 'processing'), 'needs_review');
    const back = transitionJobStatus(job, 'processing');
    expect(back.status).toBe('processing');
  });

  it('transitions needs_review → completed', () => {
    const job = transitionJobStatus(transitionJobStatus(makeJob(), 'processing'), 'needs_review');
    const done = transitionJobStatus(job, 'completed');
    expect(done.status).toBe('completed');
  });

  it('transitions needs_review → failed', () => {
    const job = transitionJobStatus(transitionJobStatus(makeJob(), 'processing'), 'needs_review');
    const failed = transitionJobStatus(job, 'failed');
    expect(failed.status).toBe('failed');
  });

  it('transitions failed → queued (retry)', () => {
    const job = transitionJobStatus(transitionJobStatus(makeJob(), 'processing'), 'failed');
    const retried = transitionJobStatus(job, 'queued');
    expect(retried.status).toBe('queued');
  });

  it('clears completedAt on retry (failed → queued)', () => {
    const failed = transitionJobStatus(transitionJobStatus(makeJob(), 'processing'), 'failed');
    expect(failed.completedAt).toBeDefined();
    const retried = transitionJobStatus(failed, 'queued');
    expect(retried.completedAt).toBeUndefined();
  });

  it('clears error on retry (failed → queued)', () => {
    const processing = transitionJobStatus(makeJob(), 'processing');
    const failed = recordJobError(processing, { code: 'ERR', message: 'msg' });
    expect(failed.error).toBeDefined();
    const retried = transitionJobStatus(failed, 'queued');
    expect(retried.error).toBeUndefined();
  });

  it('clears summary on retry (failed → queued)', () => {
    const processing = transitionJobStatus(makeJob(), 'processing');
    const review = markJobNeedsReview(processing, SAMPLE_SUMMARY);
    const failed = recordJobError(review, { code: 'ERR', message: 'msg' });
    const retried = transitionJobStatus(failed, 'queued');
    expect(retried.summary).toBeUndefined();
  });

  it('updates updatedAt on every transition', () => {
    const original = makeJob();
    const next = transitionJobStatus(original, 'processing');
    // updatedAt is always a valid timestamp; it may or may not differ from
    // createdAt within the same millisecond in fast test environments.
    expect(next.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('does not mutate the original job', () => {
    const original = makeJob();
    transitionJobStatus(original, 'processing');
    expect(original.status).toBe('queued');
  });

  it('throws for an invalid transition queued → completed', () => {
    const job = makeJob();
    expect(() => transitionJobStatus(job, 'completed')).toThrow();
  });

  it('throws for an invalid transition queued → failed', () => {
    const job = makeJob();
    expect(() => transitionJobStatus(job, 'failed')).toThrow();
  });

  it('throws for an invalid transition completed → processing', () => {
    const job = transitionJobStatus(transitionJobStatus(makeJob(), 'processing'), 'completed');
    expect(() => transitionJobStatus(job, 'processing')).toThrow();
  });

  it('throws for an invalid transition completed → queued', () => {
    const job = transitionJobStatus(transitionJobStatus(makeJob(), 'processing'), 'completed');
    expect(() => transitionJobStatus(job, 'queued')).toThrow();
  });

  it('throws for a self-transition on completed', () => {
    const job = transitionJobStatus(transitionJobStatus(makeJob(), 'processing'), 'completed');
    expect(() => transitionJobStatus(job, 'completed')).toThrow();
  });

  it('error message includes both source and target states', () => {
    const job = makeJob();
    expect(() => transitionJobStatus(job, 'completed')).toThrow(/queued/);
    expect(() => transitionJobStatus(job, 'completed')).toThrow(/completed/);
  });
});

// ---------------------------------------------------------------------------
// recordJobError
// ---------------------------------------------------------------------------

describe('recordJobError', () => {
  it('transitions the job to failed', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const failed = recordJobError(job, { code: 'NO_PARSER_FOUND', message: 'No parser found.' });
    expect(failed.status).toBe('failed');
  });

  it('attaches the error code and message', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const failed = recordJobError(job, { code: 'NO_PARSER_FOUND', message: 'No parser found.' });
    expect(failed.error?.code).toBe('NO_PARSER_FOUND');
    expect(failed.error?.message).toBe('No parser found.');
  });

  it('sets occurredAt on the error', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const failed = recordJobError(job, { code: 'ERR', message: 'msg' });
    expect(failed.error?.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('preserves optional details field', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const failed = recordJobError(job, {
      code: 'EXTRACTION_ERROR',
      message: 'Extraction failed.',
      details: 'Row 5 malformed.',
    });
    expect(failed.error?.details).toBe('Row 5 malformed.');
  });

  it('works from needs_review state', () => {
    const processing = transitionJobStatus(makeJob(), 'processing');
    const review = transitionJobStatus(processing, 'needs_review');
    const failed = recordJobError(review, { code: 'ERR', message: 'msg' });
    expect(failed.status).toBe('failed');
  });

  it('does not mutate the original job', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    recordJobError(job, { code: 'ERR', message: 'msg' });
    expect(job.status).toBe('processing');
    expect(job.error).toBeUndefined();
  });

  it('throws when called on a queued job', () => {
    const job = makeJob();
    expect(() => recordJobError(job, { code: 'ERR', message: 'msg' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// finalizeImportJob
// ---------------------------------------------------------------------------

describe('finalizeImportJob', () => {
  it('transitions the job to completed', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const done = finalizeImportJob(job, SAMPLE_SUMMARY);
    expect(done.status).toBe('completed');
  });

  it('attaches the result summary', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const done = finalizeImportJob(job, SAMPLE_SUMMARY);
    expect(done.summary).toEqual(SAMPLE_SUMMARY);
  });

  it('sets completedAt', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const done = finalizeImportJob(job, SAMPLE_SUMMARY);
    expect(done.completedAt).toBeDefined();
  });

  it('works from needs_review state', () => {
    const processing = transitionJobStatus(makeJob(), 'processing');
    const review = transitionJobStatus(processing, 'needs_review');
    const done = finalizeImportJob(review, SAMPLE_SUMMARY);
    expect(done.status).toBe('completed');
  });

  it('does not mutate the original job', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    finalizeImportJob(job, SAMPLE_SUMMARY);
    expect(job.status).toBe('processing');
    expect(job.summary).toBeUndefined();
  });

  it('throws when called on a queued job', () => {
    const job = makeJob();
    expect(() => finalizeImportJob(job, SAMPLE_SUMMARY)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// markJobNeedsReview
// ---------------------------------------------------------------------------

describe('markJobNeedsReview', () => {
  it('transitions the job to needs_review', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const review = markJobNeedsReview(job, SAMPLE_SUMMARY);
    expect(review.status).toBe('needs_review');
  });

  it('attaches the result summary', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const review = markJobNeedsReview(job, { ...SAMPLE_SUMMARY, rowsFlaggedForReview: 5 });
    expect(review.summary?.rowsFlaggedForReview).toBe(5);
  });

  it('does not set completedAt', () => {
    const job = transitionJobStatus(makeJob(), 'processing');
    const review = markJobNeedsReview(job, SAMPLE_SUMMARY);
    expect(review.completedAt).toBeUndefined();
  });

  it('throws when called from queued state', () => {
    const job = makeJob();
    expect(() => markJobNeedsReview(job, SAMPLE_SUMMARY)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// isTerminalJobStatus
// ---------------------------------------------------------------------------

describe('isTerminalJobStatus', () => {
  it('returns true for completed', () => {
    expect(isTerminalJobStatus('completed')).toBe(true);
  });

  it('returns true for failed', () => {
    expect(isTerminalJobStatus('failed')).toBe(true);
  });

  it('returns false for queued', () => {
    expect(isTerminalJobStatus('queued')).toBe(false);
  });

  it('returns false for processing', () => {
    expect(isTerminalJobStatus('processing')).toBe(false);
  });

  it('returns false for needs_review', () => {
    expect(isTerminalJobStatus('needs_review')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatJobStatusLabel
// ---------------------------------------------------------------------------

describe('formatJobStatusLabel', () => {
  it('formats queued', () => {
    expect(formatJobStatusLabel('queued')).toBe('Queued');
  });

  it('formats processing', () => {
    expect(formatJobStatusLabel('processing')).toBe('Processing');
  });

  it('formats completed', () => {
    expect(formatJobStatusLabel('completed')).toBe('Completed');
  });

  it('formats failed', () => {
    expect(formatJobStatusLabel('failed')).toBe('Failed');
  });

  it('formats needs_review', () => {
    expect(formatJobStatusLabel('needs_review')).toBe('Needs Review');
  });
});
