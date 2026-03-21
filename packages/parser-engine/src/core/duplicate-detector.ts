/**
 * Duplicate transaction detection for the SpendStack import pipeline.
 *
 * The fingerprint strategy follows the technical specification:
 *   account_id + transaction_date + signed_amount + normalized_description_hash
 *
 * Exact fingerprint matches are auto-skipped.
 * Near-matches (same date + amount, slightly different description) are
 * surfaced as fuzzy candidates for user review.
 */

import type { NormalizedTransaction } from './types.js';
import { normalizeDescription, hashDescription } from './normalization.js';

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

export interface DuplicateFingerprint {
  accountId: string;
  transactionDate: string;
  /** Absolute signed amount used as the amount key. */
  amount: number;
  normalizedDescriptionHash: string;
}

/**
 * Computes the duplicate-detection fingerprint for a normalized transaction.
 */
export function computeFingerprint(
  tx: NormalizedTransaction,
  accountId: string,
): DuplicateFingerprint {
  return {
    accountId,
    transactionDate: tx.date,
    amount: tx.signedAmount,
    normalizedDescriptionHash: hashDescription(normalizeDescription(tx.description)),
  };
}

function fingerprintKey(fp: DuplicateFingerprint): string {
  return `${fp.accountId}|${fp.transactionDate}|${fp.amount}|${fp.normalizedDescriptionHash}`;
}

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

export interface ExactDuplicate {
  incoming: NormalizedTransaction;
  /** Index in the existing transactions array. */
  existingIndex: number;
}

export interface FuzzyCandidate {
  incoming: NormalizedTransaction;
  existingIndex: number;
  /** Similarity score in the range [0, 1]. */
  similarity: number;
}

/**
 * The outcome of a duplicate-detection decision for a single incoming
 * transaction.  Stored in `DuplicateDecision.outcome` to make every
 * import decision inspectable.
 *
 * - `'imported'`      — No duplicate found; transaction will be imported.
 * - `'skipped_exact'` — Exact fingerprint match; auto-skipped.
 * - `'flagged_fuzzy'` — Partial match; surfaced to the user for review.
 * - `'overridden'`    — Was an exact duplicate but the user forced import.
 */
export type DuplicateDecisionOutcome =
  | 'imported'
  | 'skipped_exact'
  | 'flagged_fuzzy'
  | 'overridden';

/**
 * A single traceable record describing why an incoming transaction was
 * classified as it was during duplicate detection.
 */
export interface DuplicateDecision {
  /** The incoming transaction this decision applies to. */
  incoming: NormalizedTransaction;
  /** Outcome classification for this transaction. */
  outcome: DuplicateDecisionOutcome;
  /** Fingerprint computed for this transaction. */
  fingerprint: DuplicateFingerprint;
  /**
   * Index of the matching transaction in the existing set, when a match
   * was found (present for `skipped_exact`, `flagged_fuzzy`, `overridden`).
   */
  existingIndex?: number;
  /**
   * Description similarity score in [0, 1] — only present for
   * `flagged_fuzzy` decisions.
   */
  similarity?: number;
  /** Human-readable explanation of the decision. */
  reason: string;
}

/**
 * Options accepted by `detectDuplicates()`.
 */
export interface DuplicateDetectionOptions {
  /**
   * `NormalizedTransaction.sourceReference` values for exact-duplicate
   * transactions that the user has explicitly chosen to import anyway.
   * These are reclassified as `overridden` and included in `unique`.
   */
  overrideSourceRefs?: string[];
}

export interface DuplicateDetectionResult {
  /** Transactions that have no match in the existing set. */
  unique: NormalizedTransaction[];
  /** Transactions that are exact fingerprint matches — auto-skippable. */
  exactDuplicates: ExactDuplicate[];
  /** Transactions that partially match — surface to user for review. */
  fuzzyCandidates: FuzzyCandidate[];
  /**
   * Transactions that were exact duplicates but the user explicitly chose
   * to import anyway (via `overrideSourceRefs`).  These are also included
   * in `unique` so they flow through the rest of the pipeline.
   *
   * Optional so that downstream code constructing `DuplicateDetectionResult`
   * objects directly (e.g. mocks or early-return stubs) does not break when
   * the field is absent.
   */
  overridden?: NormalizedTransaction[];
  /**
   * One decision record per incoming transaction, preserving the full
   * reasoning behind each classification.  Use this for audit trails,
   * user-facing summaries, and debugging.
   *
   * Optional so that downstream code constructing `DuplicateDetectionResult`
   * objects directly (e.g. mocks or early-return stubs) does not break when
   * the field is absent.
   */
  decisions?: DuplicateDecision[];
}

