import { describe, it, expect } from 'vitest';
import { iciciBankCsvParser } from './csv-parser.js';

// ---------------------------------------------------------------------------
// Fixture CSV — mimics a real ICICI Bank savings account statement export
// ---------------------------------------------------------------------------
const ICICI_CSV = `Transaction Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
01/01/2024,01/01/2024,OPENING BALANCE,,,,50000.00
05/01/2024,05/01/2024,NEFT/987654321/SALARY CREDIT,,,50000.00,100000.00
10/01/2024,10/01/2024,ATM WITHDRAWAL DELHI,,5000.00,,95000.00
15/01/2024,15/01/2024,UPI/SWIGGY/FOOD ORDER,,450.00,,94550.00
20/01/2024,20/01/2024,IMPS/TRANSFER TO HDFC,,10000.00,,84550.00
25/01/2024,25/01/2024,INTEREST CREDIT,,,250.00,84800.00`;

// CSV with alternative column casing / spacing
const ICICI_FLEXIBLE_CSV = `transaction date,value date,description,ref no./cheque no.,debit,credit,balance
01-01-2024,01-01-2024,SALARY,,50000.00,100000.00`;

// CSV that should NOT be detected as ICICI
const FOREIGN_CSV = `Date,Narration,Amount
01/01/2024,SOME PAYMENT,500.00`;

describe('iciciBankCsvParser.detect', () => {
  it('detects a valid ICICI CSV', () => {
    expect(iciciBankCsvParser.detect(ICICI_CSV)).toBe(true);
  });

  it('detects a flexible (lower-case headers) ICICI CSV', () => {
    expect(iciciBankCsvParser.detect(ICICI_FLEXIBLE_CSV)).toBe(true);
  });

  it('does not detect an unrelated CSV format', () => {
    expect(iciciBankCsvParser.detect(FOREIGN_CSV)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(iciciBankCsvParser.detect('')).toBe(false);
  });
});

describe('iciciBankCsvParser.extract', () => {
  it('extracts the expected number of data rows', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    // Opening Balance row has no debit or credit — should be skipped
    expect(rows.length).toBe(5);
  });

  it('each row has a sourceReference', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    rows.forEach((r) => expect(r.sourceReference).toMatch(/^row-\d+$/));
  });

  it('captures the raw line text', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    expect(rows[0]?.rawText).toContain('SALARY CREDIT');
  });
});

describe('iciciBankCsvParser.normalize', () => {
  it('produces normalized transactions for all valid rows', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const txs = iciciBankCsvParser.normalize(rows);
    expect(txs.length).toBe(5);
  });

  it('parses dates into ISO format', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const txs = iciciBankCsvParser.normalize(rows);
    expect(txs[0]?.date).toBe('2024-01-05');
  });

  it('sets signedAmount positive for credits', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const txs = iciciBankCsvParser.normalize(rows);
    const salary = txs.find((t) => t.description.includes('SALARY'));
    expect(salary?.signedAmount).toBeGreaterThan(0);
    expect(salary?.creditAmount).toBe(50000);
    expect(salary?.debitAmount).toBeNull();
  });

  it('sets signedAmount negative for debits', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const txs = iciciBankCsvParser.normalize(rows);
    const atm = txs.find((t) => t.description.includes('ATM'));
    expect(atm?.signedAmount).toBeLessThan(0);
    expect(atm?.debitAmount).toBe(5000);
    expect(atm?.creditAmount).toBeNull();
  });

  it('captures balance when available', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const txs = iciciBankCsvParser.normalize(rows);
    expect(txs[0]?.balanceIfAvailable).toBe(100000);
  });

  it('normalizes descriptions to upper case', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const txs = iciciBankCsvParser.normalize(rows);
    txs.forEach((t) => expect(t.description).toBe(t.description.toUpperCase()));
  });

  it('sets currency to INR', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const txs = iciciBankCsvParser.normalize(rows);
    txs.forEach((t) => expect(t.currency).toBe('INR'));
  });
});

describe('iciciBankCsvParser.validate', () => {
  it('populates a confidence summary', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const normalizedCandidates = iciciBankCsvParser.normalize(rows);
    const result = iciciBankCsvParser.validate({
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
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const normalizedCandidates = iciciBankCsvParser.normalize(rows);
    const result = iciciBankCsvParser.validate({
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
    const result = iciciBankCsvParser.validate({
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

  it('carries sourceReference through normalize and into validate errors', () => {
    const rows = iciciBankCsvParser.extract(ICICI_CSV);
    const normalizedCandidates = iciciBankCsvParser.normalize(rows);
    // Every normalized candidate should carry the sourceReference from its raw row
    normalizedCandidates.forEach((tx) => expect(tx.sourceReference).toMatch(/^row-\d+$/));
  });
});

describe('parser metadata', () => {
  it('has correct parserId and bankName', () => {
    expect(iciciBankCsvParser.parserId).toBe('icici-csv-v1');
    expect(iciciBankCsvParser.bankName).toBe('icici');
    expect(iciciBankCsvParser.supportedFileTypes).toContain('csv');
  });
});
