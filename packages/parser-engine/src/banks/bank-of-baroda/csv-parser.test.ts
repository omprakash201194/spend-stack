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

// Realistic BOB export that includes account-info preamble rows before the
// transaction header — a format produced by BOB Internet Banking.
const BOB_WITH_PREAMBLE_CSV = `Account Number:1234567890
Statement Period:01-01-2024 to 31-01-2024
Tran Date,Description,Ref No.,Debit Amount,Credit Amount,Balance
05-01-2024,NEFT SALARY CREDIT,REF001,,25000.00,75000.00
12-01-2024,UPI GROCERY PAYMENT,REF002,1500.00,,73500.00`;

// CSV that mimics ICICI columns (bare "Debit"/"Credit", no "Amount") — BOB must not claim it
const ICICI_LIKE_CSV = `Transaction Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
05/01/2024,05/01/2024,SALARY CREDIT,REF001,,50000.00,100000.00`;

const FOREIGN_CSV = `Date,Narration,Amount
01/01/2024,SOME PAYMENT,500.00`;

describe('bankOfBarodaCsvParser.detect', () => {
  it('detects a valid Bank of Baroda CSV', () => {
    expect(bankOfBarodaCsvParser.detect(BOB_CSV)).toBe(true);
  });

  it('does not detect an unrelated CSV', () => {
    expect(bankOfBarodaCsvParser.detect(FOREIGN_CSV)).toBe(false);
  });

  it('does not detect a CSV with bare Debit/Credit columns (e.g. ICICI format)', () => {
    expect(bankOfBarodaCsvParser.detect(ICICI_LIKE_CSV)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(bankOfBarodaCsvParser.detect('')).toBe(false);
  });

  it('detects a Bank of Baroda CSV with account-info preamble rows', () => {
    expect(bankOfBarodaCsvParser.detect(BOB_WITH_PREAMBLE_CSV)).toBe(true);
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

  it('captures the raw line text', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    expect(rows[0]?.rawText).toContain('SALARY CREDIT');
  });

  it('extracts rows from a statement with account-info preamble', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_WITH_PREAMBLE_CSV);
    expect(rows.length).toBe(2);
    expect(rows[0]?.rawText).toContain('SALARY');
    expect(rows[1]?.rawText).toContain('GROCERY');
  });

  it('returns empty array when no header is found', () => {
    expect(bankOfBarodaCsvParser.extract(FOREIGN_CSV)).toHaveLength(0);
    expect(bankOfBarodaCsvParser.extract('')).toHaveLength(0);
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
    expect(salary?.debitAmount).toBeNull();
  });

  it('sets signedAmount negative for debits', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const txs = bankOfBarodaCsvParser.normalize(rows);
    const atm = txs.find((t) => t.description.includes('ATM'));
    expect(atm?.signedAmount).toBeLessThan(0);
    expect(atm?.debitAmount).toBe(5000);
    expect(atm?.creditAmount).toBeNull();
  });

  it('captures balance when available', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const txs = bankOfBarodaCsvParser.normalize(rows);
    expect(txs[0]?.balanceIfAvailable).toBe(100000);
  });

  it('normalizes descriptions to upper case', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const txs = bankOfBarodaCsvParser.normalize(rows);
    txs.forEach((t) => expect(t.description).toBe(t.description.toUpperCase()));
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
    expect(result.confidenceSummary.totalRows).toBe(rows.length);
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

  it('emits a structured ParseError for a transaction missing date and amount', () => {
    const badTx = {
      date: '',
      description: 'BAD ROW',
      debitAmount: null,
      creditAmount: null,
      signedAmount: 0,
      balanceIfAvailable: null,
      currency: 'INR',
      rawReference: '',
      sourceReference: 'row-7',
    };
    const result = bankOfBarodaCsvParser.validate({
      rawRows: [],
      normalizedCandidates: [badTx],
      parserWarnings: [],
      parseErrors: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    // Two separate errors emitted: one for missing date, one for missing amount
    expect(result.parseErrors).toHaveLength(2);
    const codes = result.parseErrors.map((e) => e.code);
    expect(codes).toContain('missing_date');
    expect(codes).toContain('missing_amount');
    result.parseErrors.forEach((e) => {
      expect(e.severity).toBe('error');
      expect(e.sourceReference).toBe('row-7');
    });
  });

  it('carries sourceReference from extract through normalize and into validate errors', () => {
    const rows = bankOfBarodaCsvParser.extract(BOB_CSV);
    const normalizedCandidates = bankOfBarodaCsvParser.normalize(rows);
    // Every normalized candidate should carry the sourceReference from its raw row
    normalizedCandidates.forEach((tx) => expect(tx.sourceReference).toMatch(/^row-\d+$/));

    // Inject a candidate with a known sourceReference but missing date to trigger a
    // validate() error — verifying that sourceReference propagates into ParseError
    const badTx = {
      ...normalizedCandidates[0]!,
      date: '',
      sourceReference: 'row-99',
    };
    const result = bankOfBarodaCsvParser.validate({
      rawRows: rows,
      normalizedCandidates: [badTx],
      parserWarnings: [],
      parseErrors: [],
      confidenceSummary: { totalRows: 0, highConfidence: 0, lowConfidence: 0, failed: 0 },
      debugMetadata: {},
    });
    const dateError = result.parseErrors.find((e) => e.code === 'missing_date');
    expect(dateError?.sourceReference).toBe('row-99');
  });
});

describe('parser metadata', () => {
  it('has correct parserId and bankName', () => {
    expect(bankOfBarodaCsvParser.parserId).toBe('bob-csv-v1');
    expect(bankOfBarodaCsvParser.bankName).toBe('bank-of-baroda');
    expect(bankOfBarodaCsvParser.supportedFileTypes).toContain('csv');
  });
});
