/**
 * Transaction normalization.
 *
 * Converts raw imported rows into well-formed, typed Transaction records.
 * Every normalized transaction retains a back-reference to its source
 * raw row so that the full provenance chain is always traceable.
 */

import type { RawStatementRow, Transaction, TransactionStatus } from './types.js';

/**
 * Options controlling normalization behavior.
 */
export interface NormalizeOptions {
  /**
   * Default currency to apply when none can be inferred.
   * Defaults to `"INR"`.
   */
  defaultCurrency?: string;
  /**
   * Default lifecycle status for newly normalized transactions.
   * Defaults to `"cleared"`.
   */
  defaultStatus?: TransactionStatus;
  /**
   * Factory for stable transaction IDs.
   * Defaults to a simple deterministic hash of accountId + rawDate + rawAmount.
   */
  idFactory?: (row: RawStatementRow) => string;
  /**
   * Clock function returning the current ISO timestamp.
   * Injected for deterministic tests.
   */
  now?: () => string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses a raw amount string into a finite, non-negative number.
 *
 * Handles common real-world formatting:
 *  - currency symbols (₹, $, €, £)
 *  - thousand-separator commas
 *  - parentheses as negative indicator — ignored (sign comes from `isDebit`)
 *  - trailing/leading whitespace
 *
 * Returns `NaN` if the string cannot be parsed.
 */
export function parseAmount(raw: string): number {
  // Strip currency symbols, whitespace, parentheses, and thousand separators
  const cleaned = raw.replace(/[₹$€£\s(),]/g, '');
  const value = parseFloat(cleaned);
  return isNaN(value) ? NaN : Math.abs(value);
}

/**
 * Parses a raw date string into an ISO 8601 date string (YYYY-MM-DD).
 *
 * Supported input formats:
 *  - YYYY-MM-DD
 *  - DD/MM/YYYY
 *  - DD-MM-YYYY
 *  - DD MMM YYYY  (e.g. "15 Jan 2024")
 *
 * Returns `null` if the date cannot be parsed.
 */
export function parseDate(raw: string): string | null {
  const trimmed = raw.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m}-${d}`;
  }

  // DD MMM YYYY
  const dMonY = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (dMonY) {
    const [, d, mon, y] = dMonY;
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04',
      may: '05', jun: '06', jul: '07', aug: '08',
      sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const m = months[mon!.toLowerCase()];
    if (m) {
      return `${y}-${m}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Normalizes a raw description: trim, collapse internal whitespace, uppercase.
 */
export function normalizeDescription(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Generates a simple deterministic ID from stable row fields.
 * Not cryptographically unique — callers that need guaranteed uniqueness
 * should provide their own `idFactory`.
 */
function defaultIdFactory(row: RawStatementRow): string {
  const payload = `${row.accountId}|${row.rawDate}|${row.rawAmount}|${row.id}`;
  // djb2 hash: hash = hash * 33 + charCode
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) + hash) + payload.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return `tx-${hash.toString(16).padStart(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalizes a single raw statement row into a Transaction.
 *
 * @throws {Error} if the amount or date cannot be parsed.
 */
export function normalizeTransaction(
  row: RawStatementRow,
  options: NormalizeOptions = {},
): Transaction {
  const {
    defaultCurrency = 'INR',
    defaultStatus = 'cleared',
    idFactory = defaultIdFactory,
    now = () => new Date().toISOString(),
  } = options;

  const amount = parseAmount(row.rawAmount);
  if (isNaN(amount)) {
    throw new Error(
      `Cannot parse amount "${row.rawAmount}" for raw row "${row.id}"`,
    );
  }

  const date = parseDate(row.rawDate);
  if (date === null) {
    throw new Error(
      `Cannot parse date "${row.rawDate}" for raw row "${row.id}"`,
    );
  }

  let balance: number | undefined;
  if (row.rawBalance !== undefined) {
    const parsedBalance = parseAmount(row.rawBalance);
    if (!isNaN(parsedBalance)) {
      balance = parsedBalance;
    }
  }

  const timestamp = now();

  return {
    id: idFactory(row),
    rawRowId: row.id,
    accountId: row.accountId,
    date,
    description: row.rawDescription,
    normalizedDescription: normalizeDescription(row.rawDescription),
    amount,
    type: row.isDebit ? 'debit' : 'credit',
    currency: defaultCurrency,
    balance,
    categoryId: undefined,
    categorizationSource: 'uncategorized',
    isTransfer: false,
    transferPeerId: undefined,
    confidence: row.parseConfidence,
    status: defaultStatus,
    notes: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Normalizes a batch of raw statement rows.
 * Rows that fail parsing are collected in `errors` rather than throwing.
 */
export function normalizeBatch(
  rows: RawStatementRow[],
  options: NormalizeOptions = {},
): { transactions: Transaction[]; errors: Array<{ rowId: string; error: string }> } {
  const transactions: Transaction[] = [];
  const errors: Array<{ rowId: string; error: string }> = [];

  for (const row of rows) {
    try {
      transactions.push(normalizeTransaction(row, options));
    } catch (err) {
      errors.push({
        rowId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { transactions, errors };
}
