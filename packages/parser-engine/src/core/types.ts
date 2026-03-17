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
 * The full output produced by running a parser on a statement file.
 */
export interface ParseResult {
  rawRows: RawStatementRow[];
  normalizedCandidates: NormalizedTransaction[];
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
