import { describe, it, expect } from 'vitest';
import {
  shouldEnqueueForReview,
  inferReviewReason,
  createReviewItem,
  resolveReviewItem,
  buildReviewQueue,
  editReviewItem,
  createReviewQueueStore,
  addItemToStore,
  getItemById,
  listPendingItems,
  listResolvedItems,
  resolveItemInStore,
} from './review-queue.js';
import type { Transaction, ReviewResolution } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    rawRowId: 'row-1',
    accountId: 'acc-1',
    date: '2024-01-15',
    description: 'Grocery Store',
    normalizedDescription: 'GROCERY STORE',
    amount: 1200,
    type: 'debit',
    currency: 'INR',
    categorizationSource: 'built-in',
    isTransfer: false,
    confidence: 0.9,
    status: 'cleared',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  };
}

const FIXED_NOW = '2024-01-15T12:00:00.000Z';

function makeResolution(overrides: Partial<ReviewResolution> = {}): ReviewResolution {
  return {
    action: 'approve',
    userId: 'user-1',
    resolvedAt: '2024-01-16T08:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shouldEnqueueForReview
// ---------------------------------------------------------------------------

describe('shouldEnqueueForReview', () => {
  it('returns false for a high-confidence, categorized, cleared transaction', () => {
    const tx = makeTx({ confidence: 0.95, categorizationSource: 'built-in', status: 'cleared' });
    expect(shouldEnqueueForReview(tx)).toBe(false);
  });

  it('returns true when confidence is below threshold', () => {
    const tx = makeTx({ confidence: 0.6 });
    expect(shouldEnqueueForReview(tx, { confidenceThreshold: 0.8 })).toBe(true);
  });

  it('returns true when status is pending', () => {
    const tx = makeTx({ status: 'pending' });
    expect(shouldEnqueueForReview(tx)).toBe(true);
  });

  it('returns true when transaction is uncategorized (and not a transfer)', () => {
    const tx = makeTx({ categorizationSource: 'uncategorized', isTransfer: false });
    expect(shouldEnqueueForReview(tx)).toBe(true);
  });

  it('returns false for an uncategorized own-account transfer', () => {
    const tx = makeTx({ categorizationSource: 'uncategorized', isTransfer: true, confidence: 0.9 });
    expect(shouldEnqueueForReview(tx)).toBe(false);
  });

  it('uses the confidenceThreshold option', () => {
    const tx = makeTx({ confidence: 0.75, categorizationSource: 'built-in' });
    expect(shouldEnqueueForReview(tx, { confidenceThreshold: 0.9 })).toBe(true);
    expect(shouldEnqueueForReview(tx, { confidenceThreshold: 0.7 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inferReviewReason
// ---------------------------------------------------------------------------

describe('inferReviewReason', () => {
  it('returns "parse-error" for very low confidence (< 0.5)', () => {
    expect(inferReviewReason(makeTx({ confidence: 0.3 }))).toBe('parse-error');
  });

  it('returns "ambiguous-transfer" for moderate confidence + transfer flag', () => {
    expect(inferReviewReason(makeTx({ confidence: 0.6, isTransfer: true }))).toBe('ambiguous-transfer');
  });

  it('returns "low-confidence" for moderate confidence without transfer', () => {
    expect(inferReviewReason(makeTx({ confidence: 0.6, isTransfer: false }))).toBe('low-confidence');
  });

  it('returns "uncategorized" when confidence is fine but source is uncategorized', () => {
    expect(inferReviewReason(makeTx({ confidence: 0.95, categorizationSource: 'uncategorized' }))).toBe('uncategorized');
  });
});

// ---------------------------------------------------------------------------
// createReviewItem
// ---------------------------------------------------------------------------

describe('createReviewItem', () => {
  it('creates a review item with correct initial properties', () => {
    const tx = makeTx({ confidence: 0.6 });
    const item = createReviewItem(tx, { now: () => FIXED_NOW });

    expect(item.transactionId).toBe('tx-1');
    expect(item.confidence).toBe(0.6);
    expect(item.createdAt).toBe(FIXED_NOW);
    expect(item.resolvedAt).toBeUndefined();
    expect(item.resolution).toBeUndefined();
  });

  it('starts with exactly one audit entry', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    expect(item.auditTrail).toHaveLength(1);
    expect(item.auditTrail[0]?.event).toBe('created');
    expect(item.auditTrail[0]?.timestamp).toBe(FIXED_NOW);
  });

  it('uses idFactory to generate the item id', () => {
    const item = createReviewItem(makeTx(), {
      idFactory: (txId) => `review-${txId}`,
      now: () => FIXED_NOW,
    });
    expect(item.id).toBe('review-tx-1');
  });

  it('assigns correct reason for parse error', () => {
    const item = createReviewItem(makeTx({ confidence: 0.3 }), { now: () => FIXED_NOW });
    expect(item.reason).toBe('parse-error');
  });

  it('assigns correct reason for uncategorized', () => {
    const item = createReviewItem(
      makeTx({ confidence: 0.95, categorizationSource: 'uncategorized' }),
      { now: () => FIXED_NOW },
    );
    expect(item.reason).toBe('uncategorized');
  });
});

// ---------------------------------------------------------------------------
// resolveReviewItem
// ---------------------------------------------------------------------------

describe('resolveReviewItem', () => {
  it('resolves an item and records the resolution', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const resolution = makeResolution({ action: 'approve', userId: 'user-42' });
    const resolved = resolveReviewItem(item, resolution);

    expect(resolved.resolvedAt).toBe(resolution.resolvedAt);
    expect(resolved.resolution?.action).toBe('approve');
    expect(resolved.resolution?.userId).toBe('user-42');
  });

  it('does not mutate the original item', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const resolution = makeResolution();
    resolveReviewItem(item, resolution);
    expect(item.resolvedAt).toBeUndefined();
  });

  it('appends a "resolved" audit entry', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const resolved = resolveReviewItem(item, makeResolution());
    expect(resolved.auditTrail).toHaveLength(2);
    expect(resolved.auditTrail[1]?.event).toBe('resolved');
  });

  it('includes the action and userId in the audit entry detail', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const resolved = resolveReviewItem(item, makeResolution({ action: 'edit', userId: 'u-99', notes: 'Fixed' }));
    expect(resolved.auditTrail[1]?.detail).toContain('edit');
    expect(resolved.auditTrail[1]?.detail).toContain('u-99');
    expect(resolved.auditTrail[1]?.detail).toContain('Fixed');
  });

  it('throws when attempting to resolve an already-resolved item', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const resolved = resolveReviewItem(item, makeResolution());
    expect(() => resolveReviewItem(resolved, makeResolution())).toThrow(/already resolved/);
  });
});

// ---------------------------------------------------------------------------
// buildReviewQueue
// ---------------------------------------------------------------------------

describe('buildReviewQueue', () => {
  it('enqueues transactions that meet review criteria', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'tx-ok', confidence: 0.95, categorizationSource: 'built-in' }),
      makeTx({ id: 'tx-low', confidence: 0.5 }),
      makeTx({ id: 'tx-uncat', confidence: 0.9, categorizationSource: 'uncategorized' }),
    ];

    const items = buildReviewQueue(txs, { now: () => FIXED_NOW });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.transactionId).sort()).toEqual(['tx-low', 'tx-uncat'].sort());
  });

  it('returns an empty array when no transactions qualify', () => {
    const txs = [makeTx({ confidence: 0.99, categorizationSource: 'built-in' })];
    expect(buildReviewQueue(txs)).toHaveLength(0);
  });

  it('returns an empty array for empty input', () => {
    expect(buildReviewQueue([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// editReviewItem
// ---------------------------------------------------------------------------

describe('editReviewItem', () => {
  it('appends an "edited" audit entry to the trail', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const edited = editReviewItem(item, 'user-7', { now: () => FIXED_NOW });
    expect(edited.auditTrail).toHaveLength(2);
    expect(edited.auditTrail[1]?.event).toBe('edited');
  });

  it('records the editor user ID in the audit entry detail', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const edited = editReviewItem(item, 'user-7', { now: () => FIXED_NOW });
    expect(edited.auditTrail[1]?.detail).toContain('user-7');
  });

  it('includes notes in the audit entry detail when provided', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const edited = editReviewItem(item, 'user-7', { notes: 'Fixed description', now: () => FIXED_NOW });
    expect(edited.auditTrail[1]?.detail).toContain('Fixed description');
  });

  it('does not mutate the original item', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    editReviewItem(item, 'user-7', { now: () => FIXED_NOW });
    expect(item.auditTrail).toHaveLength(1);
  });

  it('allows multiple edits, each appending a separate audit entry', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const afterFirst = editReviewItem(item, 'user-7', { now: () => FIXED_NOW });
    const afterSecond = editReviewItem(afterFirst, 'user-7', { notes: 'Second fix', now: () => FIXED_NOW });
    expect(afterSecond.auditTrail).toHaveLength(3);
  });

  it('throws when attempting to edit an already-resolved item', () => {
    const item = createReviewItem(makeTx({ confidence: 0.6 }), { now: () => FIXED_NOW });
    const resolved = resolveReviewItem(item, makeResolution());
    expect(() => editReviewItem(resolved, 'user-7')).toThrow(/already resolved/);
  });
});

