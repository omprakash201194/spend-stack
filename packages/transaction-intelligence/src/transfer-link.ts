/**
 * Transfer link management.
 *
 * A TransferLink is a first-class entity that explicitly represents the
 * pairing of a debit transaction on one account with a corresponding credit
 * transaction on another account of the same user — an own-account transfer.
 *
 * Links can be:
 *  - Created automatically by the detector (source: "auto")
 *  - Created or overridden manually by the user (source: "manual")
 *  - Confirmed (high-confidence auto match, or user-approved review match)
 *  - Rejected by the user when the automatic match is a false positive
 *
 * Design principles:
 *  - All state transitions return new objects; originals are never mutated
 *  - Every function records a `reason` string for auditability
 */

import type { Transaction, TransferLink, TransferLinkStatus } from './types.js';
import { detectTransfer } from './transfer-detector.js';
import type { TransferDetectorOptions } from './transfer-detector.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TransferLinkOptions {
  /**
   * Clock function returning the current ISO timestamp.
   * Injected for deterministic tests.
   */
  now?: () => string;
  /**
   * Factory for stable link IDs.
   * Defaults to `"tl-<debitId>-<creditId>"`.
   */
  idFactory?: (debitId: string, creditId: string) => string;
}

export interface TransferLinkBuildOptions extends TransferDetectorOptions, TransferLinkOptions {
  /**
   * Lower confidence bound below which a candidate is silently ignored.
   * Candidates that score at or above this value but below `minConfidence`
   * are collected in `pendingReview`.
   * Defaults to `0.5`.
   */
  reviewThreshold?: number;
}

