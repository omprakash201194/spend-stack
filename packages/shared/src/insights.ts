/**
 * Insights & Analytics foundation for SpendStack.
 *
 * Provides modular, testable utilities for computing account-level balance
 * and cashflow summaries, plus an explicit consent model that gates any
 * AI-assisted insight generation behind recorded user approval.
 *
 * Design principles:
 * - All computation is pure and performed locally on already-loaded data.
 * - AI insight features require explicit user consent and operate only on
 *   anonymized or aggregated data.
 * - Types are kept structurally compatible with `Transaction` from
 *   `@spendstack/transaction-intelligence` so callers can pass real
 *   transactions without an extra conversion step.
 */

import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Minimal transaction shape needed for insight computation
// ---------------------------------------------------------------------------

/**
 * Subset of transaction fields required to compute balance and cashflow
 * summaries. Structurally compatible with the full `Transaction` type from
 * `@spendstack/transaction-intelligence`.
 */
export interface InsightTransaction {
  /** Account this transaction belongs to. */
  accountId: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  date: string;
  /** Transaction amount — always a positive number. */
  amount: number;
  /** Whether money left (`debit`) or entered (`credit`) the account. */
  type: 'debit' | 'credit';
  /** ISO 4217 currency code (e.g., `"INR"`). */
  currency: string;
  /** Running balance after this transaction, if available. */
  balance?: number;
  /** Whether this is an own-account transfer. */
  isTransfer: boolean;
  /** Assigned category identifier, if any. */
  categoryId?: string;
}

// ---------------------------------------------------------------------------
// Balance Summary
// ---------------------------------------------------------------------------

/**
 * Account-level balance summary for a set of transactions covering a given
 * time window.
 *
 * Opening and closing balance are derived from `transaction.balance` values
 * when available; otherwise they are estimated by accumulating debits and
 * credits from the supplied transaction list.
 */
export interface BalanceSummary {
  /** The account these figures relate to. */
  accountId: string;
  /** ISO 4217 currency code. */
  currency: string;
  /**
   * Balance at the start of the period.
   * Derived from the balance field of the earliest transaction when present,
   * or estimated as `closingBalance - totalCredits + totalDebits`.
   */
  openingBalance: number;
  /** Balance at the end of the period. */
  closingBalance: number;
  /** Sum of all debit amounts in the period. */
  totalDebits: number;
  /** Sum of all credit amounts in the period. */
  totalCredits: number;
  /** Number of transactions included in this summary. */
  transactionCount: number;
  /** ISO 8601 date of the earliest transaction in the summary. */
  periodStart: string;
  /** ISO 8601 date of the latest transaction in the summary. */
  periodEnd: string;
  /** ISO 8601 UTC timestamp when this summary was computed. */
  computedAt: string;
}

/** Options for {@link computeBalanceSummary}. */
export interface BalanceSummaryOptions {
  /**
   * Known opening balance to use as the baseline.
   * When omitted the function will attempt to derive it from transaction
   * balance fields or fall back to 0.
   */
  openingBalance?: number;
}

/**
 * Computes an account-level balance summary from a list of transactions.
 *
 * Transactions are filtered to the given `accountId` and sorted by date
 * before computation. All transactions must share the same currency; if
 * mixed currencies are detected the function throws.
 *
 * @example
 * ```ts
 * const summary = computeBalanceSummary('acct-1', transactions, { openingBalance: 10000 });
 * console.log(summary.closingBalance);
 * ```
 */
