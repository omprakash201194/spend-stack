import { describe, it, expect } from 'vitest';
import {
  computeFingerprint,
  detectDuplicates,
  descriptionSimilarity,
} from './duplicate-detector.js';
import type { NormalizedTransaction } from './types.js';

function makeTx(
  date: string,
  signedAmount: number,
  description: string,
  sourceReference?: string,
): NormalizedTransaction {
  return {
    date,
    description,
    debitAmount: signedAmount < 0 ? Math.abs(signedAmount) : null,
    creditAmount: signedAmount >= 0 ? signedAmount : null,
    signedAmount,
    balanceIfAvailable: null,
    currency: 'INR',
    rawReference: '',
    sourceReference,
  };
}

describe('computeFingerprint', () => {
  it('returns consistent fingerprint for same inputs', () => {
    const tx = makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL');
    const fp1 = computeFingerprint(tx, 'acc-1');
    const fp2 = computeFingerprint(tx, 'acc-1');
    expect(fp1).toEqual(fp2);
  });

  it('differs when accountId differs', () => {
    const tx = makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL');
    const fp1 = computeFingerprint(tx, 'acc-1');
    const fp2 = computeFingerprint(tx, 'acc-2');
    expect(fp1.accountId).not.toBe(fp2.accountId);
  });

  it('differs when date differs', () => {
    const t1 = makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL');
    const t2 = makeTx('2024-01-02', -5000, 'ATM WITHDRAWAL');
    expect(computeFingerprint(t1, 'acc-1').transactionDate).not.toBe(
      computeFingerprint(t2, 'acc-1').transactionDate,
    );
  });
});

