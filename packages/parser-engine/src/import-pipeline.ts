/**
 * Import pipeline orchestration for the SpendStack statement import system.
 *
 * Implements the 9-stage pipeline described in the technical specification:
 *   1. Intake        — validate input and create file / job records
 *   2. Resolution    — detect the correct parser
 *   3. Extraction    — produce RawStatementRows
 *   4. Normalization — produce NormalizedTransaction candidates
 *   5. Duplicate Detection — classify incoming vs existing transactions
 *   6. Transfer Detection  — (placeholder; to be implemented in a later epic)
 *   7. Categorization      — (placeholder; handled by rules engine)
 *   8. Review Queue        — flag transactions requiring human review
 *   9. Finalization        — emit the completed pipeline result
 */

import type { FileType, NormalizedTransaction, RawStatementRow, ImportJobStatus, TransactionSourceTrace } from './core/types.js';
import { resolveParser } from './parser-registry.js';
import { detectDuplicates } from './core/duplicate-detector.js';
import type { DuplicateDetectionResult } from './core/duplicate-detector.js';
import {
  createStatementFileRecord,
  type StatementFileRecord,
  type RetentionPolicy,
} from './core/file-retention.js';
import type { ReviewQueueReason } from './core/types.js';

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface ImportPipelineInput {
  /** Unique identifier for the file being uploaded. */
  fileId: string;
  /** Original file name as uploaded by the user. */
  fileName: string;
  /** Raw string content of the file (text-based formats). */
  fileContent: string;
  fileType: FileType;
  /** Account ID that the statement belongs to. */
  accountId: string;
  uploadedByUserId: string;
  /** Transactions already stored for this account (for duplicate detection). */
  existingTransactions?: NormalizedTransaction[];
  /** Retention policy for the uploaded file (default: "auto_delete"). */
  retentionPolicy?: RetentionPolicy;
}

/** A single item queued for human review. */
export interface ReviewQueueItem {
  sourceReference: string;
  reason: ReviewQueueReason;
  transaction: NormalizedTransaction | null;
  rawRow: RawStatementRow;
}

