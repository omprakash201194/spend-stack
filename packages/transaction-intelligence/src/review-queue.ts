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
// editReviewItem — intermediate edit tracking
// ---------------------------------------------------------------------------

/**
 * Records an intermediate edit on a review queue item without resolving it.
 *
 * Returns a new `ReviewQueueItem` — the original is not mutated.
 * An `"edited"` audit entry is appended so that all changes remain
 * traceable.
 *
 * @throws {Error} if the item has already been resolved.
 */
export function editReviewItem(
  item: ReviewQueueItem,
  detail: string,
  options: Pick<ReviewQueueOptions, 'now'> = {},
): ReviewQueueItem {
  if (item.resolvedAt !== undefined) {
    throw new Error(
      `Review item "${item.id}" is already resolved and cannot be edited`,
    );
  }

  const { now = () => new Date().toISOString() } = options;

  const auditEntry = makeAuditEntry('edited', detail, now);

  return {
    ...item,
    auditTrail: [...item.auditTrail, auditEntry],
  };
}

// ---------------------------------------------------------------------------
// ReviewQueueStore CRUD helpers
// ---------------------------------------------------------------------------

/**
 * Creates an empty ReviewQueueStore.
 */
export function createReviewQueueStore(): ReviewQueueStore {
  return { items: Object.create(null) as Record<string, ReviewQueueItem> };
}

/**
 * Adds a ReviewQueueItem to the store.
 * Returns a new `ReviewQueueStore`; the original is not mutated.
 *
 * @throws {Error} if an item with the same ID already exists.
 */
export function addItemToStore(
  store: ReviewQueueStore,
  item: ReviewQueueItem,
): ReviewQueueStore {
  if (Object.hasOwn(store.items, item.id)) {
    throw new Error(`Review queue item with ID "${item.id}" already exists`);
  }
  const items = Object.assign(
    Object.create(null) as Record<string, ReviewQueueItem>,
    store.items,
    { [item.id]: item },
  );
  return { items };
}

/**
 * Retrieves a ReviewQueueItem by ID, or `undefined` if not found.
 */
export function getItemById(
  store: ReviewQueueStore,
  id: string,
): ReviewQueueItem | undefined {
  return Object.hasOwn(store.items, id) ? store.items[id] : undefined;
}

/**
 * Returns all unresolved items in the store (no `resolvedAt`), in insertion
 * order.
 */
export function listPendingItems(store: ReviewQueueStore): ReviewQueueItem[] {
  return Object.values(store.items).filter((item) => item.resolvedAt === undefined);
}

/**
 * Returns all resolved items in the store (has `resolvedAt`), in insertion
 * order.
 */
export function listResolvedItems(store: ReviewQueueStore): ReviewQueueItem[] {
  return Object.values(store.items).filter((item) => item.resolvedAt !== undefined);
}

/**
 * Applies a resolution to the item identified by `id` inside the store.
 * Returns a new `ReviewQueueStore`; the original is not mutated.
 *
 * @throws {Error} if the item is not found.
 * @throws {Error} if the item is already resolved (delegated to `resolveReviewItem`).
 */
export function resolveItemInStore(
  store: ReviewQueueStore,
  id: string,
  resolution: ReviewResolution,
): ReviewQueueStore {
  const item = getItemById(store, id);
  if (item === undefined) {
    throw new Error(`Review queue item with ID "${id}" not found`);
  }
  const resolved = resolveReviewItem(item, resolution);
  const items = Object.assign(
    Object.create(null) as Record<string, ReviewQueueItem>,
    store.items,
    { [id]: resolved },
  );
  return { items };
}
