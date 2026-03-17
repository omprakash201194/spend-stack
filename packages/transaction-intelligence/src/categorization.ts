/**
 * Deterministic categorization rule engine.
 *
 * Rules are evaluated in ascending priority order (lowest number wins).
 * Every decision records the matching rule for full auditability.
 * No opaque heuristics — each outcome is explained in plain text.
 */

import type {
  Transaction,
  CategorizationRule,
  CategorizationResult,
  RuleCondition,
  RuleConditionField,
} from './types.js';

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/**
 * Extracts the string or numeric value of a field from a transaction.
 */
function getFieldValue(tx: Transaction, field: RuleConditionField): string | number {
  switch (field) {
    case 'description':
      return tx.description;
    case 'normalizedDescription':
      return tx.normalizedDescription;
    case 'amount':
      return tx.amount;
    case 'type':
      return tx.type;
  }
}

/**
 * Evaluates a single rule condition against a transaction.
 * Returns `true` if the condition is satisfied.
 */
export function evaluateCondition(tx: Transaction, condition: RuleCondition): boolean {
  const fieldValue = getFieldValue(tx, condition.field);
  const { operator, value } = condition;

  switch (operator) {
    case 'equals':
      return fieldValue === value;

    case 'contains':
      if (typeof fieldValue !== 'string' || typeof value !== 'string') return false;
      return fieldValue.includes(value);

    case 'startsWith':
      if (typeof fieldValue !== 'string' || typeof value !== 'string') return false;
      return fieldValue.startsWith(value);

    case 'endsWith':
      if (typeof fieldValue !== 'string' || typeof value !== 'string') return false;
      return fieldValue.endsWith(value);

    case 'greaterThan':
      if (typeof fieldValue !== 'number' || typeof value !== 'number') return false;
      return fieldValue > value;

    case 'lessThan':
      if (typeof fieldValue !== 'number' || typeof value !== 'number') return false;
      return fieldValue < value;

    case 'regex': {
      if (typeof fieldValue !== 'string' || typeof value !== 'string') return false;
      try {
        return new RegExp(value).test(fieldValue);
      } catch {
        return false;
      }
    }
  }
}

/**
 * Returns `true` if all conditions in a rule are satisfied by the transaction
 * (or any condition, when `matchMode` is `"any"`).
 */
function ruleMatches(tx: Transaction, rule: CategorizationRule): boolean {
  if (rule.conditions.length === 0) return false;

  if (rule.matchMode === 'any') {
    return rule.conditions.some((c) => evaluateCondition(tx, c));
  }

  // Default: 'all'
  return rule.conditions.every((c) => evaluateCondition(tx, c));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies an ordered set of categorization rules to a transaction and
 * returns the first matching result.
 *
 * Rules must be passed in the desired evaluation order (lowest `priority`
 * number first = highest precedence). The caller is responsible for sorting.
 *
 * Transfer-flagged transactions are always categorized as `"transfer"` and
 * bypass rule matching, preserving the categorization pipeline invariant.
 *
 * @param tx     The transaction to categorize.
 * @param rules  Sorted, active rules to evaluate (inactive rules are skipped).
 */
export function applyCategorizationRules(
  tx: Transaction,
  rules: CategorizationRule[],
): CategorizationResult {
  // Transfers bypass rule matching
  if (tx.isTransfer) {
    return {
      categoryId: undefined,
      source: 'transfer',
      matchedRule: undefined,
      reason: 'Transaction is an own-account transfer; rule matching skipped',
    };
  }

  for (const rule of rules) {
    if (!rule.isActive) continue;

    if (ruleMatches(tx, rule)) {
      return {
        categoryId: rule.categoryId,
        source: rule.source === 'user' ? 'user-rule' : 'built-in',
        matchedRule: rule,
        reason: `Matched rule "${rule.id}" (priority ${rule.priority}, source: ${rule.source})`,
      };
    }
  }

  return {
    categoryId: undefined,
    source: 'uncategorized',
    matchedRule: undefined,
    reason: 'No active rule matched the transaction',
  };
}

/**
 * Sorts categorization rules by ascending priority (lower number = higher
 * precedence) and filters out inactive rules.
 *
 * Convenience helper — callers may sort rules themselves if needed.
 */
export function sortRules(rules: CategorizationRule[]): CategorizationRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

/**
 * Applies categorization rules to a batch of transactions, returning updated
 * copies with `categoryId` and `categorizationSource` populated.
 *
 * Rules are sorted once before the batch loop.
 */
export function categorizeBatch(
  transactions: Transaction[],
  rules: CategorizationRule[],
): Transaction[] {
  const sortedRules = sortRules(rules);

  return transactions.map((tx) => {
    // Skip transactions that have already been manually categorized
    if (tx.categorizationSource === 'manual') return tx;

    const result = applyCategorizationRules(tx, sortedRules);

    return {
      ...tx,
      categoryId: result.categoryId,
      categorizationSource: result.source,
      updatedAt: new Date().toISOString(),
    };
  });
}