// ---------------------------------------------------------------------------
// Fuzzy similarity
// ---------------------------------------------------------------------------

/**
 * Returns a simple similarity score between two description strings in [0,1].
 *
 * The metric is based on the proportion of shared 3-character n-grams (trigrams)
 * relative to the union of all trigrams from both strings.  This is a fast and
 * reasonable approximation of semantic similarity for short bank descriptions.
 */
export function descriptionSimilarity(a: string, b: string): number {
  const normA = normalizeDescription(a);
  const normB = normalizeDescription(b);
  if (normA === normB) return 1;

  const trigramsA = trigrams(normA);
  const trigramsB = trigrams(normB);

  if (trigramsA.size === 0 && trigramsB.size === 0) return 1;
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;

  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection += 1;
  }

  const union = trigramsA.size + trigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function trigrams(str: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + 3 <= str.length; i++) {
    set.add(str.slice(i, i + 3));
  }
  return set;
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/** Minimum description similarity to surface a transaction as a fuzzy candidate. */
const FUZZY_SIMILARITY_THRESHOLD = 0.5;

/**
 * Compares incoming transactions against existing ones and classifies each as
 * unique, an exact duplicate, a fuzzy candidate, or an override.
 *
 * @param incoming    Transactions being imported.
 * @param existing    Transactions already stored for this account.
 * @param accountId   Account identifier used in fingerprint computation.
 * @param options     Optional settings (e.g. source refs to override).
 */
export function detectDuplicates(
  incoming: NormalizedTransaction[],
  existing: NormalizedTransaction[],
  accountId: string,
  options?: DuplicateDetectionOptions,
): DuplicateDetectionResult {
  const overrideSet = new Set(options?.overrideSourceRefs ?? []);

  // Build a lookup map of existing fingerprints
  const existingKeys = new Map<string, number>();
  for (let i = 0; i < existing.length; i++) {
    const fp = computeFingerprint(existing[i]!, accountId);
    existingKeys.set(fingerprintKey(fp), i);
  }

  const unique: NormalizedTransaction[] = [];
  const exactDuplicates: ExactDuplicate[] = [];
  const fuzzyCandidates: FuzzyCandidate[] = [];
  const overridden: NormalizedTransaction[] = [];
  const decisions: DuplicateDecision[] = [];

  for (const tx of incoming) {
    const fp = computeFingerprint(tx, accountId);
    const key = fingerprintKey(fp);

    if (existingKeys.has(key)) {
      const existingIndex = existingKeys.get(key)!;
      const isOverridden = tx.sourceReference != null && overrideSet.has(tx.sourceReference);

      if (isOverridden) {
        // User has explicitly requested this duplicate to be imported.
        overridden.push(tx);
        unique.push(tx);
        decisions.push({
          incoming: tx,
          outcome: 'overridden',
          fingerprint: fp,
          existingIndex,
          reason: 'Exact duplicate overridden by user: transaction will be imported.',
        });
      } else {
        exactDuplicates.push({ incoming: tx, existingIndex });
        decisions.push({
          incoming: tx,
          outcome: 'skipped_exact',
          fingerprint: fp,
          existingIndex,
          reason: 'Exact fingerprint match with an existing transaction: auto-skipped.',
        });
      }
      continue;
    }

    // Check for fuzzy matches: same date + amount, but different description
    let bestSimilarity = 0;
    let bestIndex = -1;
    for (let i = 0; i < existing.length; i++) {
      const ex = existing[i]!;
      if (ex.date !== tx.date || ex.signedAmount !== tx.signedAmount) continue;
      const sim = descriptionSimilarity(tx.description, ex.description);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestIndex = i;
      }
    }

    if (bestSimilarity >= FUZZY_SIMILARITY_THRESHOLD && bestIndex !== -1) {
      fuzzyCandidates.push({ incoming: tx, existingIndex: bestIndex, similarity: bestSimilarity });
      decisions.push({
        incoming: tx,
        outcome: 'flagged_fuzzy',
        fingerprint: fp,
        existingIndex: bestIndex,
        similarity: bestSimilarity,
        reason: `Partial match (similarity ${bestSimilarity.toFixed(2)}): flagged for user review.`,
      });
    } else {
      unique.push(tx);
      decisions.push({
        incoming: tx,
        outcome: 'imported',
        fingerprint: fp,
        reason: 'No duplicate found: transaction will be imported.',
      });
    }
  }

  return { unique, exactDuplicates, fuzzyCandidates, overridden, decisions };
}