// ---------------------------------------------------------------------------
// ReviewQueueStore
// ---------------------------------------------------------------------------

describe('createReviewQueueStore', () => {
  it('creates an empty store with no items', () => {
    const store = createReviewQueueStore();
    expect(Object.keys(store.items)).toHaveLength(0);
  });
});

describe('addItemToStore', () => {
  it('adds an item to the store', () => {
    const store = createReviewQueueStore();
    const item = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const updated = addItemToStore(store, item);
    expect(Object.keys(updated.items)).toHaveLength(1);
    expect(updated.items[item.id]).toBe(item);
  });

  it('does not mutate the original store', () => {
    const store = createReviewQueueStore();
    const item = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    addItemToStore(store, item);
    expect(Object.keys(store.items)).toHaveLength(0);
  });

  it('throws when adding an item with a duplicate ID', () => {
    const store = createReviewQueueStore();
    const item = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const updated = addItemToStore(store, item);
    expect(() => addItemToStore(updated, item)).toThrow(/already exists/);
  });
});

describe('getItemById', () => {
  it('returns the item when it exists', () => {
    const item = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const store = addItemToStore(createReviewQueueStore(), item);
    expect(getItemById(store, item.id)).toBe(item);
  });

  it('returns undefined for a missing ID', () => {
    expect(getItemById(createReviewQueueStore(), 'rq-missing')).toBeUndefined();
  });

  it('returns undefined for prototype property names (no prototype pollution)', () => {
    expect(getItemById(createReviewQueueStore(), '__proto__')).toBeUndefined();
    expect(getItemById(createReviewQueueStore(), 'constructor')).toBeUndefined();
  });
});

