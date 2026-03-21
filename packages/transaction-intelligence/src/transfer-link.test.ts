import { describe, it, expect } from 'vitest';
import {
  createTransferLink,
  overrideTransferLink,
  confirmTransferLink,
  rejectTransferLink,
  buildTransferLinksFromBatch,
} from './transfer-link.js';
import type { Transaction, TransferLink } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXED_NOW = '2024-01-15T10:00:00.000Z';
const fixedClock = () => FIXED_NOW;
const fixedId = (d: string, c: string) => `tl-${d}-${c}`;

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
// createTransferLink
// ---------------------------------------------------------------------------

describe('createTransferLink', () => {
  it('creates a link with the supplied IDs, confidence, and status', () => {
    const link = createTransferLink('debit-1', 'credit-1', 0.85, 'test reason', 'confirmed', {
      now: fixedClock,
      idFactory: fixedId,
    });

    expect(link.debitTransactionId).toBe('debit-1');
    expect(link.creditTransactionId).toBe('credit-1');
    expect(link.confidence).toBe(0.85);
    expect(link.status).toBe('confirmed');
    expect(link.source).toBe('auto');
    expect(link.reason).toBe('test reason');
    expect(link.createdAt).toBe(FIXED_NOW);
    expect(link.updatedAt).toBe(FIXED_NOW);
  });

  it('creates a pending-review link when status is pending-review', () => {
    const link = createTransferLink('d', 'c', 0.65, 'uncertain', 'pending-review', {
      now: fixedClock,
      idFactory: fixedId,
    });
    expect(link.status).toBe('pending-review');
    expect(link.source).toBe('auto');
  });

  it('uses the default id factory when none is provided', () => {
    const link = createTransferLink('debit-1', 'credit-1', 0.9, 'reason', 'confirmed', {
      now: fixedClock,
    });
    expect(link.id).toBe('tl-debit-1-credit-1');
  });
});

// ---------------------------------------------------------------------------
// overrideTransferLink
// ---------------------------------------------------------------------------

describe('overrideTransferLink', () => {
  it('creates a manual, confirmed link with confidence 1', () => {
    const link = overrideTransferLink('debit-1', 'credit-1', {
      now: fixedClock,
      idFactory: fixedId,
    });

    expect(link.source).toBe('manual');
    expect(link.status).toBe('confirmed');
    expect(link.confidence).toBe(1);
    expect(link.reason).toBe('Manually linked by user');
    expect(link.createdAt).toBe(FIXED_NOW);
  });

  it('sets debitTransactionId and creditTransactionId correctly', () => {
    const link = overrideTransferLink('d-abc', 'c-xyz', { now: fixedClock });
    expect(link.debitTransactionId).toBe('d-abc');
    expect(link.creditTransactionId).toBe('c-xyz');
  });
});

// ---------------------------------------------------------------------------
// confirmTransferLink
// ---------------------------------------------------------------------------

describe('confirmTransferLink', () => {
  function makePendingLink(overrides: Partial<TransferLink> = {}): TransferLink {
    return {
      id: 'tl-1',
      debitTransactionId: 'debit-1',
      creditTransactionId: 'credit-1',
      confidence: 0.65,
      source: 'auto',
      status: 'pending-review',
      reason: 'uncertain match',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      ...overrides,
    };
  }

  it('transitions a pending-review link to confirmed', () => {
    const confirmed = confirmTransferLink(makePendingLink(), { now: fixedClock });
    expect(confirmed.status).toBe('confirmed');
  });

  it('preserves all other fields', () => {
    const link = makePendingLink();
    const confirmed = confirmTransferLink(link, { now: fixedClock });
    expect(confirmed.id).toBe(link.id);
    expect(confirmed.debitTransactionId).toBe(link.debitTransactionId);
    expect(confirmed.creditTransactionId).toBe(link.creditTransactionId);
    expect(confirmed.confidence).toBe(link.confidence);
  });

  it('does not mutate the original link', () => {
    const link = makePendingLink();
    confirmTransferLink(link, { now: fixedClock });
    expect(link.status).toBe('pending-review');
  });

  it('throws when the link is already confirmed', () => {
    const link = makePendingLink({ status: 'confirmed' });
    expect(() => confirmTransferLink(link)).toThrow(/confirmed/);
  });

  it('throws when the link is already rejected', () => {
    const link = makePendingLink({ status: 'rejected' });
    expect(() => confirmTransferLink(link)).toThrow(/rejected/);
  });
});