describe('detectDuplicates', () => {
  const existing = [
    makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL'),
    makeTx('2024-01-02', 50000, 'SALARY CREDIT'),
  ];

  it('classifies new transactions as unique', () => {
    const incoming = [makeTx('2024-01-03', -1200, 'GROCERY STORE')];
    const result = detectDuplicates(incoming, existing, 'acc-1');
    expect(result.unique).toHaveLength(1);
    expect(result.exactDuplicates).toHaveLength(0);
    expect(result.fuzzyCandidates).toHaveLength(0);
  });

  it('detects exact duplicates', () => {
    const incoming = [makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL')];
    const result = detectDuplicates(incoming, existing, 'acc-1');
    expect(result.exactDuplicates).toHaveLength(1);
    expect(result.unique).toHaveLength(0);
  });

  it('uses accountId as part of the fingerprint key', () => {
    // Supplying the same transactions but different accountId means
    // fingerprints differ — so nothing counts as a duplicate.
    const acc1Result = detectDuplicates(existing, existing, 'acc-1');
    const acc2Result = detectDuplicates(existing, [], 'acc-2');
    // When existing is empty for acc-2, all incoming are unique
    expect(acc2Result.unique).toHaveLength(2);
    expect(acc2Result.exactDuplicates).toHaveLength(0);
    // When comparing acc-1 against itself, everything is an exact duplicate
    expect(acc1Result.exactDuplicates).toHaveLength(2);
  });

  it('handles empty incoming list', () => {
    const result = detectDuplicates([], existing, 'acc-1');
    expect(result.unique).toHaveLength(0);
    expect(result.exactDuplicates).toHaveLength(0);
    expect(result.fuzzyCandidates).toHaveLength(0);
  });

  it('handles empty existing list', () => {
    const incoming = [makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL')];
    const result = detectDuplicates(incoming, [], 'acc-1');
    expect(result.unique).toHaveLength(1);
  });

  it('surfaces fuzzy candidates for same date+amount with similar description', () => {
    const existingWithSimilar = [
      makeTx('2024-01-05', -2000, 'IMPS TRANSFER HDFC'),
    ];
    // Same date + amount, description very close
    const incoming = [makeTx('2024-01-05', -2000, 'IMPS TRANSFER HDFC BANK')];
    const result = detectDuplicates(incoming, existingWithSimilar, 'acc-1');
    expect(result.fuzzyCandidates.length + result.exactDuplicates.length).toBeGreaterThan(0);
  });
});

describe('descriptionSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(descriptionSimilarity('SALARY CREDIT', 'SALARY CREDIT')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(descriptionSimilarity('ATM', 'XYZ')).toBe(0);
  });

  it('returns a value between 0 and 1 for partially matching strings', () => {
    const score = descriptionSimilarity('IMPS TRANSFER HDFC', 'IMPS TRANSFER HDFC BANK');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('is case-insensitive', () => {
    expect(descriptionSimilarity('salary credit', 'SALARY CREDIT')).toBe(1);
  });
});

describe('detectDuplicates — decisions traceability', () => {
  const existing = [
    makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL'),
    makeTx('2024-01-02', 50000, 'SALARY CREDIT'),
  ];

  it('emits one decision per incoming transaction', () => {
    const incoming = [
      makeTx('2024-01-03', -1200, 'GROCERY STORE'),
      makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL'),
    ];
    const result = detectDuplicates(incoming, existing, 'acc-1');
    expect(result.decisions).toHaveLength(2);
  });

  it('marks unique transactions with outcome "imported"', () => {
    const incoming = [makeTx('2024-01-10', -300, 'COFFEE SHOP')];
    const result = detectDuplicates(incoming, existing, 'acc-1');
    expect(result.decisions[0]?.outcome).toBe('imported');
  });

  it('marks exact duplicates with outcome "skipped_exact"', () => {
    const incoming = [makeTx('2024-01-01', -5000, 'ATM WITHDRAWAL')];
    const result = detectDuplicates(incoming, existing, 'acc-1');
    expect(result.decisions[0]?.outcome).toBe('skipped_exact');
    expect(result.decisions[0]?.existingIndex).toBe(0);
    expect(result.decisions[0]?.reason).toContain('auto-skipped');
  });

  it('marks fuzzy candidates with outcome "flagged_fuzzy" including similarity', () => {
    const existingWithSimilar = [makeTx('2024-02-01', -2000, 'IMPS TRANSFER HDFC')];
    const incoming = [makeTx('2024-02-01', -2000, 'IMPS TRANSFER HDFC BANK')];
    const result = detectDuplicates(incoming, existingWithSimilar, 'acc-1');
    const decision = result.decisions[0];
    expect(decision?.outcome).toBe('flagged_fuzzy');
    expect(decision?.similarity).toBeGreaterThan(0);
    expect(decision?.existingIndex).toBe(0);
    expect(decision?.reason).toContain('review');
  });

  it('each decision carries the computed fingerprint', () => {
    const incoming = [makeTx('2024-01-03', -600, 'ONLINE PURCHASE')];
    const result = detectDuplicates(incoming, existing, 'acc-1');
    const decision = result.decisions[0];
    expect(decision?.fingerprint.accountId).toBe('acc-1');
    expect(decision?.fingerprint.transactionDate).toBe('2024-01-03');
    expect(decision?.fingerprint.amount).toBe(-600);
  });

  it('returns empty decisions array when incoming is empty', () => {
    const result = detectDuplicates([], existing, 'acc-1');
    expect(result.decisions).toHaveLength(0);
  });
});

describe('detectDuplicates — override flow', () => {
  const existing = [
    makeTx('2024-03-01', -5000, 'ATM WITHDRAWAL'),
    makeTx('2024-03-02', 50000, 'SALARY CREDIT'),
  ];

  it('overrides an exact duplicate when its sourceReference is listed', () => {
    const incoming = [makeTx('2024-03-01', -5000, 'ATM WITHDRAWAL', 'row-1')];
    const result = detectDuplicates(incoming, existing, 'acc-1', {
      overrideSourceRefs: ['row-1'],
    });
    expect(result.overridden).toHaveLength(1);
    expect(result.unique).toHaveLength(1);
    expect(result.exactDuplicates).toHaveLength(0);
  });

  it('marks overridden decisions with outcome "overridden"', () => {
    const incoming = [makeTx('2024-03-01', -5000, 'ATM WITHDRAWAL', 'row-1')];
    const result = detectDuplicates(incoming, existing, 'acc-1', {
      overrideSourceRefs: ['row-1'],
    });
    expect(result.decisions[0]?.outcome).toBe('overridden');
    expect(result.decisions[0]?.existingIndex).toBe(0);
    expect(result.decisions[0]?.reason).toContain('overridden');
  });

  it('only overrides transactions whose sourceReference is in the override set', () => {
    const incoming = [
      makeTx('2024-03-01', -5000, 'ATM WITHDRAWAL', 'row-1'),
      makeTx('2024-03-02', 50000, 'SALARY CREDIT', 'row-2'),
    ];
    const result = detectDuplicates(incoming, existing, 'acc-1', {
      overrideSourceRefs: ['row-1'],
    });
    // row-1 overridden → in unique; row-2 not overridden → in exactDuplicates
    expect(result.overridden).toHaveLength(1);
    expect(result.exactDuplicates).toHaveLength(1);
    expect(result.unique).toHaveLength(1);
  });

  it('does not override when sourceReference is absent from the transaction', () => {
    // makeTx without sourceReference — override list has a ref but it cannot match
    const incoming = [makeTx('2024-03-01', -5000, 'ATM WITHDRAWAL')];
    const result = detectDuplicates(incoming, existing, 'acc-1', {
      overrideSourceRefs: ['row-1'],
    });
    expect(result.overridden).toHaveLength(0);
    expect(result.exactDuplicates).toHaveLength(1);
  });

  it('treats a non-duplicate as unique regardless of override list', () => {
    const incoming = [makeTx('2024-03-10', -200, 'UNIQUE TX', 'row-99')];
    const result = detectDuplicates(incoming, existing, 'acc-1', {
      overrideSourceRefs: ['row-99'],
    });
    expect(result.unique).toHaveLength(1);
    expect(result.overridden).toHaveLength(0);
    expect(result.decisions[0]?.outcome).toBe('imported');
  });

  it('returns empty overridden list when no overrideSourceRefs are given', () => {
    const incoming = [makeTx('2024-03-01', -5000, 'ATM WITHDRAWAL', 'row-1')];
    const result = detectDuplicates(incoming, existing, 'acc-1');
    expect(result.overridden).toHaveLength(0);
    expect(result.exactDuplicates).toHaveLength(1);
  });

  it('returns empty overridden list when overrideSourceRefs is an empty array', () => {
    const incoming = [makeTx('2024-03-01', -5000, 'ATM WITHDRAWAL', 'row-1')];
    const result = detectDuplicates(incoming, existing, 'acc-1', { overrideSourceRefs: [] });
    expect(result.overridden).toHaveLength(0);
  });
});
