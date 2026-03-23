/**
 * Categorization rule management for SpendStack.
 *
 * Provides the domain model and CRUD helpers for managing the ordered set of
 * categorization rules that map transactions to categories.
 *
 * Rules are evaluated in ascending priority order (lower number = higher
 * precedence). User-defined rules start at priority 1; built-in rules
 * typically start at 1000, ensuring user rules always take precedence.
 *
 * All mutation helpers return new objects — inputs are never mutated.
 * ID generation, clock injection, and persistence are the caller's
 * responsibility.
 */

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (const value of buffer) {
    out += value.toString(16).padStart(2, '0');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Opaque identifier for a categorization rule. */
export type CategorizationRuleId = string;

/** Fields on a transaction that a rule condition can match against. */
export type RuleConditionField =
  | 'normalizedDescription'
  | 'description'
  | 'amount'
  | 'type';

/** Comparison operators supported by rule conditions. */
export type RuleConditionOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'regex';

/** A single predicate within a categorization rule. */
export interface RuleCondition {
  /** Transaction field to test. */
  field: RuleConditionField;
  /** Comparison operator. */
  operator: RuleConditionOperator;
  /** Value to compare against — string for text operators, number for numeric operators. */
  value: string | number;
}

/** Whether all conditions must pass, or just one. */
export type RuleMatchMode = 'all' | 'any';

/** Origin of a categorization rule. */
export type RuleSource = 'user' | 'built-in';

/**
 * A deterministic categorization rule that maps matching transactions to a
 * category.
 *
 * Rules are evaluated in ascending priority order (lower number = higher
 * precedence).  Rules with the same priority are evaluated in insertion order.
 */
export interface CategorizationRule {
  /** Stable unique identifier. */
  id: CategorizationRuleId;
  /**
   * Human-readable label displayed in the rules management UI.
   * Examples: "Swiggy / food delivery", "Salary credit".
   */
  name: string;
  /**
   * Evaluation precedence. Lower number wins (e.g. priority 1 is evaluated
   * before priority 1000). User rules start at 1; built-in rules at 1000.
   */
  priority: number;
  /** Who authored the rule. */
  source: RuleSource;
  /** Predicates that must be satisfied for the rule to fire. */
  conditions: RuleCondition[];
  /**
   * Whether all conditions must match (`"all"`) or just one (`"any"`).
   * Defaults to `"all"`.
   */
  matchMode: RuleMatchMode;
  /** ID of the category to assign when this rule fires. */
  categoryId: string;
  /**
   * Whether the rule participates in evaluation.
   * Inactive rules are stored but skipped during categorization.
   */
  isActive: boolean;
  /** ID of the user who created the rule, or `'system'` for built-in rules. */
  createdByUserId: string;
  /** ISO 8601 UTC timestamp when the rule was created. */
  createdAt: string;
  /** ISO 8601 UTC timestamp when the rule was last updated. */
  updatedAt: string;
}

/** Parameters required to create a new categorization rule. */
export interface CreateCategorizationRuleParams {
  /**
   * Explicit stable ID for this rule. When omitted a random hex ID is
   * generated.
   */
  id?: CategorizationRuleId;
  /** Human-readable name for the rule. */
  name: string;
  /**
   * Evaluation priority. Defaults to `1` for user rules.
   * Lower number = higher precedence.
   */
  priority?: number;
  /** Origin of the rule. Defaults to `'user'`. */
  source?: RuleSource;
  /** Predicates that must be satisfied for the rule to fire. */
  conditions: RuleCondition[];
  /** Match mode for multiple conditions. Defaults to `'all'`. */
  matchMode?: RuleMatchMode;
  /** Category to assign when the rule fires. */
  categoryId: string;
  /** ID of the user creating the rule, or `'system'`. */
  createdByUserId: string;
}

/** Fields that can be changed when updating a categorization rule. */
export type UpdateCategorizationRuleParams = Partial<
  Pick<
    CategorizationRule,
    | 'name'
    | 'priority'
    | 'conditions'
    | 'matchMode'
    | 'categoryId'
    | 'isActive'
  >
>;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * In-memory store for categorization rules.
 *
 * Rules are keyed by their stable ID.  The store is immutable — every
 * mutation helper returns a fresh `RuleStore`; the original is not modified.
 *
 * Use `Object.create(null)` internals to avoid prototype-pollution issues
 * when keying by arbitrary IDs.
 */
export interface RuleStore {
  readonly rules: Record<CategorizationRuleId, CategorizationRule>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new categorization rule with a generated ID and current
 * timestamps.
 *
 * @example
 * ```ts
 * const rule = createCategorizationRule({
 *   name: 'Swiggy / food delivery',
 *   conditions: [{ field: 'normalizedDescription', operator: 'contains', value: 'SWIGGY' }],
 *   categoryId: 'cat-food',
 *   createdByUserId: 'user-1',
 * });
 * ```
 */
export function createCategorizationRule(
  params: CreateCategorizationRuleParams,
): CategorizationRule {
  const now = new Date().toISOString();
  return {
    id: params.id ?? randomHex(8),
    name: params.name,
    priority: params.priority ?? 1,
    source: params.source ?? 'user',
    conditions: params.conditions,
    matchMode: params.matchMode ?? 'all',
    categoryId: params.categoryId,
    isActive: true,
    createdByUserId: params.createdByUserId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates an empty rule store.
 *
 * @example
 * ```ts
 * const store = createRuleStore();
 * ```
 */
export function createRuleStore(): RuleStore {
  return {
    rules: Object.create(null) as Record<CategorizationRuleId, CategorizationRule>,
  };
}

/**
 * Adds a rule to the store.
 * Returns a new `RuleStore`; the original is not mutated.
 *
 * @throws {Error} if a rule with the same ID already exists.
 */
export function addRuleToStore(store: RuleStore, rule: CategorizationRule): RuleStore {
  if (Object.hasOwn(store.rules, rule.id)) {
    throw new Error(`Categorization rule with ID "${rule.id}" already exists`);
  }
  const rules = Object.assign(
    Object.create(null) as Record<CategorizationRuleId, CategorizationRule>,
    store.rules,
    { [rule.id]: rule },
  );
  return { rules };
}

/**
 * Removes a rule from the store by ID.
 * Returns a new `RuleStore`; the original is not mutated.
 *
 * @throws {Error} if no rule with the given ID exists.
 */
export function removeRuleFromStore(
  store: RuleStore,
  ruleId: CategorizationRuleId,
): RuleStore {
  if (!Object.hasOwn(store.rules, ruleId)) {
    throw new Error(`Categorization rule with ID "${ruleId}" not found`);
  }
  const rules = Object.assign(
    Object.create(null) as Record<CategorizationRuleId, CategorizationRule>,
    store.rules,
  );
  delete rules[ruleId];
  return { rules };
}

/**
 * Applies partial updates to a rule in the store.
 * Returns a new `RuleStore`; the original is not mutated.
 * Automatically updates `updatedAt` to the current timestamp.
 *
 * @throws {Error} if no rule with the given ID exists.
 *
 * @example
 * ```ts
 * const updated = updateRuleInStore(store, ruleId, { categoryId: 'cat-groceries' });
 * ```
 */
export function updateRuleInStore(
  store: RuleStore,
  ruleId: CategorizationRuleId,
  updates: UpdateCategorizationRuleParams,
): RuleStore {
  if (!Object.hasOwn(store.rules, ruleId)) {
    throw new Error(`Categorization rule with ID "${ruleId}" not found`);
  }
  const existing = store.rules[ruleId]!;
  const updated: CategorizationRule = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  const rules = Object.assign(
    Object.create(null) as Record<CategorizationRuleId, CategorizationRule>,
    store.rules,
    { [ruleId]: updated },
  );
  return { rules };
}

/**
 * Returns the rule with the given ID, or `undefined` if not found.
 */
export function getRuleById(
  store: RuleStore,
  ruleId: CategorizationRuleId,
): CategorizationRule | undefined {
  return Object.hasOwn(store.rules, ruleId) ? store.rules[ruleId] : undefined;
}

/**
 * Returns all rules as an array, sorted by ascending priority (lower number
 * first). Rules with equal priority are returned in insertion order.
 */
export function listRules(store: RuleStore): CategorizationRule[] {
  return Object.values(store.rules).sort((a, b) => a.priority - b.priority);
}

/**
 * Returns only the active rules, sorted by ascending priority.
 * This is the list that should be passed to the categorization engine.
 */
export function listActiveRules(store: RuleStore): CategorizationRule[] {
  return listRules(store).filter((r) => r.isActive);
}

/**
 * Returns a new rule with `isActive` set to `false` and `updatedAt` bumped.
 *
 * Use `updateRuleInStore` to persist the change to a store.
 *
 * @example
 * ```ts
 * const inactive = deactivateRule(rule);
 * const updated = updateRuleInStore(store, rule.id, { isActive: false });
 * ```
 */
export function deactivateRule(rule: CategorizationRule): CategorizationRule {
  return {
    ...rule,
    isActive: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Returns a new rule with the given priority and `updatedAt` bumped.
 *
 * Use `updateRuleInStore` to persist the change to a store.
 *
 * @example
 * ```ts
 * const reordered = reorderRule(rule, 5);
 * const updated = updateRuleInStore(store, rule.id, { priority: 5 });
 * ```
 */
export function reorderRule(
  rule: CategorizationRule,
  newPriority: number,
): CategorizationRule {
  return {
    ...rule,
    priority: newPriority,
    updatedAt: new Date().toISOString(),
  };
}
