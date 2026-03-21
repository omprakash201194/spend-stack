import { describe, it, expect } from 'vitest';
import {
  createTransaction,
  validateTransaction,
  isValidTransaction,
} from './transaction.js';
import type { CreateTransactionParams, Transaction } from './transaction.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(overrides: Partial<CreateTransactionParams> = {}): CreateTransactionParams {
  return {
    accountId: 'acc-1',
    date: '2024-01-15',
    description: 'UPI Payment to Swiggy',
    type: 'debit',
    amount: 450,
    importJobId: 'job-1',
    sourceFileId: 'file-1',
    sourceReference: 'row-2',
    ...overrides,
  };
}

function makeTx(overrides: Partial<CreateTransactionParams> = {}): Transaction {
  return createTransaction(makeParams(overrides));
}

// ---------------------------------------------------------------------------
// createTransaction
// ---------------------------------------------------------------------------

describe('createTransaction', () => {
  it('generates a non-empty id prefixed with "tx-"', () => {
    const tx = makeTx();
    expect(tx.id).toMatch(/^tx-[0-9a-f]{16}$/);
  });

  it('generates unique ids for distinct transactions', () => {
    const a = makeTx();
    const b = makeTx();
    expect(a.id).not.toBe(b.id);
  });

  it('uses an explicit id when provided', () => {
    const tx = makeTx({ id: 'tx-explicit' });
    expect(tx.id).toBe('tx-explicit');
  });

  it('sets all provided fields correctly', () => {
    const tx = makeTx();
    expect(tx.accountId).toBe('acc-1');
    expect(tx.date).toBe('2024-01-15');
    expect(tx.description).toBe('UPI Payment to Swiggy');
    expect(tx.type).toBe('debit');
    expect(tx.amount).toBe(450);
    expect(tx.importJobId).toBe('job-1');
    expect(tx.sourceFileId).toBe('file-1');
    expect(tx.sourceReference).toBe('row-2');
  });

  it('defaults currency to "INR"', () => {
    const tx = makeTx();
    expect(tx.currency).toBe('INR');
  });

  it('uses explicit currency when provided', () => {
    const tx = makeTx({ currency: 'USD' });
    expect(tx.currency).toBe('USD');
  });

  it('defaults status to "cleared"', () => {
    const tx = makeTx();
    expect(tx.status).toBe('cleared');
  });

  it('uses explicit status when provided', () => {
    const tx = makeTx({ status: 'pending' });
    expect(tx.status).toBe('pending');
  });

  it('includes balance when provided', () => {
    const tx = makeTx({ balance: 12345.67 });
    expect(tx.balance).toBe(12345.67);
  });

  it('leaves balance undefined when not provided', () => {
    const tx = makeTx();
    expect(tx.balance).toBeUndefined();
  });

  it('sets createdAt and updatedAt to the same ISO timestamp', () => {
    const tx = makeTx();
    expect(tx.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(tx.updatedAt).toBe(tx.createdAt);
  });

  it('does not mutate the input params object', () => {
    const params = makeParams();
    const before = JSON.stringify(params);
    createTransaction(params);
    expect(JSON.stringify(params)).toBe(before);
  });

  it('supports credit type', () => {
    const tx = makeTx({ type: 'credit' });
    expect(tx.type).toBe('credit');
  });

  it('supports zero amount', () => {
    const tx = makeTx({ amount: 0 });
    expect(tx.amount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// validateTransaction — passing cases
// ---------------------------------------------------------------------------

describe('validateTransaction — valid transaction', () => {
  it('returns valid=true for a correctly constructed transaction', () => {
    const result = validateTransaction(makeTx());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts amount of 0', () => {
    const result = validateTransaction(makeTx({ amount: 0 }));
    expect(result.valid).toBe(true);
  });

  it('accepts a credit type', () => {
    const result = validateTransaction(makeTx({ type: 'credit' }));
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateTransaction — individual field failures
// ---------------------------------------------------------------------------

describe('validateTransaction — missing_id', () => {
  it('reports missing_id when id is empty string', () => {
    const tx = { ...makeTx(), id: '' };
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'missing_id')).toBe(true);
  });

  it('reports missing_id when id is whitespace', () => {
    const tx = { ...makeTx(), id: '   ' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_id')).toBe(true);
  });
});

describe('validateTransaction — missing_account_id', () => {
  it('reports missing_account_id when accountId is empty', () => {
    const tx = { ...makeTx(), accountId: '' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_account_id')).toBe(true);
  });
});

describe('validateTransaction — missing_date / invalid_date_format', () => {
  it('reports missing_date when date is empty', () => {
    const tx = { ...makeTx(), date: '' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_date')).toBe(true);
  });

  it('reports invalid_date_format for a non-ISO date', () => {
    const tx = { ...makeTx(), date: '15-01-2024' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'invalid_date_format')).toBe(true);
  });

  it('reports invalid_date_format for a date with time component', () => {
    const tx = { ...makeTx(), date: '2024-01-15T00:00:00Z' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'invalid_date_format')).toBe(true);
  });

  it('accepts a valid YYYY-MM-DD date', () => {
    const tx = makeTx({ date: '2024-12-31' });
    const result = validateTransaction(tx);
    expect(result.errors.filter((e) => e.code === 'missing_date' || e.code === 'invalid_date_format')).toHaveLength(0);
  });
});

describe('validateTransaction — missing_description', () => {
  it('reports missing_description when description is empty', () => {
    const tx = { ...makeTx(), description: '' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_description')).toBe(true);
  });

  it('reports missing_description when description is whitespace', () => {
    const tx = { ...makeTx(), description: '   ' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_description')).toBe(true);
  });
});

describe('validateTransaction — missing_type / invalid_type', () => {
  it('reports missing_type when type is empty string', () => {
    // Force-cast to bypass TS to test runtime guard
    const tx = { ...makeTx(), type: '' as 'debit' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_type')).toBe(true);
  });

  it('reports invalid_type for an unrecognised type', () => {
    const tx = { ...makeTx(), type: 'transfer' as 'debit' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'invalid_type')).toBe(true);
  });
});

describe('validateTransaction — missing_amount / negative_amount', () => {
  it('reports missing_amount when amount is undefined', () => {
    const tx = { ...makeTx(), amount: undefined as unknown as number };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_amount')).toBe(true);
  });

  it('reports negative_amount for a negative value', () => {
    const tx = { ...makeTx(), amount: -1 };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'negative_amount')).toBe(true);
  });
});

describe('validateTransaction — missing_currency', () => {
  it('reports missing_currency when currency is empty', () => {
    const tx = { ...makeTx(), currency: '' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_currency')).toBe(true);
  });
});

describe('validateTransaction — import linkage fields', () => {
  it('reports missing_import_job_id when importJobId is empty', () => {
    const tx = { ...makeTx(), importJobId: '' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_import_job_id')).toBe(true);
  });

  it('reports missing_source_file_id when sourceFileId is empty', () => {
    const tx = { ...makeTx(), sourceFileId: '' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_source_file_id')).toBe(true);
  });

  it('reports missing_source_reference when sourceReference is empty', () => {
    const tx = { ...makeTx(), sourceReference: '' };
    const result = validateTransaction(tx);
    expect(result.errors.some((e) => e.code === 'missing_source_reference')).toBe(true);
  });
});

describe('validateTransaction — multiple errors', () => {
  it('collects all errors in a single pass', () => {
    const tx = {
      ...makeTx(),
      id: '',
      accountId: '',
      date: '',
      description: '',
    };
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('missing_id');
    expect(codes).toContain('missing_account_id');
    expect(codes).toContain('missing_date');
    expect(codes).toContain('missing_description');
  });
});

// ---------------------------------------------------------------------------
// isValidTransaction
// ---------------------------------------------------------------------------

describe('isValidTransaction', () => {
  it('returns true for a valid transaction', () => {
    expect(isValidTransaction(makeTx())).toBe(true);
  });

  it('returns false when any field is invalid', () => {
    const tx = { ...makeTx(), id: '' };
    expect(isValidTransaction(tx)).toBe(false);
  });
});