// ---------------------------------------------------------------------------
// rejectTransferLink
// ---------------------------------------------------------------------------

describe('rejectTransferLink', () => {
  function makeConfirmedLink(overrides: Partial<TransferLink> = {}): TransferLink {
    return {
      id: 'tl-1',
      debitTransactionId: 'debit-1',
      creditTransactionId: 'credit-1',
      confidence: 0.85,
      source: 'auto',
      status: 'confirmed',
      reason: 'matched',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      ...overrides,
    };
  }

  it('transitions a confirmed link to rejected', () => {
    const rejected = rejectTransferLink(makeConfirmedLink(), { now: fixedClock });
    expect(rejected.status).toBe('rejected');
  });

  it('transitions a pending-review link to rejected', () => {
    const link = makeConfirmedLink({ status: 'pending-review' });
    const rejected = rejectTransferLink(link, { now: fixedClock });
    expect(rejected.status).toBe('rejected');
  });

  it('does not mutate the original link', () => {
    const link = makeConfirmedLink();
    rejectTransferLink(link, { now: fixedClock });
    expect(link.status).toBe('confirmed');
  });

  it('preserves all other fields', () => {
    const link = makeConfirmedLink();
    const rejected = rejectTransferLink(link, { now: fixedClock });
    expect(rejected.id).toBe(link.id);
    expect(rejected.debitTransactionId).toBe(link.debitTransactionId);
    expect(rejected.creditTransactionId).toBe(link.creditTransactionId);
    expect(rejected.confidence).toBe(link.confidence);
  });

  it('throws when the link is already rejected', () => {
    const link = makeConfirmedLink({ status: 'rejected' });
    expect(() => rejectTransferLink(link)).toThrow(/already rejected/);
  });
});

// ---------------------------------------------------------------------------
// buildTransferLinksFromBatch
// ---------------------------------------------------------------------------

