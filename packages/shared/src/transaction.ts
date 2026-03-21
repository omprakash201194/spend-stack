/**
 * Normalized transaction model for SpendStack.
 *
 * Defines the canonical transaction entity used throughout the application.
 * Every normalized transaction retains full traceability to its import source
 * so that the provenance chain (statement file → source row → transaction) is
 * always auditable.
 *
 * Design principles:
 * - All functions return new objects — inputs are never mutated.
 * - Import linkage is mandatory: every transaction must carry `importJobId`,
 *   `sourceFileId`, and `sourceReference` so the origin is always traceable.
 * - Validation rules are explicit and machine-readable so that callers can
 *   display targeted error messages without inspecting raw strings.
 */

import { randomHex } from './random-hex.js';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Direction of money flow relative to the account. */
export type TransactionType = 'debit' | 'credit';

/** Lifecycle status of a normalized transaction. */
export type TransactionStatus = 'pending' | 'cleared' | 'void';

/**
 * A normalized transaction produced from a bank statement row.
 *
 * Monetary values are stored as positive numbers in the account's currency
 * unit (e.g. rupees, not paise).  Direction is captured by the `type` field.
 *
 * Every transaction carries import-linkage fields (`importJobId`,
 * `sourceFileId`, `sourceReference`) so the full provenance chain can always
 * be reconstructed for auditing and duplicate-detection purposes.
 */
export interface Transaction {
  /** Unique stable identifier for this transaction. */
  id: string;
  /** Account this transaction belongs to. */
  accountId: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  date: string;
  /** Original description from the statement. */
  description: string;
  /** Whether money left (`debit`) or entered (`credit`) the account. */
  type: TransactionType;
  /** Transaction amount — always a positive number. */
  amount: number;
  /** ISO 4217 currency code (e.g. `"INR"`). */
  currency: string;
  /** Running balance after this transaction, when present in the statement. */
  balance?: number;
  /** Current lifecycle status. */
  status: TransactionStatus;

  // ── Import linkage ────────────────────────────────────────────────────────
  /** ID of the import job that produced this transaction. */
  importJobId: string;
  /** ID of the source statement file. */
  sourceFileId: string;
  /**
   * Row-level reference back to the originating source row (matches the
   * `RawStatementRow.sourceReference` value emitted by the parser engine).
   */
  sourceReference: string;

