/**
 * Core type definitions for the SpendStack parser engine.
 *
 * These interfaces define the contract between bank-specific parsers and the
 * shared normalization / import pipeline.
 */

export type FileType = 'pdf' | 'csv' | 'xlsx';

export type BankName = 'icici' | 'bank-of-baroda' | 'kotak';

/** ISO 4217 currency code, e.g. "INR". */
export type CurrencyCode = string;

/**
 * A single transaction in the canonical normalized form used throughout
 * the import pipeline.
 */
export interface NormalizedTransaction {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  description: string;
  /** Amount debited from the account. Null when not applicable. */
  debitAmount: number | null;
  /** Amount credited to the account. Null when not applicable. */
  creditAmount: number | null;
  /**
   * Signed amount: negative for debits, positive for credits.
   * Always populated after normalization.
   */
  signedAmount: number;
  /** Closing balance after this transaction, when present in the statement. */
  balanceIfAvailable: number | null;
  /** Currency of the transaction (default: "INR"). */
  currency: CurrencyCode;
  /**
   * The raw reference or cheque number from the source statement.
   * Empty string when not present.
   */
  rawReference: string;
  /**
   * The `RawStatementRow.sourceReference` of the row this transaction was
   * produced from.  Carried through normalization so that parsers can link
   * validation errors back to the exact source row.
   */
  sourceReference?: string;
}

/**
 * A single row extracted verbatim from the source statement before
 * any normalization is applied.  Preserved for traceability and debugging.
 */
export interface RawStatementRow {
  /** Row index within the source file (e.g. "2", "page2-row4"). */
  sourceReference: string;
  /** Full raw text of this row as it appeared in the source. */
  rawText: string;
  extractedDateText: string;
  extractedAmountText: string;
  extractedDescriptionText: string;
  /** Any additional metadata captured during extraction. */
  extractionMetadata: Record<string, unknown>;
}

export interface ParseConfidenceSummary {
  totalRows: number;
  highConfidence: number;
  lowConfidence: number;
  failed: number;
}

/**
 * Machine-readable codes for errors emitted by bank parsers.
 *
 * Using an explicit union (rather than an open string type) ensures every
 * parser emits a code that callers can safely switch on.
 */
export type ParseErrorCode =
  | 'missing_date'
  | 'missing_amount'
  | 'empty_description'
  | 'invalid_format'
  | 'column_mapping_failed'
  | 'unsupported_format';

/**
 * A structured error produced by a bank parser.
 *
 * All parsers must use this type (via `ParseResult.parseErrors`) so that
 * callers can handle errors uniformly regardless of which adapter ran.
 */
export interface ParseError {
  /** Machine-readable error code — allows callers to switch on error type. */
  code: ParseErrorCode;
  /** Human-readable explanation of the error. */
  message: string;
  /** Whether the error is fatal for this row ('error') or advisory ('warning'). */
  severity: 'error' | 'warning';
  /**
   * The `RawStatementRow.sourceReference` of the row that caused the error,
   * when the error can be tied to a specific row.
   */
  sourceReference?: string;
}

/**
 * The full output produced by running a parser on a statement file.
 */
export interface ParseResult {
  rawRows: RawStatementRow[];
  normalizedCandidates: NormalizedTransaction[];
  /** Structured errors captured during extraction and validation. */
  parseErrors: ParseError[];
  /**
   * @deprecated Use `parseErrors` for structured error capture.
   * Kept for backward compatibility; mirrors the `message` fields of
   * all entries in `parseErrors` (both 'error' and 'warning' severity).
   */
  parserWarnings: string[];
  confidenceSummary: ParseConfidenceSummary;
  debugMetadata: Record<string, unknown>;
}

/**
 * Contract that every bank parser must satisfy.
 *
 * Parsers are stateless — all state lives in their inputs and outputs.
 */
export interface ParserDefinition {
  /** Unique stable identifier for this parser, e.g. "icici-csv-v1". */
  parserId: string;
  bankName: BankName;
  supportedFileTypes: FileType[];
  /** Semver-style version string used to version-stamp every ImportJob. */
  parserVersion: string;

  /**
   * Sniff the content and return true if this parser can handle it.
   * For CSV parsers this typically means checking column headers.
   */
  detect(content: string): boolean;

  /**
   * Convert raw file content into a list of RawStatementRows.
   * No normalization should happen here — preserve source fidelity.
   */
  extract(content: string): RawStatementRow[];

  /**
   * Convert RawStatementRows into NormalizedTransaction candidates.
   */
  normalize(rows: RawStatementRow[]): NormalizedTransaction[];

  /**
   * Enrich a ParseResult with confidence scores and any final warnings.
   */
  validate(result: ParseResult): ParseResult;
}

/** Reasons a transaction may be placed in the review queue. */
export type ReviewQueueReason =
  | 'low_confidence_parse'
  | 'duplicate_conflict'
  | 'ambiguous_transfer'
  | 'missing_date'
  | 'missing_amount'
  | 'parser_warning';

/** Possible statuses for a statement import job. */
export type ImportJobStatus =
  | 'uploaded'
  | 'parsing'
  | 'review_required'
  | 'finalized'
  | 'failed'
  | 'cancelled';

/**
 * Links a normalized transaction back to its origin in the source statement
 * file.  Stored alongside import results to satisfy the "imported transactions
 * can be traced back to source file and normalized row" requirement.
 *
 * The `normalizedIndex` field identifies the position of the corresponding
 * `NormalizedTransaction` in the `normalizedCandidates` array produced by the
 * parser, enabling a precise many-to-one relationship even when multiple rows
 * produce the same fingerprint.
 */
export interface TransactionSourceTrace {
  /**
   * Zero-based index of the corresponding entry in the
   * `ImportPipelineResult.normalizedTransactions` candidates array.
   */
  normalizedIndex: number;
  /** Matches `RawStatementRow.sourceReference` for the originating raw row. */
  sourceReference: string;
  /** ID of the source statement file. */
  sourceFileId: string;
  /** Human-readable file name (as uploaded by the user). */
  sourceFileName: string;
  /** ID of the import job that produced this transaction. */
  importJobId: string;
  /** Stable parser identifier (e.g. `"icici-csv-v1"`). */
  parserId: string;
  /** Semver version of the parser. */
  parserVersion: string;
  /** The verbatim row from the source file — preserved for full traceability. */
  rawRow: RawStatementRow;
  /** ISO 8601 UTC timestamp of when this transaction was imported. */
  importedAt: string;
}
