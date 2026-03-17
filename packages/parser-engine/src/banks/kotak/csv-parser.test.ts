import { describe, it, expect } from 'vitest';
import { kotakBankCsvParser } from './csv-parser.js';

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

const FOREIGN_CSV = `Date,Narration,Amount
01/01/2024,SOME PAYMENT,500.00`;

describe('kotakBankCsvParser.detect', () => {
  it('detects a valid Kotak CSV', () => {
    expect(kotakBankCsvParser.detect(KOTAK_CSV)).toBe(true);
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

  it('sets currency to INR', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const txs = kotakBankCsvParser.normalize(rows);
    txs.forEach((t) => expect(t.currency).toBe('INR'));
  });
});

describe('kotakBankCsvParser.validate', () => {
  it('builds a confidence summary', () => {
    const rows = kotakBankCsvParser.extract(KOTAK_CSV);
    const normalizedCandidates = kotakBankCsvParser.normalize(rows);
    const result = kotakBankCsvParser.validate({
      rawRows: rows,
      normalizedCandidates,
      parserWarnings: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    expect(result.confidenceSummary.highConfidence).toBe(normalizedCandidates.length);
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
