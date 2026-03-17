import { describe, it, expect } from 'vitest';
import { resolveParser, getParserById, getParsersForBank, listParsers } from './parser-registry.js';

const ICICI_CSV = `Transaction Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
05/01/2024,05/01/2024,SALARY,,50000.00,100000.00`;

const BOB_CSV = `Tran Date,Description,Ref No.,Debit Amount,Credit Amount,Balance
05-01-2024,SALARY,REF001,,50000.00,100000.00`;

const KOTAK_CSV = `Transaction Date,Description,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance
05-01-2024,SALARY,REF001,,50000.00,100000.00`;

const UNKNOWN_CSV = `Date,Narration,Amount
01/01/2024,UNKNOWN,500.00`;

describe('resolveParser', () => {
  it('resolves the ICICI parser for ICICI content', () => {
    const parser = resolveParser(ICICI_CSV, 'csv');
    expect(parser?.parserId).toBe('icici-csv-v1');
  });

  it('resolves the Bank of Baroda parser for BOB content', () => {
    const parser = resolveParser(BOB_CSV, 'csv');
    expect(parser?.parserId).toBe('bob-csv-v1');
  });

  it('resolves the Kotak parser for Kotak content', () => {
    const parser = resolveParser(KOTAK_CSV, 'csv');
    expect(parser?.parserId).toBe('kotak-csv-v1');
  });

  it('returns null for unknown CSV format', () => {
    expect(resolveParser(UNKNOWN_CSV, 'csv')).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(resolveParser('')).toBeNull();
  });

  it('filters by fileType when provided', () => {
    // PDF type hint — no PDF parsers registered yet, so null
    expect(resolveParser(ICICI_CSV, 'pdf')).toBeNull();
  });
});

describe('getParserById', () => {
  it('returns the parser with a matching parserId', () => {
    const parser = getParserById('icici-csv-v1');
    expect(parser).not.toBeNull();
    expect(parser?.bankName).toBe('icici');
  });

  it('returns null for an unknown parserId', () => {
    expect(getParserById('nonexistent-parser')).toBeNull();
  });
});

describe('getParsersForBank', () => {
  it('returns parsers for a given bank', () => {
    const parsers = getParsersForBank('icici');
    expect(parsers.length).toBeGreaterThan(0);
    parsers.forEach((p) => expect(p.bankName).toBe('icici'));
  });

  it('filters by fileType when provided', () => {
    const csvParsers = getParsersForBank('icici', 'csv');
    expect(csvParsers.every((p) => p.supportedFileTypes.includes('csv'))).toBe(true);
  });

  it('returns empty array for a bank with no registered parsers', () => {
    // No parsers for a hypothetical new bank
    expect(getParsersForBank('kotak', 'pdf')).toHaveLength(0);
  });
});

describe('listParsers', () => {
  it('returns all registered parsers', () => {
    const parsers = listParsers();
    expect(parsers.length).toBeGreaterThanOrEqual(3);
  });

  it('includes parsers for all three supported banks', () => {
    const parsers = listParsers();
    const banks = parsers.map((p) => p.bankName);
    expect(banks).toContain('icici');
    expect(banks).toContain('bank-of-baroda');
    expect(banks).toContain('kotak');
  });
});
