import { describe, it, expect } from 'vitest';
import { bankOfBarodaCsvParser } from './csv-parser.js';

// ---------------------------------------------------------------------------
// Fixture — Bank of Baroda savings account CSV export
// ---------------------------------------------------------------------------
const BOB_CSV = `Tran Date,Description,Ref No.,Debit Amount,Credit Amount,Balance
01-01-2024,OPENING BALANCE,,,,50000.00
05-01-2024,NEFT SALARY CREDIT,REF001,,50000.00,100000.00
10-01-2024,ATM CASH WITHDRAWAL,REF002,5000.00,,95000.00
15-01-2024,UPI PAYMENT GROCERY,REF003,800.00,,94200.00
20-01-2024,CHEQUE DEPOSIT,,,25000.00,119200.00`;

const FOREIGN_CSV = `Date,Narration,Amount
01/01/2024,SOME PAYMENT,500.00`;

describe('bankOfBarodaCsvParser.detect', () => {
  it('detects a valid Bank of Baroda CSV', () => {
    expect(bankOfBarodaCsvParser.detect(BOB_CSV)).toBe(true);
  });

  it('does not detect an unrelated CSV', () => {
    expect(bankOfBarodaCsvParser.detect(FOREIGN_CSV)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(bankOfBarodaCsvParser.detect('')).toBe(false);
  });
});

describe('bankOfBarodaCsvParser.extract', () => {
  it('extracts data rows, skipping rows without amounts', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    // Row 1 has only balance, no debit/credit — skipped
    expect(rows.length).toBe(4);
  });

  it('each extracted row has a source reference', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    rows.forEach((r) => expect(r.sourceReference).toMatch(/^row-\d+$/));
  });
});

describe('bankOfBarodaCsvParser.normalize', () => {
  it('normalizes all rows to transactions', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const txs = bankOfBarodaCsvParser.normalize(rows);
    expect(txs.length).toBe(4);
  });

  it('produces ISO dates', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const txs = bankOfBarodaCsvParser.normalize(rows);
    expect(txs[0]?.date).toBe('2024-01-05');
  });

  it('sets signedAmount positive for credits', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const txs = bankOfBarodaCsvParser.normalize(rows);
    const salary = txs.find((t) => t.description.includes('SALARY'));
    expect(salary?.signedAmount).toBeGreaterThan(0);
    expect(salary?.creditAmount).toBe(50000);
  });

  it('sets signedAmount negative for debits', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const txs = bankOfBarodaCsvParser.normalize(rows);
    const atm = txs.find((t) => t.description.includes('ATM'));
    expect(atm?.signedAmount).toBeLessThan(0);
    expect(atm?.debitAmount).toBe(5000);
  });

  it('sets currency to INR', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const txs = bankOfBarodaCsvParser.normalize(rows);
    txs.forEach((t) => expect(t.currency).toBe('INR'));
  });
});

describe('bankOfBarodaCsvParser.validate', () => {
  it('builds a confidence summary', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const normalizedCandidates = bankOfBarodaCsvParser.normalize(rows);
    const result = bankOfBarodaCsvParser.validate({
      rawRows: rows,
      normalizedCandidates,
      parserWarnings: [],
      parseErrors: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    expect(result.confidenceSummary.highConfidence).toBe(normalizedCandidates.length);
    expect(result.confidenceSummary.failed).toBe(0);
  });

  it('emits no parseErrors for a clean statement', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const normalizedCandidates = bankOfBarodaCsvParser.normalize(rows);
    const result = bankOfBarodaCsvParser.validate({
      rawRows: rows,
      normalizedCandidates,
      parserWarnings: [],
      parseErrors: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    expect(result.parseErrors).toHaveLength(0);
  });
});

describe('parser metadata', () => {
  it('has correct parserId and bankName', () => {
    expect(bankOfBarodaCsvParser.parserId).toBe('bob-csv-v1');
    expect(bankOfBarodaCsvParser.bankName).toBe('bank-of-baroda');
    expect(bankOfBarodaCsvParser.supportedFileTypes).toContain('csv');
  });
});
