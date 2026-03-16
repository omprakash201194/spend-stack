import { describe, it, expect } from 'vitest';
import { detectTransfer, detectTransfersBatch } from './transfer-detector.js';
import type { Transaction } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    rawRowId: 'row-1',
    accountId: 'acc-1',
    date: '2024-01-15',
    description: 'Transfer to savings',
    normalizedDescription: 'TRANSFER TO SAVINGS',
    amount: 5000,
    type: 'debit',
    currency: 'INR',
    categorizationSource: 'uncategorized',
    isTransfer: false,
    confidence: 0.95,
    status: 'cleared',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectTransfer
// ---------------------------------------------------------------------------

describe('detectTransfer', () => {
  it('returns isTransfer=false when no candidates are provided', () => {
    const result = detectTransfer(makeTx(), []);
    expect(result.isTransfer).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('returns isTransfer=false when all candidates have the same direction', () => {
    const tx = makeTx({ type: 'debit' });
    const candidate = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'debit' });
    const result = detectTransfer(tx, [candidate]);
    expect(result.isTransfer).toBe(false);
  });

  it('returns isTransfer=false when amounts differ', () => {
    const tx = makeTx({ type: 'debit', amount: 5000 });
    const candidate = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit', amount: 4999 });
    const result = detectTransfer(tx, [candidate]);
    expect(result.isTransfer).toBe(false);
  });

  it('returns isTransfer=false when date delta exceeds window', () => {
    const tx = makeTx({ date: '2024-01-01' });
    const candidate = makeTx({
      id: 'tx-2',
      accountId: 'acc-2',
      type: 'credit',
      date: '2024-01-10',
    });
    const result = detectTransfer(tx, [candidate]);
    expect(result.isTransfer).toBe(false);
  });

  it('detects a transfer with same date, same amount, opposite direction', () => {
    const tx = makeTx({ type: 'debit', amount: 5000, date: '2024-01-15' });
    const candidate = makeTx({
      id: 'tx-2',
      accountId: 'acc-2',
      type: 'credit',
      amount: 5000,
      date: '2024-01-15',
    });
    const result = detectTransfer(tx, [candidate]);
    expect(result.isTransfer).toBe(true);
    expect(result.peerId).toBe('tx-2');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('boosts confidence when transfer keyword is present', () => {
    const tx = makeTx({
      type: 'debit',
      amount: 5000,
      date: '2024-01-15',
      normalizedDescription: 'NEFT TRANSFER TO SAVINGS',
    });
    const candidate = makeTx({
      id: 'tx-2',
      accountId: 'acc-2',
      type: 'credit',
      amount: 5000,
      date: '2024-01-15',
      normalizedDescription: 'NEFT CREDIT FROM CURRENT',
    });
    const plain = detectTransfer(
      makeTx({ type: 'debit', amount: 5000, date: '2024-01-15', normalizedDescription: 'SALARY' }),
      [makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit', amount: 5000, date: '2024-01-15', normalizedDescription: 'SALARY' })],
    );
    const withKeyword = detectTransfer(tx, [candidate]);
    expect(withKeyword.confidence).toBeGreaterThan(plain.confidence);
  });

  it('returns isTransfer=false when confidence is below minConfidence', () => {
    // Use neutral descriptions (no transfer keywords) and a 1-day date gap so
    // the heuristic score stays at 0.75 (0.6 base + 0.15 for 1-day delta),
    // which is below the minConfidence of 0.8.
    const tx = makeTx({
      type: 'debit',
      amount: 5000,
      date: '2024-01-15',
      normalizedDescription: 'GROCERY PURCHASE',
    });
    const candidate = makeTx({
      id: 'tx-2',
      accountId: 'acc-2',
      type: 'credit',
      amount: 5000,
      date: '2024-01-16',
      normalizedDescription: 'GROCERY PURCHASE',
    });
    // Score = 0.6 (base) + 0.15 (1-day delta) = 0.75 < 0.8
    const result = detectTransfer(tx, [candidate], { minConfidence: 0.8 });
    expect(result.isTransfer).toBe(false);
  });

  it('includes a human-readable reason in the result', () => {
    const tx = makeTx({ type: 'debit', amount: 5000, date: '2024-01-15' });
    const candidate = makeTx({
      id: 'tx-2',
      accountId: 'acc-2',
      type: 'credit',
      amount: 5000,
      date: '2024-01-15',
    });
    const result = detectTransfer(tx, [candidate]);
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// detectTransfersBatch
// ---------------------------------------------------------------------------

describe('detectTransfersBatch', () => {
  it('does not mutate the input array', () => {
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit' });
    const input = [tx1, tx2];
    detectTransfersBatch(input);
    expect(input[0]?.isTransfer).toBe(false);
    expect(input[1]?.isTransfer).toBe(false);
  });

  it('marks matched pairs as transfers', () => {
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 5000, date: '2024-01-15' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit', amount: 5000, date: '2024-01-15' });

    const result = detectTransfersBatch([tx1, tx2]);
    const r1 = result.find((t) => t.id === 'tx-1')!;
    const r2 = result.find((t) => t.id === 'tx-2')!;

    expect(r1.isTransfer).toBe(true);
    expect(r1.transferPeerId).toBe('tx-2');
    expect(r2.isTransfer).toBe(true);
    expect(r2.transferPeerId).toBe('tx-1');
  });

  it('sets categorizationSource to "transfer" for matched transactions', () => {
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 3000, date: '2024-01-15' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit', amount: 3000, date: '2024-01-15' });

    const result = detectTransfersBatch([tx1, tx2]);
    expect(result.find((t) => t.id === 'tx-1')?.categorizationSource).toBe('transfer');
    expect(result.find((t) => t.id === 'tx-2')?.categorizationSource).toBe('transfer');
  });

  it('does not match transactions from the same account', () => {
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 5000, date: '2024-01-15' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-1', type: 'credit', amount: 5000, date: '2024-01-15' });

    const result = detectTransfersBatch([tx1, tx2]);
    expect(result[0]?.isTransfer).toBe(false);
    expect(result[1]?.isTransfer).toBe(false);
  });

  it('leaves unmatched transactions unchanged', () => {
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 5000 });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'debit', amount: 5000 });

    const result = detectTransfersBatch([tx1, tx2]);
    expect(result[0]?.isTransfer).toBe(false);
    expect(result[1]?.isTransfer).toBe(false);
  });

  it('handles an empty array', () => {
    expect(detectTransfersBatch([])).toEqual([]);
  });
});