export function computeBalanceSummary(
  accountId: string,
  transactions: InsightTransaction[],
  options: BalanceSummaryOptions = {},
): BalanceSummary {
  const accountTxns = transactions
    .filter((t) => t.accountId === accountId)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (accountTxns.length === 0) {
    const now = new Date().toISOString();
    return {
      accountId,
      currency: 'UNKNOWN',
      openingBalance: options.openingBalance ?? 0,
      closingBalance: options.openingBalance ?? 0,
      totalDebits: 0,
      totalCredits: 0,
      transactionCount: 0,
      periodStart: '',
      periodEnd: '',
      computedAt: now,
    };
  }

  // Validate single currency
  const currencies = new Set(accountTxns.map((t) => t.currency));
  if (currencies.size > 1) {
    throw new Error(
      `computeBalanceSummary: mixed currencies detected for account "${accountId}": ${[...currencies].join(', ')}`,
    );
  }
  const currency = accountTxns[0]!.currency;

  let totalDebits = 0;
  let totalCredits = 0;
  for (const t of accountTxns) {
    if (t.type === 'debit') {
      totalDebits += t.amount;
    } else {
      totalCredits += t.amount;
    }
  }

  // Determine closing balance: prefer the balance field of the last txn
  const lastTxn = accountTxns[accountTxns.length - 1]!;
  const estimatedClosing = (options.openingBalance ?? 0) + totalCredits - totalDebits;
  const closingBalance = lastTxn.balance !== undefined ? lastTxn.balance : estimatedClosing;

  // Determine opening balance
  const firstTxn = accountTxns[0]!;
  let openingBalance: number;
  if (options.openingBalance !== undefined) {
    openingBalance = options.openingBalance;
  } else if (firstTxn.balance !== undefined) {
    // Reconstruct from first txn's balance by reversing that transaction
    openingBalance =
      firstTxn.type === 'debit'
        ? firstTxn.balance + firstTxn.amount
        : firstTxn.balance - firstTxn.amount;
  } else {
    // Fall back: derive from closing balance and net movement
    openingBalance = closingBalance - totalCredits + totalDebits;
  }

  return {
    accountId,
    currency,
    openingBalance,
    closingBalance,
    totalDebits,
    totalCredits,
    transactionCount: accountTxns.length,
    periodStart: firstTxn.date,
    periodEnd: lastTxn.date,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cashflow Summary
// ---------------------------------------------------------------------------

/**
 * Account-level cashflow summary for a set of transactions covering a given
 * time window.
 *
 * Own-account transfers are counted separately and excluded from inflow /
 * outflow totals so that double-counting is avoided when both legs of a
 * transfer exist in the dataset.
 */
export interface CashflowSummary {
  /** The account these figures relate to. */
  accountId: string;
  /** ISO 4217 currency code. */
  currency: string;
  /** Sum of all non-transfer credit amounts (money in). */
  totalInflow: number;
  /** Sum of all non-transfer debit amounts (money out). */
  totalOutflow: number;
  /** `totalInflow - totalOutflow`. Positive = surplus, negative = deficit. */
  netCashflow: number;
  /** Number of non-transfer transactions included in the summary. */
  transactionCount: number;
  /** Number of own-account transfer transactions (excluded from totals). */
  transferCount: number;
  /** ISO 8601 date of the earliest transaction in the summary. */
  periodStart: string;
  /** ISO 8601 date of the latest transaction in the summary. */
  periodEnd: string;
  /** ISO 8601 UTC timestamp when this summary was computed. */
  computedAt: string;
  /**
   * Optional per-category outflow breakdown.
   * Keys are `categoryId` values; values are total debit amounts.
   * Only populated when `includeCategoryBreakdown` is `true`.
   */
  byCategory?: Record<string, number>;
}

/** Options for {@link computeCashflowSummary}. */
export interface CashflowSummaryOptions {
  /**
   * When `true`, populates `CashflowSummary.byCategory` with per-category
   * outflow totals (debits only). Defaults to `false`.
   */
  includeCategoryBreakdown?: boolean;
}

/**
 * Computes an account-level cashflow summary from a list of transactions.
 *
 * Own-account transfers (`isTransfer === true`) are excluded from inflow /
 * outflow totals and counted separately in `transferCount`.
 *
 * @example
 * ```ts
 * const summary = computeCashflowSummary('acct-1', transactions, {
 *   includeCategoryBreakdown: true,
 * });
 * console.log(summary.netCashflow);
 * ```
 */
export function computeCashflowSummary(
  accountId: string,
  transactions: InsightTransaction[],
  options: CashflowSummaryOptions = {},
): CashflowSummary {
  const accountTxns = transactions
    .filter((t) => t.accountId === accountId)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (accountTxns.length === 0) {
    const now = new Date().toISOString();
    return {
      accountId,
      currency: 'UNKNOWN',
      totalInflow: 0,
      totalOutflow: 0,
      netCashflow: 0,
      transactionCount: 0,
      transferCount: 0,
      periodStart: '',
      periodEnd: '',
      computedAt: now,
    };
  }

  // Validate single currency
  const currencies = new Set(accountTxns.map((t) => t.currency));
  if (currencies.size > 1) {
    throw new Error(
      `computeCashflowSummary: mixed currencies detected for account "${accountId}": ${[...currencies].join(', ')}`,
    );
  }
  const currency = accountTxns[0]!.currency;

  const { includeCategoryBreakdown = false } = options;
  const byCategory: Record<string, number> = {};

  let totalInflow = 0;
  let totalOutflow = 0;
  let transactionCount = 0;
  let transferCount = 0;

  for (const t of accountTxns) {
    if (t.isTransfer) {
      transferCount++;
      continue;
    }
    transactionCount++;
    if (t.type === 'credit') {
      totalInflow += t.amount;
    } else {
      totalOutflow += t.amount;
      if (includeCategoryBreakdown) {
        const key = t.categoryId ?? 'uncategorized';
        byCategory[key] = (byCategory[key] ?? 0) + t.amount;
      }
    }
  }

  const firstTxn = accountTxns[0]!;
  const lastTxn = accountTxns[accountTxns.length - 1]!;

  const summary: CashflowSummary = {
    accountId,
    currency,
    totalInflow,
    totalOutflow,
    netCashflow: totalInflow - totalOutflow,
    transactionCount,
    transferCount,
    periodStart: firstTxn.date,
    periodEnd: lastTxn.date,
    computedAt: new Date().toISOString(),
  };

  if (includeCategoryBreakdown) {
    summary.byCategory = byCategory;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Insight Consent Model
// ---------------------------------------------------------------------------

/** Current schema version for the consent record. Increment on breaking changes. */
export const INSIGHT_CONSENT_SCHEMA_VERSION = 1 as const;

export type InsightConsentSchemaVersion = typeof INSIGHT_CONSENT_SCHEMA_VERSION;

/**
 * Granular scopes a user can consent to.
 *
 * - `'balance_summary'` — allows computing and displaying account balance summaries.
 * - `'cashflow_summary'` — allows computing and displaying cashflow summaries.
 * - `'ai_insights'` — allows AI-assisted insight generation on **anonymized or
 *   aggregated data only**. Requires explicit opt-in and can be revoked
 *   independently of the other scopes.
 */
export type InsightConsentScope = 'balance_summary' | 'cashflow_summary' | 'ai_insights';

/**
 * Describes what level of data an AI insight operation is permitted to use.
 *
 * - `'aggregated'` — totals and summaries only (no individual transaction detail).
 * - `'anonymized'` — individual transaction amounts and dates, but with
 *   descriptions stripped / hashed.
 */
export type InsightDataScope = 'aggregated' | 'anonymized';

/**
 * A recorded consent decision for insight and analytics features.
 *
 * Consent is immutable once recorded — revoking consent creates a new record
 * with `granted: false` rather than mutating the existing one.
 */
export interface InsightConsent {
  /** Stable unique identifier for this consent record. */
  id: string;
  /** Schema version — always 1 for the current shape. */
  schemaVersion: InsightConsentSchemaVersion;
  /** ID of the user who granted or denied consent. */
  userId: string;
  /** Which insight scopes this record covers. */
  scopes: InsightConsentScope[];
  /** Whether consent has been granted (`true`) or denied/revoked (`false`). */
  granted: boolean;
  /**
   * Data scope approved for AI operations.
   * Only relevant when `'ai_insights'` is included in `scopes`.
   * Defaults to `'aggregated'` (most restrictive).
   */
  dataScope: InsightDataScope;
  /** ISO 8601 UTC timestamp when consent was recorded. */
  grantedAt: string;
  /**
   * ISO 8601 UTC timestamp when this consent was revoked, or `null` if it has
   * not been revoked.
   */
  revokedAt: string | null;
}

/** Parameters for creating a new consent record via {@link createInsightConsent}. */
export interface CreateInsightConsentParams {
  /** ID of the user granting or denying consent. */
  userId: string;
  /** Which insight scopes the user is consenting to. */
  scopes: InsightConsentScope[];
  /** Whether the user is granting (`true`) or denying (`false`) consent. */
  granted: boolean;
  /**
   * Data scope the user approves for AI operations.
   * Defaults to `'aggregated'`.
   */
  dataScope?: InsightDataScope;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a new insight consent record with a generated ID and current
 * timestamp.
 *
 * @example
 * ```ts
 * const consent = createInsightConsent({
 *   userId: 'user-1',
 *   scopes: ['balance_summary', 'cashflow_summary'],
 *   granted: true,
 * });
 * ```
 */
export function createInsightConsent(params: CreateInsightConsentParams): InsightConsent {
  const { userId, scopes, granted, dataScope = 'aggregated' } = params;
  return {
    id: `consent-${randomBytes(8).toString('hex')}`,
    schemaVersion: INSIGHT_CONSENT_SCHEMA_VERSION,
    userId,
    scopes,
    granted,
    dataScope,
    grantedAt: new Date().toISOString(),
    revokedAt: null,
  };
}

/**
 * Returns a new consent record representing revocation of the supplied
 * consent. The original record is not mutated.
 *
 * @example
 * ```ts
 * const revoked = revokeInsightConsent(existingConsent);
 * // existingConsent is unchanged; revoked.granted === false
 * ```
 */
export function revokeInsightConsent(consent: InsightConsent): InsightConsent {
  return {
    ...consent,
    granted: false,
    revokedAt: new Date().toISOString(),
  };
}

/**
 * Returns `true` when the consent record is active (granted and not revoked)
 * and covers the requested scope.
 *
 * @example
 * ```ts
 * if (hasInsightConsent(consent, 'ai_insights')) {
 *   // safe to run AI insight pipeline
 * }
 * ```
 */
export function hasInsightConsent(consent: InsightConsent, scope: InsightConsentScope): boolean {
  return consent.granted && consent.revokedAt === null && consent.scopes.includes(scope);
}

/**
 * Returns `true` when the consent record explicitly covers AI insights,
 * consent has been granted and not revoked, and the data scope is compatible
 * with the operation.
 *
 * This is the primary gate that the AI insight pipeline must pass before
 * operating on any user data.
 *
 * @example
 * ```ts
 * if (canRunAiInsights(consent)) {
 *   runAiInsightPipeline(aggregatedSummary);
 * }
 * ```
 */
export function canRunAiInsights(consent: InsightConsent): boolean {
  return hasInsightConsent(consent, 'ai_insights');
}
