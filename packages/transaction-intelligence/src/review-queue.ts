/**
 * Review queue for low-confidence transactions.
 *
 * Transactions that could not be confidently parsed or categorized are placed
 * in a review queue so that a human can inspect and resolve them.  Every
 * action on a queue item is appended to an immutable audit trail.
 */

import type {
  Transaction,
  ReviewQueueItem,
  ReviewQueueStore,
  ReviewResolution,
  ReviewReason,
  ReviewAuditEntry,
} from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ReviewQueueOptions {
  /**
   * Confidence threshold below which a transaction is enqueued.
   * Defaults to `0.8`.
   */
  confidenceThreshold?: number;
  /**
   * Clock function returning the current ISO timestamp.
   * Injected for deterministic tests.
   */
  now?: () => string;
  /**
   * Factory for stable review-item IDs.
   * Defaults to a simple prefix + transaction ID.
   */
  idFactory?: (transactionId: string) => string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function defaultIdFactory(transactionId: string): string {
  return `rq-${transactionId}`;
}

function makeAuditEntry(event: string, detail: string, now: () => string): ReviewAuditEntry {
  return { timestamp: now(), event, detail };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a transaction should be placed in the review queue.
 *
 * Conditions:
 *  - Parse or categorization confidence is below `confidenceThreshold`, OR
 *  - The transaction is uncategorized (and not a transfer), OR
 *  - The transaction status is `"pending"`
 */
export function shouldEnqueueForReview(
  tx: Transaction,
  options: Pick<ReviewQueueOptions, 'confidenceThreshold'> = {},
): boolean {
  const { confidenceThreshold = 0.8 } = options;

  if (tx.confidence < confidenceThreshold) return true;
  if (tx.status === 'pending') return true;
  if (tx.categorizationSource === 'uncategorized' && !tx.isTransfer) return true;

  return false;
}

/**
 * Determines the most appropriate reason for enqueuing a given transaction.
 */
export function inferReviewReason(
  tx: Transaction,
  options: Pick<ReviewQueueOptions, 'confidenceThreshold'> = {},
): ReviewReason {
  const { confidenceThreshold = 0.8 } = options;

  if (tx.confidence < confidenceThreshold) {
    // Very low confidence likely means a parse problem
    if (tx.confidence < 0.5) return 'parse-error';
    // Moderate confidence with transfer flag suggests ambiguous transfer
    if (tx.isTransfer) return 'ambiguous-transfer';
    return 'low-confidence';
  }

  if (tx.categorizationSource === 'uncategorized') return 'uncategorized';

  return 'low-confidence';
}

/**
 * Creates a new ReviewQueueItem for the given transaction.
 * The item starts with a single `"created"` audit entry.
 */
export function createReviewItem(
  tx: Transaction,
  options: ReviewQueueOptions = {},
): ReviewQueueItem {
  const {
    confidenceThreshold = 0.8,
    now = () => new Date().toISOString(),
    idFactory = defaultIdFactory,
  } = options;

  const reason = inferReviewReason(tx, { confidenceThreshold });
  const createdAt = now();

  return {
    id: idFactory(tx.id),
    transactionId: tx.id,
    reason,
    confidence: tx.confidence,
    createdAt,
    resolvedAt: undefined,
    resolution: undefined,
    auditTrail: [
      makeAuditEntry(
        'created',
        `Enqueued for review: ${reason} (confidence ${tx.confidence.toFixed(2)})`,
        () => createdAt,
      ),
    ],
  };
}

/**
 * Resolves a review queue item with the provided resolution.
 *
 * Returns a new `ReviewQueueItem` — the original is not mutated.
 * The resolution is appended to the audit trail for full auditability.
 *
 * @throws {Error} if the item has already been resolved.
 */
export function resolveReviewItem(
  item: ReviewQueueItem,
  resolution: ReviewResolution,
): ReviewQueueItem {
  if (item.resolvedAt !== undefined) {
    throw new Error(
      `Review item "${item.id}" is already resolved (resolved at ${item.resolvedAt})`,
    );
  }

  const resolvedAt = resolution.resolvedAt;

  const auditEntry = makeAuditEntry(
    'resolved',
    `Action: ${resolution.action}; user: ${resolution.userId}${resolution.notes ? `; notes: ${resolution.notes}` : ''}`,
    () => resolvedAt,
  );

  return {
    ...item,
    resolvedAt,
    resolution,
    auditTrail: [...item.auditTrail, auditEntry],
  };
}

/**
 * Builds a review queue from a batch of transactions, enqueuing any that
 * meet the review criteria.
 *
 * @returns An array of newly created ReviewQueueItems (one per qualifying
 *          transaction, in input order).
 */
export function buildReviewQueue(
  transactions: Transaction[],
  options: ReviewQueueOptions = {},
): ReviewQueueItem[] {
  const { confidenceThreshold = 0.8 } = options;
  const items: ReviewQueueItem[] = [];

  for (const tx of transactions) {
    if (shouldEnqueueForReview(tx, { confidenceThreshold })) {
      items.push(createReviewItem(tx, options));
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Edit tracking
// ---------------------------------------------------------------------------

/** Options for {@link editReviewItem}. */
export interface EditReviewItemOptions {
  /** Optional reviewer notes explaining the edit. */
  notes?: string;
  /** Clock function returning the current ISO timestamp. Injected for deterministic tests. */
  now?: () => string;
}

/**
 * Records an intermediate edit on a review item without resolving it.
 *
 * Use this when a reviewer amends transaction data (e.g. corrects the
 * description or amount) as part of the review flow before making a final
 * approve / reject decision.  Each call appends an `"edited"` entry to the
 * item's audit trail so that every change is fully traceable.
 *
 * Returns a new `ReviewQueueItem` — the original is not mutated.
 *
 * @throws {Error} if the item has already been resolved.
 */
export function editReviewItem(
  item: ReviewQueueItem,
  userId: string,
  options: EditReviewItemOptions = {},
): ReviewQueueItem {
  if (item.resolvedAt !== undefined) {
    throw new Error(
      `Review item "${item.id}" is already resolved — cannot record edit.`,
    );
  }

  const { notes, now = () => new Date().toISOString() } = options;

  const auditEntry = makeAuditEntry(
    'edited',
    `Edited by user: ${userId}${notes ? `; notes: ${notes}` : ''}`,
    now,
  );

  return {
    ...item,
    auditTrail: [...item.auditTrail, auditEntry],
  };
}

// ---------------------------------------------------------------------------
// Review Queue Store
// ---------------------------------------------------------------------------

/**
 * Creates an empty {@link ReviewQueueStore} with no items.
 *
 * @example
 * ```ts
 * const store = createReviewQueueStore();
 * ```
 */
export function createReviewQueueStore(): ReviewQueueStore {
  return { items: {} };
}

/**
 * Adds a {@link ReviewQueueItem} to the store.
 *
 * Returns a new `ReviewQueueStore`; the original is not mutated.
 *
 * @throws {Error} if an item with the same ID already exists in the store.
 */
export function addItemToStore(
  store: ReviewQueueStore,
  item: ReviewQueueItem,
): ReviewQueueStore {
  if (store.items[item.id] !== undefined) {
    throw new Error(`Review item "${item.id}" already exists in the store.`);
  }
  return { ...store, items: { ...store.items, [item.id]: item } };
}

/**
 * Retrieves a single {@link ReviewQueueItem} by its ID.
 *
 * Returns `undefined` when no item with that ID exists.
 */
export function getItemById(
  store: ReviewQueueStore,
  id: string,
): ReviewQueueItem | undefined {
  return store.items[id];
}

/**
 * Returns all unresolved items in the store, in insertion order.
 *
 * "Unresolved" means the item has no `resolvedAt` timestamp.
 */
export function listPendingItems(store: ReviewQueueStore): ReviewQueueItem[] {
  return Object.values(store.items).filter((item) => item.resolvedAt === undefined);
}

/**
 * Returns all resolved items in the store, in insertion order.
 */
export function listResolvedItems(store: ReviewQueueStore): ReviewQueueItem[] {
  return Object.values(store.items).filter((item) => item.resolvedAt !== undefined);
}

/**
 * Resolves a review queue item inside the store.
 *
 * Delegates to {@link resolveReviewItem} and returns a new
 * `ReviewQueueStore` containing the updated item.
 *
 * Returns a new `ReviewQueueStore`; the original is not mutated.
 *
 * @throws {Error} if no item with `id` exists in the store.
 * @throws {Error} if the item has already been resolved (re-thrown from {@link resolveReviewItem}).
 */
export function resolveItemInStore(
  store: ReviewQueueStore,
  id: string,
  resolution: ReviewResolution,
): ReviewQueueStore {
  const item = store.items[id];
  if (item === undefined) {
    throw new Error(`Review item "${id}" not found in the store.`);
  }
  const resolved = resolveReviewItem(item, resolution);
  return { ...store, items: { ...store.items, [id]: resolved } };
}
