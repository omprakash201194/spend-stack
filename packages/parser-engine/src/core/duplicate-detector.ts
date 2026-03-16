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

export interface DuplicateDetectionResult {
  /** Transactions that have no match in the existing set. */
  unique: NormalizedTransaction[];
  /** Transactions that are exact fingerprint matches — auto-skippable. */
  exactDuplicates: ExactDuplicate[];
  /** Transactions that partially match — surface to user for review. */
  fuzzyCandidates: FuzzyCandidate[];
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
 * unique, an exact duplicate, or a fuzzy candidate.
 *
 * @param incoming    Transactions being imported.
 * @param existing    Transactions already stored for this account.
 * @param accountId   Account identifier used in fingerprint computation.
 */
export function detectDuplicates(
  incoming: NormalizedTransaction[],
  existing: NormalizedTransaction[],
  accountId: string,
): DuplicateDetectionResult {
  // Build a lookup map of existing fingerprints
  const existingKeys = new Map<string, number>();
  for (let i = 0; i < existing.length; i++) {
    const fp = computeFingerprint(existing[i]!, accountId);
    existingKeys.set(fingerprintKey(fp), i);
  }

  const unique: NormalizedTransaction[] = [];
  const exactDuplicates: ExactDuplicate[] = [];
  const fuzzyCandidates: FuzzyCandidate[] = [];

  for (const tx of incoming) {
    const fp = computeFingerprint(tx, accountId);
    const key = fingerprintKey(fp);

    if (existingKeys.has(key)) {
      exactDuplicates.push({ incoming: tx, existingIndex: existingKeys.get(key)! });
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
    } else {
      unique.push(tx);
    }
  }

  return { unique, exactDuplicates, fuzzyCandidates };
}