describe('buildTransferLinksFromBatch', () => {
  const linkOpts = { now: fixedClock, idFactory: fixedId };

  it('returns empty collections for an empty batch', () => {
    const result = buildTransferLinksFromBatch([], linkOpts);
    expect(result.confirmed).toEqual([]);
    expect(result.pendingReview).toEqual([]);
  });

  it('creates a confirmed link for a high-confidence match', () => {
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 5000, date: '2024-01-15', normalizedDescription: 'NEFT TRANSFER' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit', amount: 5000, date: '2024-01-15', normalizedDescription: 'NEFT CREDIT' });

    const result = buildTransferLinksFromBatch([tx1, tx2], { ...linkOpts, minConfidence: 0.8 });

    expect(result.confirmed).toHaveLength(1);
    expect(result.pendingReview).toHaveLength(0);

    const link = result.confirmed[0]!;
    expect(link.debitTransactionId).toBe('tx-1');
    expect(link.creditTransactionId).toBe('tx-2');
    expect(link.status).toBe('confirmed');
    expect(link.source).toBe('auto');
    expect(link.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('creates a pending-review link for an uncertain match (below minConfidence but above reviewThreshold)', () => {
    // Score: 0.6 (base) + 0.15 (1-day delta) = 0.75, below minConfidence 0.8
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 5000, date: '2024-01-15', normalizedDescription: 'SALARY' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit', amount: 5000, date: '2024-01-16', normalizedDescription: 'SALARY' });

    const result = buildTransferLinksFromBatch([tx1, tx2], {
      ...linkOpts,
      minConfidence: 0.8,
      reviewThreshold: 0.5,
    });

    expect(result.confirmed).toHaveLength(0);
    expect(result.pendingReview).toHaveLength(1);

    const link = result.pendingReview[0]!;
    expect(link.status).toBe('pending-review');
    expect(link.confidence).toBe(0.75);
  });

  it('ignores candidates below reviewThreshold', () => {
    // Score: 0.6 (base) + 0.05 (2-day delta) = 0.65 < reviewThreshold 0.7
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 5000, date: '2024-01-15', normalizedDescription: 'PURCHASE' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit', amount: 5000, date: '2024-01-17', normalizedDescription: 'DEPOSIT' });

    const result = buildTransferLinksFromBatch([tx1, tx2], {
      ...linkOpts,
      minConfidence: 0.8,
      reviewThreshold: 0.7,
    });

    expect(result.confirmed).toHaveLength(0);
    expect(result.pendingReview).toHaveLength(0);
  });

  it('does not pair transactions from the same account', () => {
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 5000, date: '2024-01-15' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-1', type: 'credit', amount: 5000, date: '2024-01-15' });

    const result = buildTransferLinksFromBatch([tx1, tx2], linkOpts);
    expect(result.confirmed).toHaveLength(0);
    expect(result.pendingReview).toHaveLength(0);
  });

  it('each transaction is paired at most once', () => {
    // tx1 could match tx2 or tx3 — only the best should win
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit', amount: 5000, date: '2024-01-15', normalizedDescription: 'NEFT' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit', amount: 5000, date: '2024-01-15', normalizedDescription: 'NEFT' });
    const tx3 = makeTx({ id: 'tx-3', accountId: 'acc-3', type: 'credit', amount: 5000, date: '2024-01-15', normalizedDescription: 'NEFT' });

    const result = buildTransferLinksFromBatch([tx1, tx2, tx3], linkOpts);
    const total = result.confirmed.length + result.pendingReview.length;
    // Only one link should be created for tx1; tx3 remains unmatched
    expect(total).toBe(1);
  });

  it('sets debitTransactionId and creditTransactionId correctly regardless of input order', () => {
    // Credit first, then debit
    const credit = makeTx({ id: 'tx-credit', accountId: 'acc-2', type: 'credit', amount: 5000, date: '2024-01-15', normalizedDescription: 'NEFT CREDIT' });
    const debit = makeTx({ id: 'tx-debit', accountId: 'acc-1', type: 'debit', amount: 5000, date: '2024-01-15', normalizedDescription: 'NEFT TRANSFER' });

    const result = buildTransferLinksFromBatch([credit, debit], linkOpts);

    expect(result.confirmed).toHaveLength(1);
    const link = result.confirmed[0]!;
    expect(link.debitTransactionId).toBe('tx-debit');
    expect(link.creditTransactionId).toBe('tx-credit');
  });

  it('does not mutate the input array', () => {
    const tx1 = makeTx({ id: 'tx-1', accountId: 'acc-1', type: 'debit' });
    const tx2 = makeTx({ id: 'tx-2', accountId: 'acc-2', type: 'credit' });
    const input = [tx1, tx2];

    buildTransferLinksFromBatch(input, linkOpts);

    expect(input[0]?.isTransfer).toBe(false);
    expect(input[1]?.isTransfer).toBe(false);
  });

  it('handles multiple independent pairs in one batch', () => {
    const a1 = makeTx({ id: 'a1', accountId: 'acc-a', type: 'debit', amount: 1000, date: '2024-01-15', normalizedDescription: 'NEFT' });
    const a2 = makeTx({ id: 'a2', accountId: 'acc-b', type: 'credit', amount: 1000, date: '2024-01-15', normalizedDescription: 'NEFT' });
    const b1 = makeTx({ id: 'b1', accountId: 'acc-c', type: 'debit', amount: 2000, date: '2024-01-16', normalizedDescription: 'NEFT' });
    const b2 = makeTx({ id: 'b2', accountId: 'acc-d', type: 'credit', amount: 2000, date: '2024-01-16', normalizedDescription: 'NEFT' });

    const result = buildTransferLinksFromBatch([a1, a2, b1, b2], linkOpts);

    expect(result.confirmed).toHaveLength(2);
    expect(result.pendingReview).toHaveLength(0);
  });
});
