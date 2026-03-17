import { describe, it, expect } from 'vitest';
import { evaluateCondition, applyCategorizationRules, sortRules, categorizeBatch } from './categorization.js';
import type { Transaction, CategorizationRule } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    rawRowId: 'row-1',
    accountId: 'acc-1',
    date: '2024-01-15',
    description: 'UPI Payment Swiggy',
    normalizedDescription: 'UPI PAYMENT SWIGGY',
    amount: 450,
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

function makeRule(overrides: Partial<CategorizationRule> = {}): CategorizationRule {
  return {
    id: 'rule-1',
    priority: 10,
    source: 'built-in',
    conditions: [],
    matchMode: 'all',
    categoryId: 'cat-food',
    isActive: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  it('equals — matches string field', () => {
    expect(evaluateCondition(makeTx(), { field: 'type', operator: 'equals', value: 'debit' })).toBe(true);
    expect(evaluateCondition(makeTx(), { field: 'type', operator: 'equals', value: 'credit' })).toBe(false);
  });

  it('equals — matches numeric amount', () => {
    expect(evaluateCondition(makeTx({ amount: 100 }), { field: 'amount', operator: 'equals', value: 100 })).toBe(true);
    expect(evaluateCondition(makeTx({ amount: 100 }), { field: 'amount', operator: 'equals', value: 200 })).toBe(false);
  });

  it('contains — matches substring in description', () => {
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' })).toBe(true);
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'contains', value: 'ZOMATO' })).toBe(false);
  });

  it('startsWith — matches start of normalized description', () => {
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'startsWith', value: 'UPI' })).toBe(true);
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'startsWith', value: 'NEFT' })).toBe(false);
  });

  it('endsWith — matches end of normalized description', () => {
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'endsWith', value: 'SWIGGY' })).toBe(true);
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'endsWith', value: 'ZOMATO' })).toBe(false);
  });

  it('greaterThan — numeric comparison', () => {
    expect(evaluateCondition(makeTx({ amount: 500 }), { field: 'amount', operator: 'greaterThan', value: 400 })).toBe(true);
    expect(evaluateCondition(makeTx({ amount: 300 }), { field: 'amount', operator: 'greaterThan', value: 400 })).toBe(false);
  });

  it('lessThan — numeric comparison', () => {
    expect(evaluateCondition(makeTx({ amount: 300 }), { field: 'amount', operator: 'lessThan', value: 400 })).toBe(true);
    expect(evaluateCondition(makeTx({ amount: 500 }), { field: 'amount', operator: 'lessThan', value: 400 })).toBe(false);
  });

  it('regex — matches pattern in description', () => {
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'regex', value: '^UPI.*SWIGGY$' })).toBe(true);
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'regex', value: '^NEFT' })).toBe(false);
  });

  it('regex — returns false for invalid regex', () => {
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'regex', value: '[invalid' })).toBe(false);
  });

  it('returns false when operator type mismatches field type (greaterThan on string)', () => {
    expect(evaluateCondition(makeTx(), { field: 'normalizedDescription', operator: 'greaterThan', value: 100 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyCategorizationRules
// ---------------------------------------------------------------------------

describe('applyCategorizationRules', () => {
  it('returns "transfer" source for transfer transactions, skipping rules', () => {
    const tx = makeTx({ isTransfer: true });
    const rule = makeRule({
      conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'UPI' }],
    });
    const result = applyCategorizationRules(tx, [rule]);
    expect(result.source).toBe('transfer');
    expect(result.matchedRule).toBeUndefined();
  });

  it('returns "uncategorized" when no rules match', () => {
    const result = applyCategorizationRules(makeTx(), []);
    expect(result.source).toBe('uncategorized');
    expect(result.categoryId).toBeUndefined();
    expect(result.matchedRule).toBeUndefined();
  });

  it('matches the first active rule that fires', () => {
    const rule = makeRule({
      id: 'rule-swiggy',
      conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' }],
      categoryId: 'cat-food',
    });
    const result = applyCategorizationRules(makeTx(), [rule]);
    expect(result.categoryId).toBe('cat-food');
    expect(result.matchedRule?.id).toBe('rule-swiggy');
    expect(result.source).toBe('built-in');
  });

  it('sets source to "user-rule" for user-origin rules', () => {
    const rule = makeRule({
      source: 'user',
      conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' }],
    });
    const result = applyCategorizationRules(makeTx(), [rule]);
    expect(result.source).toBe('user-rule');
  });

  it('skips inactive rules', () => {
    const inactiveRule = makeRule({
      id: 'rule-inactive',
      isActive: false,
      conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' }],
      categoryId: 'cat-food',
    });
    const result = applyCategorizationRules(makeTx(), [inactiveRule]);
    expect(result.source).toBe('uncategorized');
  });

  it('skips rules with empty conditions', () => {
    const rule = makeRule({ conditions: [] });
    const result = applyCategorizationRules(makeTx(), [rule]);
    expect(result.source).toBe('uncategorized');
  });

  it('matchMode "any" fires when at least one condition matches', () => {
    const rule = makeRule({
      matchMode: 'any',
      conditions: [
        { field: 'normalizedDescription', operator: 'contains', value: 'ZOMATO' },
        { field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' },
      ],
      categoryId: 'cat-food',
    });
    const result = applyCategorizationRules(makeTx(), [rule]);
    expect(result.categoryId).toBe('cat-food');
  });

  it('matchMode "all" requires all conditions to match', () => {
    const rule = makeRule({
      matchMode: 'all',
      conditions: [
        { field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' },
        { field: 'type', operator: 'equals', value: 'credit' }, // won't match debit tx
      ],
      categoryId: 'cat-food',
    });
    const result = applyCategorizationRules(makeTx(), [rule]);
    expect(result.source).toBe('uncategorized');
  });

  it('includes the matched rule in the result', () => {
    const rule = makeRule({
      id: 'r1',
      conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'UPI' }],
    });
    const result = applyCategorizationRules(makeTx(), [rule]);
    expect(result.matchedRule).toEqual(rule);
  });

  it('result always contains a non-empty reason string', () => {
    const result = applyCategorizationRules(makeTx(), []);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// sortRules
// ---------------------------------------------------------------------------

describe('sortRules', () => {
  it('sorts rules by ascending priority', () => {
    const rules = [
      makeRule({ id: 'r3', priority: 30 }),
      makeRule({ id: 'r1', priority: 10 }),
      makeRule({ id: 'r2', priority: 20 }),
    ];
    const sorted = sortRules(rules);
    expect(sorted.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('does not mutate the original array', () => {
    const rules = [makeRule({ id: 'r2', priority: 20 }), makeRule({ id: 'r1', priority: 10 })];
    sortRules(rules);
    expect(rules[0]?.id).toBe('r2');
  });
});

// ---------------------------------------------------------------------------
// categorizeBatch
// ---------------------------------------------------------------------------

describe('categorizeBatch', () => {
  it('categorizes a batch of transactions using sorted rules', () => {
    const txs = [
      makeTx({ id: 'tx-1', normalizedDescription: 'UPI PAYMENT SWIGGY' }),
      makeTx({ id: 'tx-2', normalizedDescription: 'NEFT CREDIT SALARY' }),
    ];
    const rules: CategorizationRule[] = [
      makeRule({ id: 'r-food', priority: 10, conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' }], categoryId: 'cat-food' }),
      makeRule({ id: 'r-salary', priority: 20, conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'SALARY' }], categoryId: 'cat-salary' }),
    ];
    const result = categorizeBatch(txs, rules);
    expect(result.find((t) => t.id === 'tx-1')?.categoryId).toBe('cat-food');
    expect(result.find((t) => t.id === 'tx-2')?.categoryId).toBe('cat-salary');
  });

  it('does not re-categorize manually-categorized transactions', () => {
    const tx = makeTx({
      id: 'tx-manual',
      categorizationSource: 'manual',
      categoryId: 'cat-manual',
    });
    const rule = makeRule({
      conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'UPI' }],
      categoryId: 'cat-other',
    });
    const [result] = categorizeBatch([tx], [rule]);
    expect(result?.categoryId).toBe('cat-manual');
    expect(result?.categorizationSource).toBe('manual');
  });

  it('returns input transactions unchanged when no rules match', () => {
    const tx = makeTx({ normalizedDescription: 'UNKNOWN MERCHANT' });
    const [result] = categorizeBatch([tx], []);
    expect(result?.categorizationSource).toBe('uncategorized');
  });
});
