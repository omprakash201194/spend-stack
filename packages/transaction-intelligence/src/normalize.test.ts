import { describe, it, expect } from 'vitest';
import { parseAmount, parseDate, normalizeDescription, normalizeTransaction, normalizeBatch } from './normalize.js';
import type { RawStatementRow } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<RawStatementRow> = {}): RawStatementRow {
  return {
    id: 'row-1',
    importJobId: 'job-1',
    accountId: 'acc-1',
    rawDate: '2024-01-15',
    rawDescription: 'UPI Payment to Swiggy',
    rawAmount: '450.00',
    isDebit: true,
    parseConfidence: 0.95,
    ...overrides,
  };
}

const FIXED_NOW = '2024-01-15T10:00:00.000Z';

// ---------------------------------------------------------------------------
// parseAmount
// ---------------------------------------------------------------------------

describe('parseAmount', () => {
  it('parses a plain decimal string', () => {
    expect(parseAmount('1234.56')).toBe(1234.56);
  });

  it('strips Indian Rupee symbol', () => {
    expect(parseAmount('₹1,234.56')).toBe(1234.56);
  });

  it('strips dollar sign', () => {
    expect(parseAmount('$99.99')).toBe(99.99);
  });

  it('strips thousand-separator commas', () => {
    expect(parseAmount('1,00,000.00')).toBe(100000.0);
  });

  it('returns absolute value (ignores negative sign context)', () => {
    expect(parseAmount('(500.00)')).toBe(500.0);
  });

  it('handles whitespace', () => {
    expect(parseAmount('  250.00  ')).toBe(250.0);
  });

  it('returns NaN for non-numeric input', () => {
    expect(parseAmount('N/A')).toBeNaN();
  });

  it('returns NaN for empty string', () => {
    expect(parseAmount('')).toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// parseDate
// ---------------------------------------------------------------------------

describe('parseDate', () => {
  it('accepts ISO format unchanged', () => {
    expect(parseDate('2024-03-15')).toBe('2024-03-15');
  });

  it('converts DD/MM/YYYY', () => {
    expect(parseDate('15/01/2024')).toBe('2024-01-15');
  });

  it('converts DD-MM-YYYY', () => {
    expect(parseDate('15-01-2024')).toBe('2024-01-15');
  });

  it('converts DD MMM YYYY', () => {
    expect(parseDate('15 Jan 2024')).toBe('2024-01-15');
  });

  it('converts DD MMM YYYY case-insensitively', () => {
    expect(parseDate('05 FEB 2024')).toBe('2024-02-05');
  });

  it('returns null for an unrecognised format', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeDescription
// ---------------------------------------------------------------------------

describe('normalizeDescription', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeDescription('  hello  ')).toBe('HELLO');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeDescription('UPI   Payment   Swiggy')).toBe('UPI PAYMENT SWIGGY');
  });

  it('uppercases the result', () => {
    expect(normalizeDescription('neft transfer')).toBe('NEFT TRANSFER');
  });
});

// ---------------------------------------------------------------------------
// normalizeTransaction
// ---------------------------------------------------------------------------

describe('normalizeTransaction', () => {
  it('produces a well-formed transaction from a valid row', () => {
    const row = makeRow();
    const tx = normalizeTransaction(row, { now: () => FIXED_NOW });

    expect(tx.rawRowId).toBe('row-1');
    expect(tx.accountId).toBe('acc-1');
    expect(tx.date).toBe('2024-01-15');
    expect(tx.amount).toBe(450.0);
    expect(tx.type).toBe('debit');
    expect(tx.currency).toBe('INR');
    expect(tx.normalizedDescription).toBe('UPI PAYMENT TO SWIGGY');
    expect(tx.categorizationSource).toBe('uncategorized');
    expect(tx.isTransfer).toBe(false);
    expect(tx.confidence).toBe(0.95);
    expect(tx.status).toBe('cleared');
    expect(tx.createdAt).toBe(FIXED_NOW);
    expect(tx.updatedAt).toBe(FIXED_NOW);
  });

  it('sets type to "credit" for non-debit rows', () => {
    const tx = normalizeTransaction(makeRow({ isDebit: false }), { now: () => FIXED_NOW });
    expect(tx.type).toBe('credit');
  });

  it('parses balance when rawBalance is provided', () => {
    const tx = normalizeTransaction(makeRow({ rawBalance: '₹10,000.00' }), { now: () => FIXED_NOW });
    expect(tx.balance).toBe(10000.0);
  });

  it('leaves balance undefined when rawBalance is absent', () => {
    const tx = normalizeTransaction(makeRow(), { now: () => FIXED_NOW });
    expect(tx.balance).toBeUndefined();
  });

  it('uses defaultCurrency option', () => {
    const tx = normalizeTransaction(makeRow(), { defaultCurrency: 'USD', now: () => FIXED_NOW });
    expect(tx.currency).toBe('USD');
  });

  it('throws when amount is unparseable', () => {
    expect(() => normalizeTransaction(makeRow({ rawAmount: 'N/A' }))).toThrow(/Cannot parse amount/);
  });

  it('throws when date is unparseable', () => {
    expect(() => normalizeTransaction(makeRow({ rawDate: 'not-a-date' }))).toThrow(/Cannot parse date/);
  });

  it('uses a custom idFactory', () => {
    const tx = normalizeTransaction(makeRow(), {
      idFactory: () => 'custom-id',
      now: () => FIXED_NOW,
    });
    expect(tx.id).toBe('custom-id');
  });
});

// ---------------------------------------------------------------------------
// normalizeBatch
// ---------------------------------------------------------------------------

describe('normalizeBatch', () => {
  it('normalizes valid rows and collects errors for invalid ones', () => {
    const rows: RawStatementRow[] = [
      makeRow({ id: 'row-1' }),
      makeRow({ id: 'row-2', rawAmount: 'bad' }),
      makeRow({ id: 'row-3', rawDate: 'bad-date' }),
      makeRow({ id: 'row-4' }),
    ];

    const { transactions, errors } = normalizeBatch(rows, { now: () => FIXED_NOW });

    expect(transactions).toHaveLength(2);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.rowId).toBe('row-2');
    expect(errors[1]?.rowId).toBe('row-3');
  });

  it('returns empty arrays for an empty input', () => {
    const { transactions, errors } = normalizeBatch([]);
    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});
