import { describe, it, expect } from 'vitest';
import { kotakBankCsvParser } from './csv-parser.js';
import type { NormalizedTransaction } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Fixture — Kotak Mahindra Bank savings account CSV export
// ---------------------------------------------------------------------------
const KOTAK_CSV = `Transaction Date,Description,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance
01-01-2024,OPENING BALANCE,,,,50000.00
05-01-2024,IMPS SALARY HDFC,REF001,,50000.00,100000.00
10-01-2024,ATM CASH WDL,REF002,5000.00,,95000.00
15-01-2024,UPI ZOMATO FOOD,REF003,600.00,,94400.00
20-01-2024,NEFT RENT PAYMENT,REF004,15000.00,,79400.00
25-01-2024,INTEREST CREDIT,REF005,,180.00,79580.00`;

// Kotak export using alternative "Narration" column instead of "Description"
const KOTAK_NARRATION_CSV = `Transaction Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance
05-01-2024,UPI NARRATION TEST,REF001,200.00,,49800.00`;

const FOREIGN_CSV = `Date,Narration,Amount
01/01/2024,SOME PAYMENT,500.00`;

describe('kotakBankCsvParser.detect', () => {
  it('detects a valid Kotak CSV', () => {
    expect(kotakBankCsvParser.detect(KOTAK_CSV)).toBe(true);
  });

  it('detects a Kotak CSV that uses "Narration" instead of "Description"', () => {
    expect(kotakBankCsvParser.detect(KOTAK_NARRATION_CSV)).toBe(true);
  });

  it('does not detect an unrelated CSV', () => {
    expect(kotakBankCsvParser.detect(FOREIGN_CSV)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(kotakBankCsvParser.detect('')).toBe(false);
  });
});

describe('kotakBankCsvParser.extract', () => {
  it('extracts data rows, skipping rows without withdrawal or deposit', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    // Row 1 has only closing balance — skipped
    expect(rows.length).toBe(5);
  });

  it('each extracted row has a source reference', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    rows.forEach((r) => expect(r.sourceReference).toMatch(/^row-\d+$/));
  });

  it('captures the raw line text in each row', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    expect(rows[0]?.rawText).toContain('SALARY');
  });

  it('returns empty array for unrecognised CSV format', () => {
    expect(kotakBankCsvParser.extract(FOREIGN_CSV)).toHaveLength(0);
    expect(kotakBankCsvParser.extract('')).toHaveLength(0);
  });
});

describe('kotakBankCsvParser.normalize', () => {
  it('normalizes all rows to transactions', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    expect(txs.length).toBe(5);
  });

  it('produces ISO dates', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    expect(txs[0]?.date).toBe('2024-01-05');
  });

  it('sets signedAmount positive for deposits (credits)', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    const salary = txs.find((t) => t.description.includes('SALARY'));
    expect(salary?.signedAmount).toBeGreaterThan(0);
    expect(salary?.creditAmount).toBe(50000);
    expect(salary?.debitAmount).toBeNull();
  });

  it('sets signedAmount negative for withdrawals (debits)', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    const atm = txs.find((t) => t.description.includes('ATM'));
    expect(atm?.signedAmount).toBeLessThan(0);
    expect(atm?.debitAmount).toBe(5000);
    expect(atm?.creditAmount).toBeNull();
  });

  it('captures closing balance', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    const salary = txs.find((t) => t.description.includes('SALARY'));
    expect(salary?.balanceIfAvailable).toBe(100000);
  });

  it('normalizes descriptions to upper case', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    txs.forEach((t) => expect(t.description).toBe(t.description.toUpperCase()));
  });

  it('sets currency to INR', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    txs.forEach((t) => expect(t.currency).toBe('INR'));
  });

  it('carries sourceReference from raw row into each normalized transaction', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    txs.forEach((t) => expect(t.sourceReference).toMatch(/^row-\d+$/));
  });
});

describe('kotakBankCsvParser.validate', () => {
  it('builds a confidence summary with totalRows matching rawRows', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const normalizedCandidates = kotakBankCsvParser.normalize(rows);
    const result = kotakBankCsvParser.validate({
      rawRows: rows,
      normalizedCandidates,
      parserWarnings: [],
      parseErrors: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    expect(result.confidenceSummary.totalRows).toBe(rows.length);
    expect(result.confidenceSummary.highConfidence).toBe(normalizedCandidates.length);
    expect(result.confidenceSummary.failed).toBe(0);
  });

  it('emits no parseErrors for a clean statement', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const normalizedCandidates = kotakBankCsvParser.normalize(rows);
    const result = kotakBankCsvParser.validate({
      rawRows: rows,
      normalizedCandidates,
      parserWarnings: [],
      parseErrors: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    expect(result.parseErrors).toHaveLength(0);
  });

  it('emits structured ParseErrors for a transaction missing date and amount', () => {
    const badTx: NormalizedTransaction = {
      date: '',
      description: 'BAD ROW',
      debitAmount: null,
      creditAmount: null,
      signedAmount: 0,
      balanceIfAvailable: null,
      currency: 'INR',
      rawReference: '',
      sourceReference: 'row-9',
    };
    const result = kotakBankCsvParser.validate({
      rawRows: [],
      normalizedCandidates: [badTx],
      parserWarnings: [],
      parseErrors: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    // Two separate errors: one for missing date, one for missing amount
    expect(result.parseErrors).toHaveLength(2);
    const codes = result.parseErrors.map((e) => e.code);
    expect(codes).toContain('missing_date');
    expect(codes).toContain('missing_amount');
    result.parseErrors.forEach((e) => {
      expect(e.severity).toBe('error');
      expect(e.sourceReference).toBe('row-9');
    });
  });

  it('emits a warning-level ParseError for a transaction with an empty description', () => {
    const noDescTx: NormalizedTransaction = {
      date: '2024-01-10',
      description: '',
      debitAmount: 100,
      creditAmount: null,
      signedAmount: -100,
      balanceIfAvailable: null,
      currency: 'INR',
      rawReference: '',
      sourceReference: 'row-3',
    };
    const result = kotakBankCsvParser.validate({
      rawRows: [],
      normalizedCandidates: [noDescTx],
      parserWarnings: [],
      parseErrors: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]?.code).toBe('empty_description');
    expect(result.parseErrors[0]?.severity).toBe('warning');
    expect(result.confidenceSummary.lowConfidence).toBe(1);
    expect(result.confidenceSummary.failed).toBe(0);
  });
});

describe('parser metadata', () => {
  it('has correct parserId and bankName', () => {
    expect(kotakBankCsvParser.parserId).toBe('kotak-csv-v1');
    expect(kotakBankCsvParser.bankName).toBe('kotak');
    expect(kotakBankCsvParser.supportedFileTypes).toContain('csv');
  });
});