/** Returned by {@link buildTransferLinksFromBatch}. */
export interface TransferLinkBatchResult {
  /** High-confidence matches (score ≥ minConfidence). */
  confirmed: TransferLink[];
  /**
   * Uncertain matches (reviewThreshold ≤ score < minConfidence).
   * These should be surfaced to the user for review.
   */
  pendingReview: TransferLink[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function defaultIdFactory(debitId: string, creditId: string): string {
  return `tl-${debitId}-${creditId}`;
}

function transition(
  link: TransferLink,
  status: TransferLinkStatus,
  reason: string,
  now: () => string,
): TransferLink {
  return { ...link, status, reason, updatedAt: now() };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new TransferLink from two matched transaction IDs.
 *
 * @param debitTransactionId  ID of the debit side.
 * @param creditTransactionId ID of the credit side.
 * @param confidence          Score produced by the detector (0–1).
 * @param reason              Human-readable explanation for auditability.
 * @param status              Initial lifecycle status of the link.
 * @param options             Optional clock and ID factory overrides.
 */
export function createTransferLink(
  debitTransactionId: string,
  creditTransactionId: string,
  confidence: number,
  reason: string,
  status: TransferLinkStatus,
  options: TransferLinkOptions = {},
): TransferLink {
  const { now = () => new Date().toISOString(), idFactory = defaultIdFactory } = options;
  const ts = now();

  return {
    id: idFactory(debitTransactionId, creditTransactionId),
    debitTransactionId,
    creditTransactionId,
    confidence,
    source: 'auto',
    status,
    reason,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Creates a manual TransferLink that overrides automatic detection.
 *
 * Use this when the user explicitly links two transactions that the detector
 * did not pair, or when the user corrects an incorrect automatic pairing by
 * rejecting it and providing the correct pair.
 *
 * The link is created with `source: "manual"` and `status: "confirmed"`.
 */
export function overrideTransferLink(
  debitTransactionId: string,
  creditTransactionId: string,
  options: TransferLinkOptions = {},
): TransferLink {
  const { now = () => new Date().toISOString(), idFactory = defaultIdFactory } = options;
  const ts = now();

  return {
    id: idFactory(debitTransactionId, creditTransactionId),
    debitTransactionId,
    creditTransactionId,
    confidence: 1,
    source: 'manual',
    status: 'confirmed',
    reason: 'Manually linked by user',
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Confirms a pending-review link, marking it as a true transfer.
 *
 * Returns a new TransferLink — the original is not mutated.
 *
 * @throws {Error} if the link is already confirmed or rejected.
 */
export function confirmTransferLink(
  link: TransferLink,
  options: Pick<TransferLinkOptions, 'now'> = {},
): TransferLink {
  if (link.status !== 'pending-review') {
    throw new Error(
      `Cannot confirm transfer link "${link.id}": current status is "${link.status}"`,
    );
  }
  const now = options.now ?? (() => new Date().toISOString());
  return transition(link, 'confirmed', `Confirmed by user (was: ${link.reason})`, now);
}

/**
 * Rejects a transfer link, marking it as a false positive.
 *
 * Both `"pending-review"` and `"confirmed"` links can be rejected so that
 * users can correct mistakes made by the detector or earlier reviews.
 *
 * Returns a new TransferLink — the original is not mutated.
 *
 * @throws {Error} if the link is already rejected.
 */
export function rejectTransferLink(
  link: TransferLink,
  options: Pick<TransferLinkOptions, 'now'> = {},
): TransferLink {
  if (link.status === 'rejected') {
    throw new Error(`Transfer link "${link.id}" is already rejected`);
  }
  const now = options.now ?? (() => new Date().toISOString());
  return transition(link, 'rejected', `Rejected by user (was: ${link.reason})`, now);
}

/**
 * Runs two-pass transfer detection over a batch of transactions and returns
 * two collections of TransferLinks:
 *
 *  - `confirmed`     — pairs whose confidence ≥ `minConfidence` (default 0.8)
 *  - `pendingReview` — pairs whose confidence is between `reviewThreshold`
 *                      (default 0.5) and `minConfidence`; these should be
 *                      surfaced to the user via the review queue
 *
 * Each transaction pair is linked at most once (the highest-confidence match
 * wins).  Transactions from the same account are never paired.
 *
 * @param transactions  All transactions belonging to the same user/workspace,
 *                      potentially spanning multiple accounts.
 * @param options       Tuning parameters and optional overrides.
 */
export function buildTransferLinksFromBatch(
  transactions: Transaction[],
  options: TransferLinkBuildOptions = {},
): TransferLinkBatchResult {
  const {
    maxDaysDelta = 3,
    minConfidence = 0.8,
    reviewThreshold = 0.5,
    now = () => new Date().toISOString(),
    idFactory = defaultIdFactory,
  } = options;

  const confirmed: TransferLink[] = [];
  const pendingReview: TransferLink[] = [];

  // IDs of transactions already assigned to a link (avoid double-pairing)
  const pairedIds = new Set<string>();

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]!;
    if (pairedIds.has(tx.id)) continue;

    // Candidates: different account, not yet paired
    const candidates = transactions.filter(
      (c) => c.accountId !== tx.accountId && !pairedIds.has(c.id),
    );

    // Use reviewThreshold as the effective minimum so we capture uncertain
    // matches in the same pass; we then bin by score below.
    const detection = detectTransfer(tx, candidates, {
      maxDaysDelta,
      minConfidence: reviewThreshold,
      reviewThreshold,
    });

    if (!detection.peerId) continue;

    const peer = transactions.find((c) => c.id === detection.peerId);
    if (!peer) continue;

    const [debitId, creditId] =
      tx.type === 'debit' ? [tx.id, detection.peerId] : [detection.peerId, tx.id];

    const linkOptions: TransferLinkOptions = { now, idFactory };

    if (detection.isTransfer && detection.confidence >= minConfidence) {
      // High-confidence confirmed match
      confirmed.push(
        createTransferLink(debitId, creditId, detection.confidence, detection.reason, 'confirmed', linkOptions),
      );
    } else if (detection.confidence >= reviewThreshold) {
      // Uncertain match — needs human review
      pendingReview.push(
        createTransferLink(debitId, creditId, detection.confidence, detection.reason, 'pending-review', linkOptions),
      );
    } else {
      continue;
    }

    pairedIds.add(tx.id);
    pairedIds.add(detection.peerId);
  }

  return { confirmed, pendingReview };
}
