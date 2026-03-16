import { describe, it, expect } from 'vitest';
import {
  parseDate,
  parseAmount,
  normalizeDescription,
  hashDescription,
  parseCsvRow,
  splitLines,
} from './normalization.js';

describe('parseDate', () => {
  it('parses DD/MM/YYYY (ICICI format)', () => {
    expect(parseDate('01/09/2023')).toBe('2023-09-01');
    expect(parseDate('31/12/2024')).toBe('2024-12-31');
  });

  it('parses DD-MM-YYYY (Kotak / Bank of Baroda format)', () => {
    expect(parseDate('01-09-2023')).toBe('2023-09-01');
    expect(parseDate('15-01-2024')).toBe('2024-01-15');
  });

  it('parses DD MMM YYYY', () => {
    expect(parseDate('01 Jan 2024')).toBe('2024-01-01');
    expect(parseDate('15 Dec 2023')).toBe('2023-12-15');
    expect(parseDate('28 Feb 2023')).toBe('2023-02-28');
  });

  it('returns null for blank input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('   ')).toBeNull();
  });

  it('returns null for unrecognised format', () => {
    expect(parseDate('2024/01/01')).toBeNull();
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('returns falsy for invalid month', () => {
    // month 13 is invalid — toIsoDate returns empty string from the check
    expect(parseDate('01/13/2024')).toBeFalsy();
  });
});

describe('parseAmount', () => {
  it('parses plain number strings', () => {
    expect(parseAmount('1000.00')).toBe(1000);
    expect(parseAmount('5000')).toBe(5000);
  });

  it('parses numbers with commas (Indian formatting)', () => {
    expect(parseAmount('1,00,000.00')).toBe(100000);
    expect(parseAmount('50,000.50')).toBe(50000.5);
  });

  it('returns null for blank / empty strings', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
  });

  it('handles trimming', () => {
    expect(parseAmount('  500.00  ')).toBe(500);
  });
});

describe('normalizeDescription', () => {
  it('converts to upper case', () => {
    expect(normalizeDescription('Salary Credit')).toBe('SALARY CREDIT');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeDescription('NEFT  PAYMENT   HDFC')).toBe('NEFT PAYMENT HDFC');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeDescription('  ATM WITHDRAWAL  ')).toBe('ATM WITHDRAWAL');
  });
});

describe('hashDescription', () => {
  it('returns a hex string of length 8', () => {
    const h = hashDescription('SALARY CREDIT');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces the same hash for the same input', () => {
    expect(hashDescription('ATM WITHDRAWAL')).toBe(hashDescription('ATM WITHDRAWAL'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashDescription('SALARY')).not.toBe(hashDescription('RENT'));
  });
});

describe('parseCsvRow', () => {
  it('splits a simple comma-separated line', () => {
    expect(parseCsvRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsvRow('"hello, world",foo,bar')).toEqual(['hello, world', 'foo', 'bar']);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    expect(parseCsvRow('"say ""hi""",end')).toEqual(['say "hi"', 'end']);
  });

  it('handles empty fields', () => {
    expect(parseCsvRow('a,,c')).toEqual(['a', '', 'c']);
  });

  it('trims whitespace from unquoted fields', () => {
    expect(parseCsvRow(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('splitLines', () => {
  it('splits on newlines', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('strips Windows carriage returns', () => {
    expect(splitLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']);
  });

  it('filters blank lines', () => {
    expect(splitLines('a\n\nb\n   \nc')).toEqual(['a', 'b', 'c']);
  });
});