describe('listPendingItems', () => {
  it('returns only unresolved items', () => {
    const item1 = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const item2 = createReviewItem(makeTx({ id: 'tx-2', confidence: 0.5 }), { now: () => FIXED_NOW });
    const resolved2 = resolveReviewItem(item2, makeResolution());

    let store = createReviewQueueStore();
    store = addItemToStore(store, item1);
    store = addItemToStore(store, resolved2);

    const pending = listPendingItems(store);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.transactionId).toBe('tx-1');
  });

  it('returns items sorted by createdAt ascending', () => {
    const earlier = createReviewItem(
      makeTx({ id: 'tx-a', confidence: 0.6 }),
      { now: () => '2024-01-10T08:00:00.000Z' },
    );
    const later = createReviewItem(
      makeTx({ id: 'tx-b', confidence: 0.5 }),
      { now: () => '2024-01-15T08:00:00.000Z' },
    );

    // Add in reverse order to confirm sort overrides insertion order
    let store = createReviewQueueStore();
    store = addItemToStore(store, later);
    store = addItemToStore(store, earlier);

    const pending = listPendingItems(store);
    expect(pending.map((i) => i.transactionId)).toEqual(['tx-a', 'tx-b']);
  });

  it('returns an empty array when all items are resolved', () => {
    const item = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const resolved = resolveReviewItem(item, makeResolution());
    const store = addItemToStore(createReviewQueueStore(), resolved);
    expect(listPendingItems(store)).toHaveLength(0);
  });
});

describe('listResolvedItems', () => {
  it('returns only resolved items', () => {
    const item1 = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const item2 = createReviewItem(makeTx({ id: 'tx-2', confidence: 0.5 }), { now: () => FIXED_NOW });
    const resolved2 = resolveReviewItem(item2, makeResolution());

    let store = createReviewQueueStore();
    store = addItemToStore(store, item1);
    store = addItemToStore(store, resolved2);

    const resolved = listResolvedItems(store);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.transactionId).toBe('tx-2');
  });
});

describe('resolveItemInStore', () => {
  it('resolves an item and returns an updated store', () => {
    const item = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const store = addItemToStore(createReviewQueueStore(), item);
    const resolution = makeResolution({ action: 'approve', userId: 'user-99' });

    const updated = resolveItemInStore(store, item.id, resolution);
    const resolvedItem = getItemById(updated, item.id);

    expect(resolvedItem?.resolvedAt).toBe(resolution.resolvedAt);
    expect(resolvedItem?.resolution?.action).toBe('approve');
  });

  it('does not mutate the original store', () => {
    const item = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const store = addItemToStore(createReviewQueueStore(), item);
    resolveItemInStore(store, item.id, makeResolution());
    expect(store.items[item.id]?.resolvedAt).toBeUndefined();
  });

  it('throws when the item ID does not exist', () => {
    const store = createReviewQueueStore();
    expect(() => resolveItemInStore(store, 'rq-missing', makeResolution())).toThrow(/not found/);
  });

  it('throws when the item is already resolved', () => {
    const item = createReviewItem(makeTx({ id: 'tx-1', confidence: 0.6 }), { now: () => FIXED_NOW });
    const resolved = resolveReviewItem(item, makeResolution());
    const store = addItemToStore(createReviewQueueStore(), resolved);
    expect(() => resolveItemInStore(store, item.id, makeResolution())).toThrow(/already resolved/);
  });
});
