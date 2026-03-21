/**
 * Own-account transfer detection.
 *
 * Uses deterministic, explainable heuristics to identify transactions that
 * represent a transfer of funds between a user's own accounts, so that they
 * can be excluded from spending analytics and labelled correctly.
 *
 * Design principles:
 * - Favor explainability over opaque scoring
 * - Every decision records a human-readable `reason`
 * - The caller decides what to do with the result; this module only classifies
 */

import type { Transaction, TransferDetectionResult } from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TransferDetectorOptions {
  /**
   * Maximum number of calendar days between a debit and a candidate credit
   * for them to be considered a matching pair.
   * Defaults to `3`.
   */
  maxDaysDelta?: number;
  /**
   * Minimum confidence score required to declare a confirmed match.
   * Defaults to `0.8`.
   */
  minConfidence?: number;
  /**
   * Minimum confidence score below which candidates are silently ignored
   * (not even surfaced for review).  Must be ≤ `minConfidence`.
   * Candidates scoring at or above this value but below `minConfidence` are
   * returned with `isTransfer: false` but with `peerId` populated so that
   * callers can route them to the review queue.
   * Defaults to `0.5`.
   */
  reviewThreshold?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TRANSFER_KEYWORDS = [
  'NEFT',
  'RTGS',
  'IMPS',
  'UPI',
  'TRANSFER',
  'TRF',
  'SELF',
  'OWN ACCOUNT',
  'INTER BANK',
  'FUND TRANSFER',
];

/**
 * Returns `true` if the description contains one or more transfer-indicating
 * keywords (case-insensitive match on the normalized description).
 */
function hasTransferKeyword(normalizedDesc: string): boolean {
  return TRANSFER_KEYWORDS.some((kw) => normalizedDesc.includes(kw));
}

/**
 * Parses an ISO date string and returns a UTC midnight timestamp in ms.
 */
function toDateMs(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getTime();
}

/**
 * Returns the absolute difference in calendar days between two ISO date
 * strings.
 */
function daysDelta(dateA: string, dateB: string): number {
  const msPerDay = 86_400_000;
  return Math.abs(toDateMs(dateA) - toDateMs(dateB)) / msPerDay;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluates a single transaction against a pool of candidate transactions
 * from other accounts owned by the same user to determine whether it is a
 * likely own-account transfer.
 *
 * A match requires:
 *  1. The candidate is in the **opposite direction** (debit ↔ credit)
 *  2. The candidate amounts are **equal**
 *  3. The dates are within `maxDaysDelta` calendar days
 *
 * Confidence is boosted when transfer keywords appear in descriptions.
 *
 * @param transaction  The transaction to evaluate.
 * @param candidates   Transactions from other accounts belonging to the same
 *                     user/workspace. Must not include transactions from the
 *                     same account as `transaction`.
 * @param options      Tuning parameters.
 */
export function detectTransfer(
  transaction: Transaction,
  candidates: Transaction[],
  options: TransferDetectorOptions = {},
): TransferDetectionResult {
  const { maxDaysDelta = 3, minConfidence = 0.8, reviewThreshold = 0.5 } = options;

  let bestMatch: Transaction | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    // Must be opposite direction
    if (candidate.type === transaction.type) continue;
    // Must have the same amount
    if (candidate.amount !== transaction.amount) continue;
    // Must be within the date window
    const delta = daysDelta(transaction.date, candidate.date);
    if (delta > maxDaysDelta) continue;

    // Base score: same amount + opposite direction
    let score = 0.6;

    // Closer dates increase confidence
    if (delta === 0) {
      score += 0.25;
    } else if (delta <= 1) {
      score += 0.15;
    } else {
      score += 0.05;
    }

    // Transfer keywords in either description add confidence
    if (
      hasTransferKeyword(transaction.normalizedDescription) ||
      hasTransferKeyword(candidate.normalizedDescription)
    ) {
      score += 0.15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // No candidate reached even the review threshold — no match at all
  if (bestMatch === undefined || bestScore < reviewThreshold) {
    return {
      isTransfer: false,
      confidence: bestScore,
      reason:
        bestMatch === undefined
          ? 'No candidate transaction matched amount and direction'
          : `Best candidate score ${bestScore.toFixed(2)} is below review threshold ${reviewThreshold}`,
    };
  }

  // Candidate reached the review threshold but not the confidence threshold —
  // surface it as an uncertain match so the caller can route it for review.
  if (bestScore < minConfidence) {
    return {
      isTransfer: false,
      confidence: bestScore,
      peerId: bestMatch.id,
      reason: `Uncertain match: candidate ${bestMatch.id} scored ${bestScore.toFixed(2)}, below minimum confidence ${minConfidence}; recommend review`,
    };
  }

  const reasons: string[] = [
    `Matched candidate ${bestMatch.id} (account ${bestMatch.accountId})`,
    `amounts equal (${transaction.amount})`,
    `directions opposite (${transaction.type} ↔ ${bestMatch.type})`,
    `date delta ${daysDelta(transaction.date, bestMatch.date)} day(s)`,
  ];

  if (
    hasTransferKeyword(transaction.normalizedDescription) ||
    hasTransferKeyword(bestMatch.normalizedDescription)
  ) {
    reasons.push('transfer keyword present in description');
  }

  return {
    isTransfer: true,
    confidence: Math.min(bestScore, 1),
    peerId: bestMatch.id,
    reason: reasons.join('; '),
  };
}

/**
 * Applies transfer detection to all transactions in a batch, updating each
 * matched pair in-place and returning the mutated array.
 *
 * Each transaction is matched against all transactions from *different*
 * accounts in the same batch.  Already-matched transactions are skipped to
 * avoid duplicate pairing.
 *
 * @returns A new array of transactions with `isTransfer` and
 *          `transferPeerId` populated where matches were found.
 */
export function detectTransfersBatch(
  transactions: Transaction[],
  options: TransferDetectorOptions = {},
): Transaction[] {
  // Clone to avoid mutating input
  const result: Transaction[] = transactions.map((tx) => ({ ...tx }));
  const matchedIds = new Set<string>();

  for (let i = 0; i < result.length; i++) {
    const tx = result[i]!;
    if (matchedIds.has(tx.id)) continue;

    // Candidates: different account, not already matched
    const candidates = result.filter(
      (c) => c.accountId !== tx.accountId && !matchedIds.has(c.id),
    );

    const detection = detectTransfer(tx, candidates, options);

    if (detection.isTransfer && detection.peerId !== undefined) {
      // Update the current transaction
      result[i] = {
        ...tx,
        isTransfer: true,
        transferPeerId: detection.peerId,
        categorizationSource: 'transfer',
        updatedAt: new Date().toISOString(),
      };

      // Update the peer transaction
      const peerIdx = result.findIndex((c) => c.id === detection.peerId);
      if (peerIdx !== -1) {
        result[peerIdx] = {
          ...result[peerIdx]!,
          isTransfer: true,
          transferPeerId: tx.id,
          categorizationSource: 'transfer',
          updatedAt: new Date().toISOString(),
        };
        matchedIds.add(detection.peerId);
      }

      matchedIds.add(tx.id);
    }
  }

  return result;
}
