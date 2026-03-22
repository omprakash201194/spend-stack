import { describe, it, expect, vi } from 'vitest';
import {
  createCategorizationRule,
  createRuleStore,
  addRuleToStore,
  removeRuleFromStore,
  updateRuleInStore,
  getRuleById,
  listRules,
  listActiveRules,
  deactivateRule,
  reorderRule,
} from './categorization-rule.js';
import type { CategorizationRule, CreateCategorizationRuleParams } from './categorization-rule.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuleParams(
  overrides: Partial<CreateCategorizationRuleParams> = {},
): CreateCategorizationRuleParams {
  return {
    name: 'Swiggy food delivery',
    conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' }],
    categoryId: 'cat-food',
    createdByUserId: 'user-1',
    ...overrides,
  };
}

function makeRule(overrides: Partial<CategorizationRule> = {}): CategorizationRule {
  return {
    id: 'rule-1',
    name: 'Swiggy food delivery',
    priority: 1,
    source: 'user',
    conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' }],
    matchMode: 'all',
    categoryId: 'cat-food',
    isActive: true,
    createdByUserId: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createCategorizationRule
// ---------------------------------------------------------------------------

describe('createCategorizationRule', () => {
  it('creates a rule with default values', () => {
    const rule = createCategorizationRule(makeRuleParams());
    expect(rule.priority).toBe(1);
    expect(rule.source).toBe('user');
    expect(rule.matchMode).toBe('all');
    expect(rule.isActive).toBe(true);
  });

  it('generates a stable ID when none is provided', () => {
    const rule = createCategorizationRule(makeRuleParams());
    expect(typeof rule.id).toBe('string');
    expect(rule.id.length).toBeGreaterThan(0);
  });

  it('uses the provided ID when given', () => {
    const rule = createCategorizationRule(makeRuleParams({ id: 'my-rule' }));
    expect(rule.id).toBe('my-rule');
  });

  it('generates unique IDs for successive calls', () => {
    const r1 = createCategorizationRule(makeRuleParams());
    const r2 = createCategorizationRule(makeRuleParams());
    expect(r1.id).not.toBe(r2.id);
  });

  it('applies provided priority', () => {
    const rule = createCategorizationRule(makeRuleParams({ priority: 50 }));
    expect(rule.priority).toBe(50);
  });

  it('applies provided source', () => {
    const rule = createCategorizationRule(makeRuleParams({ source: 'built-in' }));
    expect(rule.source).toBe('built-in');
  });

  it('applies provided matchMode', () => {
    const rule = createCategorizationRule(makeRuleParams({ matchMode: 'any' }));
    expect(rule.matchMode).toBe('any');
  });

  it('copies conditions exactly', () => {
    const conditions = [
      { field: 'amount' as const, operator: 'greaterThan' as const, value: 1000 },
    ];
    const rule = createCategorizationRule(makeRuleParams({ conditions }));
    expect(rule.conditions).toEqual(conditions);
  });

  it('sets createdAt and updatedAt to the same ISO timestamp', () => {
    const before = new Date().toISOString();
    const rule = createCategorizationRule(makeRuleParams());
    const after = new Date().toISOString();
    expect(rule.createdAt >= before).toBe(true);
    expect(rule.createdAt <= after).toBe(true);
    expect(rule.createdAt).toBe(rule.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// createRuleStore
// ---------------------------------------------------------------------------

describe('createRuleStore', () => {
  it('creates an empty store', () => {
    const store = createRuleStore();
    expect(Object.keys(store.rules)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addRuleToStore
// ---------------------------------------------------------------------------

describe('addRuleToStore', () => {
  it('adds a rule to an empty store', () => {
    const store = addRuleToStore(createRuleStore(), makeRule());
    expect(getRuleById(store, 'rule-1')).toBeDefined();
  });

  it('returns a new store without mutating the original', () => {
    const original = createRuleStore();
    const updated = addRuleToStore(original, makeRule());
    expect(Object.keys(original.rules)).toHaveLength(0);
    expect(Object.keys(updated.rules)).toHaveLength(1);
  });

  it('throws when a rule with the same ID already exists', () => {
    const store = addRuleToStore(createRuleStore(), makeRule());
    expect(() => addRuleToStore(store, makeRule())).toThrow('already exists');
  });

  it('supports multiple rules with different IDs', () => {
    let store = createRuleStore();
    store = addRuleToStore(store, makeRule({ id: 'r1' }));
    store = addRuleToStore(store, makeRule({ id: 'r2' }));
    expect(Object.keys(store.rules)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// removeRuleFromStore
// ---------------------------------------------------------------------------

describe('removeRuleFromStore', () => {
  it('removes an existing rule', () => {
    const store = addRuleToStore(createRuleStore(), makeRule());
    const updated = removeRuleFromStore(store, 'rule-1');
    expect(getRuleById(updated, 'rule-1')).toBeUndefined();
  });

  it('returns a new store without mutating the original', () => {
    const original = addRuleToStore(createRuleStore(), makeRule());
    removeRuleFromStore(original, 'rule-1');
    expect(getRuleById(original, 'rule-1')).toBeDefined();
  });

  it('throws when the rule does not exist', () => {
    expect(() => removeRuleFromStore(createRuleStore(), 'nonexistent')).toThrow('not found');
  });
});

// ---------------------------------------------------------------------------
// updateRuleInStore
// ---------------------------------------------------------------------------

describe('updateRuleInStore', () => {
  it('updates specified fields', () => {
    const store = addRuleToStore(createRuleStore(), makeRule());
    const updated = updateRuleInStore(store, 'rule-1', { categoryId: 'cat-groceries' });
    expect(getRuleById(updated, 'rule-1')?.categoryId).toBe('cat-groceries');
  });

  it('preserves unmodified fields', () => {
    const store = addRuleToStore(createRuleStore(), makeRule());
    const updated = updateRuleInStore(store, 'rule-1', { categoryId: 'cat-other' });
    const rule = getRuleById(updated, 'rule-1')!;
    expect(rule.name).toBe('Swiggy food delivery');
    expect(rule.priority).toBe(1);
    expect(rule.conditions).toHaveLength(1);
  });

  it('bumps updatedAt', () => {
    const store = addRuleToStore(createRuleStore(), makeRule());
    const before = new Date().toISOString();
    const updated = updateRuleInStore(store, 'rule-1', { priority: 10 });
    expect(getRuleById(updated, 'rule-1')?.updatedAt >= before).toBe(true);
  });

  it('returns a new store without mutating the original', () => {
    const original = addRuleToStore(createRuleStore(), makeRule({ categoryId: 'cat-food' }));
    updateRuleInStore(original, 'rule-1', { categoryId: 'cat-travel' });
    expect(getRuleById(original, 'rule-1')?.categoryId).toBe('cat-food');
  });

  it('throws when the rule does not exist', () => {
    expect(() =>
      updateRuleInStore(createRuleStore(), 'ghost-rule', { priority: 5 }),
    ).toThrow('not found');
  });

  it('can deactivate a rule via update', () => {
    const store = addRuleToStore(createRuleStore(), makeRule());
    const updated = updateRuleInStore(store, 'rule-1', { isActive: false });
    expect(getRuleById(updated, 'rule-1')?.isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRuleById
// ---------------------------------------------------------------------------

describe('getRuleById', () => {
  it('returns the rule when found', () => {
    const store = addRuleToStore(createRuleStore(), makeRule());
    expect(getRuleById(store, 'rule-1')?.id).toBe('rule-1');
  });

  it('returns undefined when not found', () => {
    expect(getRuleById(createRuleStore(), 'missing')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listRules
// ---------------------------------------------------------------------------

describe('listRules', () => {
  it('returns all rules sorted by ascending priority', () => {
    let store = createRuleStore();
    store = addRuleToStore(store, makeRule({ id: 'r3', priority: 30 }));
    store = addRuleToStore(store, makeRule({ id: 'r1', priority: 10 }));
    store = addRuleToStore(store, makeRule({ id: 'r2', priority: 20 }));
    const ids = listRules(store).map((r) => r.id);
    expect(ids).toEqual(['r1', 'r2', 'r3']);
  });

  it('returns an empty array for an empty store', () => {
    expect(listRules(createRuleStore())).toHaveLength(0);
  });

  it('includes both active and inactive rules', () => {
    let store = createRuleStore();
    store = addRuleToStore(store, makeRule({ id: 'r-active', isActive: true }));
    store = addRuleToStore(store, makeRule({ id: 'r-inactive', isActive: false }));
    expect(listRules(store)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// listActiveRules
// ---------------------------------------------------------------------------

describe('listActiveRules', () => {
  it('returns only active rules', () => {
    let store = createRuleStore();
    store = addRuleToStore(store, makeRule({ id: 'r-active', isActive: true, priority: 1 }));
    store = addRuleToStore(store, makeRule({ id: 'r-inactive', isActive: false, priority: 2 }));
    const active = listActiveRules(store);
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe('r-active');
  });

  it('returns rules sorted by ascending priority', () => {
    let store = createRuleStore();
    store = addRuleToStore(store, makeRule({ id: 'r5', isActive: true, priority: 50 }));
    store = addRuleToStore(store, makeRule({ id: 'r1', isActive: true, priority: 10 }));
    const ids = listActiveRules(store).map((r) => r.id);
    expect(ids).toEqual(['r1', 'r5']);
  });

  it('returns empty array when all rules are inactive', () => {
    let store = createRuleStore();
    store = addRuleToStore(store, makeRule({ id: 'r1', isActive: false }));
    expect(listActiveRules(store)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deactivateRule
// ---------------------------------------------------------------------------

describe('deactivateRule', () => {
  it('sets isActive to false', () => {
    const rule = makeRule({ isActive: true });
    expect(deactivateRule(rule).isActive).toBe(false);
  });

  it('bumps updatedAt', () => {
    const rule = makeRule();
    const before = new Date().toISOString();
    expect(deactivateRule(rule).updatedAt >= before).toBe(true);
  });

  it('does not mutate the original rule', () => {
    const rule = makeRule({ isActive: true });
    deactivateRule(rule);
    expect(rule.isActive).toBe(true);
  });

  it('preserves all other fields', () => {
    const rule = makeRule({ id: 'keep-id', name: 'keep-name', priority: 7 });
    const inactive = deactivateRule(rule);
    expect(inactive.id).toBe('keep-id');
    expect(inactive.name).toBe('keep-name');
    expect(inactive.priority).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// reorderRule
// ---------------------------------------------------------------------------

describe('reorderRule', () => {
  it('updates priority to the new value', () => {
    const rule = makeRule({ priority: 10 });
    expect(reorderRule(rule, 5).priority).toBe(5);
  });

  it('bumps updatedAt', () => {
    const rule = makeRule();
    const before = new Date().toISOString();
    expect(reorderRule(rule, 99).updatedAt >= before).toBe(true);
  });

  it('does not mutate the original rule', () => {
    const rule = makeRule({ priority: 10 });
    reorderRule(rule, 1);
    expect(rule.priority).toBe(10);
  });

  it('preserves all other fields', () => {
    const rule = makeRule({ id: 'keep-id', name: 'keep-name', isActive: true });
    const reordered = reorderRule(rule, 3);
    expect(reordered.id).toBe('keep-id');
    expect(reordered.name).toBe('keep-name');
    expect(reordered.isActive).toBe(true);
  });
});