export interface ImportPipelineResult {
  statementFile: StatementFileRecord;
  /** Stable ID of the import job (equals fileId for simplicity at this layer). */
  importJobId: string;
  parserId: string;
  parserVersion: string;
  status: ImportJobStatus;
  rawRows: RawStatementRow[];
  normalizedTransactions: NormalizedTransaction[];
  duplicates: DuplicateDetectionResult;
  reviewItems: ReviewQueueItem[];
  parserWarnings: string[];
  /** Whether any items require human review before finalization. */
  reviewRequired: boolean;
  /**
   * Source traceability records — one per normalized transaction candidate
   * (including duplicates and review items).  Callers can use these to link
   * any transaction back to the exact raw row and source file it came from.
   */
  sourceTraces: TransactionSourceTrace[];
  metrics: {
    totalRowsDetected: number;
    rowsParsed: number;
    rowsFlaggedForReview: number;
    duplicateRowsSkipped: number;
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the full statement import pipeline for a single file upload.
 *
 * This function is pure and side-effect-free: it does not touch the database
 * or filesystem.  Persistence is the responsibility of the caller.
 *
 * @throws {ImportPipelineError} when a fatal error occurs (e.g. no parser found).
 */
export function runImportPipeline(input: ImportPipelineInput): ImportPipelineResult {
  const {
    fileId,
    fileName,
    fileContent,
    fileType,
    accountId,
    // Preserved for future use in audit trail and file ownership tracking.
    uploadedByUserId: _uploadedByUserId,
    existingTransactions = [],
    retentionPolicy = 'auto_delete',
  } = input;

  // ------------------------------------------------------------------
  // Stage 1: Intake — build the StatementFile record
  // ------------------------------------------------------------------
  const statementFile = createStatementFileRecord(fileId, fileName, retentionPolicy);

  // ------------------------------------------------------------------
  // Stage 2: Parser Resolution
  // ------------------------------------------------------------------
  const parser = resolveParser(fileContent, fileType);
  if (!parser) {
    return {
      statementFile,
      importJobId: fileId,
      parserId: 'unknown',
      parserVersion: 'unknown',
      status: 'failed',
      rawRows: [],
      normalizedTransactions: [],
      duplicates: { unique: [], exactDuplicates: [], fuzzyCandidates: [] },
      reviewItems: [],
      parserWarnings: [`No parser found for fileType="${fileType}". The file format may not be supported.`],
      reviewRequired: false,
      sourceTraces: [],
      metrics: {
        totalRowsDetected: 0,
        rowsParsed: 0,
        rowsFlaggedForReview: 0,
        duplicateRowsSkipped: 0,
      },
    };
  }

  const warnings: string[] = [];

  // ------------------------------------------------------------------
  // Stage 3: Extraction
  // ------------------------------------------------------------------
  const rawRows = parser.extract(fileContent);

  // ------------------------------------------------------------------
  // Stage 4: Normalization
  // ------------------------------------------------------------------
  const normalizedCandidates = parser.normalize(rawRows);

  // Run validation to enrich confidence summary and warnings
  const validated = parser.validate({
    rawRows,
    normalizedCandidates,
    parserWarnings: [],
    confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
    debugMetadata: { fileId, fileType },
  });
  warnings.push(...validated.parserWarnings);

  // ------------------------------------------------------------------
  // Stage 5: Duplicate Detection
  // ------------------------------------------------------------------
  const duplicates = detectDuplicates(normalizedCandidates, existingTransactions, accountId);

  // ------------------------------------------------------------------
  // Stage 6: Transfer Detection (placeholder — Epic 4)
  // ------------------------------------------------------------------
  // Transfer detection requires access to other accounts' transactions and
  // will be implemented as part of the Transaction Intelligence epic.

  // ------------------------------------------------------------------
  // Stage 7: Categorization (placeholder — Epic 5)
  // ------------------------------------------------------------------
  // The rules engine will be applied after this pipeline returns.

  // ------------------------------------------------------------------
  // Stage 8: Review Queue
  // ------------------------------------------------------------------
  const reviewItems: ReviewQueueItem[] = [];

  // Surface fuzzy duplicate candidates for human review
  for (const fuzzy of duplicates.fuzzyCandidates) {
    const matchedRow = rawRows.find((r) => r.sourceReference === fuzzy.incoming.rawReference);
    if (!matchedRow) {
      // Cannot reliably associate a raw row — skip this review item to avoid
      // linking it to an unrelated row.
      continue;
    }
    reviewItems.push({
      sourceReference: fuzzy.incoming.rawReference || 'unknown',
      reason: 'duplicate_conflict',
      transaction: fuzzy.incoming,
      rawRow: matchedRow,
    });
  }

  // Surface low-confidence rows
  const failedCount = validated.confidenceSummary.failed;
  if (failedCount > 0) {
    warnings.push(`${failedCount} row(s) failed to parse and were excluded.`);
  }
  for (const row of rawRows) {
    if (!row.extractedDateText || !row.extractedAmountText) {
      reviewItems.push({
        sourceReference: row.sourceReference,
        reason: row.extractedDateText ? 'missing_amount' : 'missing_date',
        transaction: null,
        rawRow: row,
      });
    }
  }

  const reviewRequired = reviewItems.length > 0;

  // ------------------------------------------------------------------
  // Stage 9: Finalization
  // ------------------------------------------------------------------
  const status: ImportJobStatus = reviewRequired ? 'review_required' : 'finalized';

  // Build source traceability records — one per normalized candidate,
  // preserving the raw row at the corresponding index so any transaction
  // can be traced back to its exact line in the original file.
  const importedAt = new Date().toISOString();
  const sourceTraces: TransactionSourceTrace[] = normalizedCandidates.map((_, index) => {
    const rawRow = rawRows[index] ?? {
      sourceReference: `row-${index}`,
      rawText: '',
      extractedDateText: '',
      extractedAmountText: '',
      extractedDescriptionText: '',
      extractionMetadata: {},
    };
    return {
      normalizedIndex: index,
      sourceReference: rawRow.sourceReference,
      sourceFileId: fileId,
      sourceFileName: fileName,
      importJobId: fileId,
      parserId: parser.parserId,
      parserVersion: parser.parserVersion,
      rawRow,
      importedAt,
    };
  });

  return {
    statementFile,
    importJobId: fileId,
    parserId: parser.parserId,
    parserVersion: parser.parserVersion,
    status,
    rawRows,
    normalizedTransactions: duplicates.unique,
    duplicates,
    reviewItems,
    parserWarnings: warnings,
    reviewRequired,
    sourceTraces,
    metrics: {
      totalRowsDetected: rawRows.length,
      rowsParsed: normalizedCandidates.length,
      rowsFlaggedForReview: reviewItems.length,
      duplicateRowsSkipped: duplicates.exactDuplicates.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ImportPipelineError extends Error {
  constructor(
    message: string,
    public readonly fileId: string,
  ) {
    super(message);
    this.name = 'ImportPipelineError';
  }
}