  // ── Timestamps ────────────────────────────────────────────────────────────
  /** ISO 8601 UTC timestamp when this record was created. */
  createdAt: string;
  /** ISO 8601 UTC timestamp when this record was last updated. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Parameters required to create a new normalized transaction. */
export interface CreateTransactionParams {
  /**
   * Explicit stable ID.  When omitted a random `tx-<hex>` ID is generated.
   * Pass a deterministic ID (e.g. derived from source row fingerprint) to
   * simplify idempotent re-imports.
   */
  id?: string;
  /** Account this transaction belongs to. */
  accountId: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  date: string;
  /** Description from the statement. */
  description: string;
  /** Whether money left (`debit`) or entered (`credit`) the account. */
  type: TransactionType;
  /** Transaction amount — must be a non-negative number. */
  amount: number;
  /** ISO 4217 currency code.  Defaults to `"INR"`. */
  currency?: string;
  /** Running balance after this transaction. */
  balance?: number;
  /** Initial lifecycle status.  Defaults to `"cleared"`. */
  status?: TransactionStatus;
  /** ID of the import job that produced this transaction. */
  importJobId: string;
  /** ID of the source statement file. */
  sourceFileId: string;
  /** Row-level reference back to the source file row. */
  sourceReference: string;
}

/**
 * Creates a new normalized transaction.
 *
 * The `createdAt` and `updatedAt` timestamps are set to the current UTC time.
 * Validation is not performed here — call {@link validateTransaction} when
 * you need to enforce rules.
 *
 * @example
 * ```ts
 * const tx = createTransaction({
 *   accountId: 'acc-1',
 *   date: '2024-01-15',
 *   description: 'UPI Payment to Swiggy',
 *   type: 'debit',
 *   amount: 450,
 *   importJobId: 'job-1',
 *   sourceFileId: 'file-1',
 *   sourceReference: '2',
 * });
 * ```
 */
export function createTransaction(params: CreateTransactionParams): Transaction {
  const now = new Date().toISOString();
  return {
    id: params.id ?? `tx-${randomHex(8)}`,
    accountId: params.accountId,
    date: params.date,
    description: params.description,
    type: params.type,
    amount: params.amount,
    currency: params.currency ?? 'INR',
    balance: params.balance,
    status: params.status ?? 'cleared',
    importJobId: params.importJobId,
    sourceFileId: params.sourceFileId,
    sourceReference: params.sourceReference,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Machine-readable codes for transaction validation failures.
 *
 * Using an explicit union (rather than open strings) lets callers switch on
 * the code to display targeted help text or take corrective action.
 */
export type TransactionValidationErrorCode =
  | 'missing_id'
  | 'missing_account_id'
  | 'missing_date'
  | 'invalid_date_format'
  | 'missing_description'
  | 'missing_type'
  | 'invalid_type'
  | 'missing_amount'
  | 'negative_amount'
  | 'invalid_amount'
  | 'missing_currency'
  | 'missing_import_job_id'
  | 'missing_source_file_id'
  | 'missing_source_reference';

/** A single rule violation produced by {@link validateTransaction}. */
export interface TransactionValidationError {
  /** Machine-readable code — safe to switch on. */
  code: TransactionValidationErrorCode;
  /** Human-readable explanation of the violation. */
  message: string;
}

/** Result returned by {@link validateTransaction}. */
export interface TransactionValidationResult {
  /** `true` when all validation rules pass. */
  valid: boolean;
  /** All violations found.  Empty array when `valid` is `true`. */
  errors: TransactionValidationError[];
}

/** ISO 8601 date pattern (YYYY-MM-DD). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valid transaction type values. */
const VALID_TYPES: ReadonlySet<string> = new Set<TransactionType>(['debit', 'credit']);

/**
 * Validates a transaction against all required-field and format rules.
 *
 * Rules enforced:
 * - `id` must be a non-empty string.
 * - `accountId` must be a non-empty string.
 * - `date` must be present and in `YYYY-MM-DD` format.
 * - `description` must be a non-empty string.
 * - `type` must be `"debit"` or `"credit"`.
 * - `amount` must be present and non-negative.
 * - `currency` must be a non-empty string.
 * - `importJobId`, `sourceFileId`, `sourceReference` must all be non-empty
 *   (import linkage is mandatory for traceability).
 *
 * Returns a {@link TransactionValidationResult} — never throws.
 *
 * @example
 * ```ts
 * const result = validateTransaction(tx);
 * if (!result.valid) {
 *   for (const err of result.errors) {
 *     console.error(err.code, err.message);
 *   }
 * }
 * ```
 */
export function validateTransaction(tx: unknown): TransactionValidationResult {
  const errors: TransactionValidationError[] = [];

  if (tx == null || typeof tx !== 'object') {
    return {
      valid: false,
      errors: [
        { code: 'missing_id', message: 'Transaction ID is required.' },
        { code: 'missing_account_id', message: 'Account ID is required.' },
        { code: 'missing_date', message: 'Transaction date is required.' },
        { code: 'missing_description', message: 'Transaction description is required.' },
        { code: 'missing_type', message: 'Transaction type is required.' },
        { code: 'missing_amount', message: 'Transaction amount is required.' },
        { code: 'missing_currency', message: 'Transaction currency is required.' },
        { code: 'missing_import_job_id', message: 'Import job ID is required for source traceability.' },
        { code: 'missing_source_file_id', message: 'Source file ID is required for source traceability.' },
        { code: 'missing_source_reference', message: 'Source reference is required for source traceability.' },
      ],
    };
  }

  const t = tx as Record<string, unknown>;

  if (typeof t.id !== 'string' || !t.id.trim()) {
    errors.push({ code: 'missing_id', message: 'Transaction ID is required.' });
  }

  if (typeof t.accountId !== 'string' || !t.accountId.trim()) {
    errors.push({ code: 'missing_account_id', message: 'Account ID is required.' });
  }

  if (typeof t.date !== 'string' || !t.date.trim()) {
    errors.push({ code: 'missing_date', message: 'Transaction date is required.' });
  } else if (!ISO_DATE_RE.test(t.date)) {
    errors.push({
      code: 'invalid_date_format',
      message: `Date "${t.date}" must be in YYYY-MM-DD format.`,
    });
  }

  if (typeof t.description !== 'string' || !t.description.trim()) {
    errors.push({ code: 'missing_description', message: 'Transaction description is required.' });
  }

  if (typeof t.type !== 'string' || !t.type) {
    errors.push({ code: 'missing_type', message: 'Transaction type is required.' });
  } else if (!VALID_TYPES.has(t.type)) {
    errors.push({
      code: 'invalid_type',
      message: `Transaction type "${t.type}" must be "debit" or "credit".`,
    });
  }

  if (t.amount === undefined || t.amount === null) {
    errors.push({ code: 'missing_amount', message: 'Transaction amount is required.' });
  } else if (typeof t.amount !== 'number' || !Number.isFinite(t.amount)) {
    errors.push({
      code: 'invalid_amount',
      message: `Amount ${String(t.amount)} must be a finite number.`,
    });
  } else if (t.amount < 0) {
    errors.push({
      code: 'negative_amount',
      message: `Amount ${t.amount} must be non-negative.`,
    });
  }

  if (typeof t.currency !== 'string' || !t.currency.trim()) {
    errors.push({ code: 'missing_currency', message: 'Transaction currency is required.' });
  }

  if (typeof t.importJobId !== 'string' || !t.importJobId.trim()) {
    errors.push({
      code: 'missing_import_job_id',
      message: 'Import job ID is required for source traceability.',
    });
  }

  if (typeof t.sourceFileId !== 'string' || !t.sourceFileId.trim()) {
    errors.push({
      code: 'missing_source_file_id',
      message: 'Source file ID is required for source traceability.',
    });
  }

  if (typeof t.sourceReference !== 'string' || !t.sourceReference.trim()) {
    errors.push({
      code: 'missing_source_reference',
      message: 'Source reference is required for source traceability.',
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Returns `true` when the transaction passes all validation rules.
 *
 * Use {@link validateTransaction} when you need the specific rule violations.
 *
 * @example
 * ```ts
 * if (!isValidTransaction(tx)) {
 *   throw new Error('Transaction failed validation');
 * }
 * ```
 */
export function isValidTransaction(tx: unknown): boolean {
  return validateTransaction(tx).valid;
}
