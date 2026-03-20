import { describe, it, expect } from 'vitest';
import {
  computeBalanceSummary,
  computeCashflowSummary,
  computeOverallBalanceSummary,
  computeOverallCashflowSummary,
  createInsightConsent,
  revokeInsightConsent,
  hasInsightConsent,
  canRunAiInsights,
  INSIGHT_CONSENT_SCHEMA_VERSION,
} from './insights.js';
import type { InsightTransaction } from './insights.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTxn(overrides: Partial<InsightTransaction> = {}): InsightTransaction {
  return {
    accountId: 'acct-1',
    date: '2024-01-05',
    amount: 100,
    type: 'debit',
    currency: 'INR',
    isTransfer: false,
    ...overrides,
  };
}

// ── computeBalanceSummary ─────────────────────────────────────────────────────

describe('computeBalanceSummary', () => {
  it('returns a zeroed summary when there are no transactions', () => {
    const summary = computeBalanceSummary('acct-1', []);
    expect(summary.accountId).toBe('acct-1');
    expect(summary.transactionCount).toBe(0);
    expect(summary.totalDebits).toBe(0);
    expect(summary.totalCredits).toBe(0);
    expect(summary.currency).toBe('UNKNOWN');
    expect(summary.periodStart).toBe('');
    expect(summary.periodEnd).toBe('');
  });

  it('respects an explicit openingBalance when no transactions exist', () => {
    const summary = computeBalanceSummary('acct-1', [], { openingBalance: 5000 });
    expect(summary.openingBalance).toBe(5000);
    expect(summary.closingBalance).toBe(5000);
  });

  it('filters to the specified accountId', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 200, type: 'debit' }),
      makeTxn({ accountId: 'acct-2', amount: 500, type: 'credit' }),
    ];
    const summary = computeBalanceSummary('acct-1', txns);
    expect(summary.transactionCount).toBe(1);
    expect(summary.totalDebits).toBe(200);
    expect(summary.totalCredits).toBe(0);
  });

  it('sums debits and credits correctly', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 300, type: 'debit', date: '2024-01-01' }),
      makeTxn({ amount: 500, type: 'credit', date: '2024-01-02' }),
      makeTxn({ amount: 100, type: 'debit', date: '2024-01-03' }),
    ];
    const summary = computeBalanceSummary('acct-1', txns, { openingBalance: 1000 });
    expect(summary.totalDebits).toBe(400);
    expect(summary.totalCredits).toBe(500);
    expect(summary.transactionCount).toBe(3);
  });

  it('uses the explicit openingBalance to compute closingBalance', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 200, type: 'debit', date: '2024-01-01' }),
      makeTxn({ amount: 500, type: 'credit', date: '2024-01-02' }),
    ];
    const summary = computeBalanceSummary('acct-1', txns, { openingBalance: 1000 });
    // closing = openingBalance + credits - debits = 1000 + 500 - 200 = 1300
    expect(summary.openingBalance).toBe(1000);
    expect(summary.closingBalance).toBe(1300);
  });

  it('derives closingBalance from the last transaction balance field when present', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 200, type: 'debit', date: '2024-01-01', balance: 800 }),
      makeTxn({ amount: 100, type: 'debit', date: '2024-01-02', balance: 700 }),
    ];
    const summary = computeBalanceSummary('acct-1', txns);
    expect(summary.closingBalance).toBe(700);
  });

  it('derives openingBalance from the first transaction balance field', () => {
    // First txn is a debit of 200 with balance 800 → opening = 800 + 200 = 1000
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 200, type: 'debit', date: '2024-01-01', balance: 800 }),
      makeTxn({ amount: 100, type: 'credit', date: '2024-01-02', balance: 900 }),
    ];
    const summary = computeBalanceSummary('acct-1', txns);
    expect(summary.openingBalance).toBe(1000);
  });

  it('sets periodStart and periodEnd to the earliest and latest dates', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ date: '2024-01-10' }),
      makeTxn({ date: '2024-01-01' }),
      makeTxn({ date: '2024-01-20' }),
    ];
    const summary = computeBalanceSummary('acct-1', txns);
    expect(summary.periodStart).toBe('2024-01-01');
    expect(summary.periodEnd).toBe('2024-01-20');
  });

  it('includes a valid ISO 8601 computedAt timestamp', () => {
    const summary = computeBalanceSummary('acct-1', [makeTxn()]);
    expect(summary.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('carries the currency from transactions', () => {
    const summary = computeBalanceSummary('acct-1', [makeTxn({ currency: 'USD' })]);
    expect(summary.currency).toBe('USD');
  });

  it('throws when mixed currencies are detected', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ currency: 'INR' }),
      makeTxn({ currency: 'USD' }),
    ];
    expect(() => computeBalanceSummary('acct-1', txns)).toThrow(/mixed currencies/);
  });
});

// ── computeCashflowSummary ────────────────────────────────────────────────────

describe('computeCashflowSummary', () => {
  it('returns a zeroed summary when there are no transactions', () => {
    const summary = computeCashflowSummary('acct-1', []);
    expect(summary.accountId).toBe('acct-1');
    expect(summary.totalInflow).toBe(0);
    expect(summary.totalOutflow).toBe(0);
    expect(summary.netCashflow).toBe(0);
    expect(summary.transactionCount).toBe(0);
    expect(summary.transferCount).toBe(0);
    expect(summary.currency).toBe('UNKNOWN');
  });

  it('filters to the specified accountId', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 200, type: 'credit' }),
      makeTxn({ accountId: 'acct-2', amount: 500, type: 'credit' }),
    ];
    const summary = computeCashflowSummary('acct-1', txns);
    expect(summary.totalInflow).toBe(200);
    expect(summary.transactionCount).toBe(1);
  });

  it('sums inflow (credits) and outflow (debits) excluding transfers', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 500, type: 'credit', isTransfer: false }),
      makeTxn({ amount: 200, type: 'debit', isTransfer: false }),
      makeTxn({ amount: 100, type: 'debit', isTransfer: true }), // transfer — excluded
    ];
    const summary = computeCashflowSummary('acct-1', txns);
    expect(summary.totalInflow).toBe(500);
    expect(summary.totalOutflow).toBe(200);
    expect(summary.netCashflow).toBe(300);
    expect(summary.transactionCount).toBe(2);
    expect(summary.transferCount).toBe(1);
  });

  it('computes a negative netCashflow when outflow exceeds inflow', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 100, type: 'credit' }),
      makeTxn({ amount: 600, type: 'debit' }),
    ];
    const summary = computeCashflowSummary('acct-1', txns);
    expect(summary.netCashflow).toBe(-500);
  });

  it('sets periodStart and periodEnd correctly', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ date: '2024-03-15' }),
      makeTxn({ date: '2024-01-01' }),
      makeTxn({ date: '2024-06-30' }),
    ];
    const summary = computeCashflowSummary('acct-1', txns);
    expect(summary.periodStart).toBe('2024-01-01');
    expect(summary.periodEnd).toBe('2024-06-30');
  });

  it('includes a valid ISO 8601 computedAt timestamp', () => {
    const summary = computeCashflowSummary('acct-1', [makeTxn()]);
    expect(summary.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('throws when mixed currencies are detected', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ currency: 'INR' }),
      makeTxn({ currency: 'EUR' }),
    ];
    expect(() => computeCashflowSummary('acct-1', txns)).toThrow(/mixed currencies/);
  });

  describe('with includeCategoryBreakdown', () => {
    it('populates byCategory with debit amounts grouped by categoryId', () => {
      const txns: InsightTransaction[] = [
        makeTxn({ amount: 200, type: 'debit', categoryId: 'food' }),
        makeTxn({ amount: 150, type: 'debit', categoryId: 'food' }),
        makeTxn({ amount: 300, type: 'debit', categoryId: 'rent' }),
        makeTxn({ amount: 500, type: 'credit', categoryId: 'salary' }),
      ];
      const summary = computeCashflowSummary('acct-1', txns, {
        includeCategoryBreakdown: true,
      });
      expect(summary.byCategory).toBeDefined();
      expect(summary.byCategory!['food']).toBe(350);
      expect(summary.byCategory!['rent']).toBe(300);
      // credits are not included in the outflow breakdown
      expect(summary.byCategory!['salary']).toBeUndefined();
    });

    it('groups uncategorized debits under "uncategorized"', () => {
      const txns: InsightTransaction[] = [
        makeTxn({ amount: 100, type: 'debit', categoryId: undefined }),
      ];
      const summary = computeCashflowSummary('acct-1', txns, {
        includeCategoryBreakdown: true,
      });
      expect(summary.byCategory!['uncategorized']).toBe(100);
    });

    it('does not include byCategory when option is false', () => {
      const summary = computeCashflowSummary('acct-1', [makeTxn()], {
        includeCategoryBreakdown: false,
      });
      expect(summary.byCategory).toBeUndefined();
    });

    it('excludes transfer debits from byCategory', () => {
      const txns: InsightTransaction[] = [
        makeTxn({ amount: 400, type: 'debit', categoryId: 'transfer', isTransfer: true }),
        makeTxn({ amount: 200, type: 'debit', categoryId: 'food', isTransfer: false }),
      ];
      const summary = computeCashflowSummary('acct-1', txns, {
        includeCategoryBreakdown: true,
      });
      expect(summary.byCategory!['transfer']).toBeUndefined();
      expect(summary.byCategory!['food']).toBe(200);
    });
  });
});

// ── createInsightConsent ──────────────────────────────────────────────────────

describe('createInsightConsent', () => {
  it('assigns schemaVersion 1', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary'],
      granted: true,
    });
    expect(consent.schemaVersion).toBe(INSIGHT_CONSENT_SCHEMA_VERSION);
    expect(consent.schemaVersion).toBe(1);
  });

  it('generates a unique id prefixed with "consent-"', () => {
    const a = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const b = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    expect(a.id).toMatch(/^consent-/);
    expect(a.id).not.toBe(b.id);
  });

  it('preserves all supplied fields', () => {
    const consent = createInsightConsent({
      userId: 'user-42',
      scopes: ['cashflow_summary', 'ai_insights'],
      granted: true,
      dataScope: 'anonymized',
    });
    expect(consent.userId).toBe('user-42');
    expect(consent.scopes).toEqual(['cashflow_summary', 'ai_insights']);
    expect(consent.granted).toBe(true);
    expect(consent.dataScope).toBe('anonymized');
  });

  it('defaults dataScope to "aggregated"', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['ai_insights'],
      granted: true,
    });
    expect(consent.dataScope).toBe('aggregated');
  });

  it('sets a valid ISO 8601 grantedAt timestamp', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary'],
      granted: true,
    });
    expect(consent.grantedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('initializes revokedAt to null', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary'],
      granted: true,
    });
    expect(consent.revokedAt).toBeNull();
  });

  it('can record a denied consent (granted: false)', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['ai_insights'],
      granted: false,
    });
    expect(consent.granted).toBe(false);
  });
});

// ── revokeInsightConsent ──────────────────────────────────────────────────────

describe('revokeInsightConsent', () => {
  it('returns a new record with granted: false', () => {
    const original = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary', 'ai_insights'],
      granted: true,
    });
    const revoked = revokeInsightConsent(original);
    expect(revoked.granted).toBe(false);
  });

  it('sets revokedAt to a valid ISO 8601 timestamp', () => {
    const original = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary'],
      granted: true,
    });
    const revoked = revokeInsightConsent(original);
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('does not mutate the original consent record', () => {
    const original = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary'],
      granted: true,
    });
    revokeInsightConsent(original);
    expect(original.granted).toBe(true);
    expect(original.revokedAt).toBeNull();
  });

  it('preserves all other fields from the original record', () => {
    const original = createInsightConsent({
      userId: 'user-5',
      scopes: ['cashflow_summary'],
      granted: true,
      dataScope: 'anonymized',
    });
    const revoked = revokeInsightConsent(original);
    expect(revoked.id).toBe(original.id);
    expect(revoked.userId).toBe('user-5');
    expect(revoked.scopes).toEqual(['cashflow_summary']);
    expect(revoked.dataScope).toBe('anonymized');
  });
});

// ── hasInsightConsent ─────────────────────────────────────────────────────────

describe('hasInsightConsent', () => {
  it('returns true when consent is granted and scope is included', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary', 'cashflow_summary'],
      granted: true,
    });
    expect(hasInsightConsent(consent, 'balance_summary')).toBe(true);
    expect(hasInsightConsent(consent, 'cashflow_summary')).toBe(true);
  });

  it('returns false when the scope is not included', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary'],
      granted: true,
    });
    expect(hasInsightConsent(consent, 'ai_insights')).toBe(false);
  });

  it('returns false when granted is false', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary'],
      granted: false,
    });
    expect(hasInsightConsent(consent, 'balance_summary')).toBe(false);
  });

  it('returns false when consent has been revoked', () => {
    const original = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary'],
      granted: true,
    });
    const revoked = revokeInsightConsent(original);
    expect(hasInsightConsent(revoked, 'balance_summary')).toBe(false);
  });
});

// ── canRunAiInsights ──────────────────────────────────────────────────────────

describe('canRunAiInsights', () => {
  it('returns true when ai_insights scope is granted and not revoked', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['ai_insights'],
      granted: true,
    });
    expect(canRunAiInsights(consent)).toBe(true);
  });

  it('returns false when ai_insights scope is not included', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['balance_summary', 'cashflow_summary'],
      granted: true,
    });
    expect(canRunAiInsights(consent)).toBe(false);
  });

  it('returns false after consent is revoked', () => {
    const original = createInsightConsent({
      userId: 'user-1',
      scopes: ['ai_insights'],
      granted: true,
    });
    const revoked = revokeInsightConsent(original);
    expect(canRunAiInsights(revoked)).toBe(false);
  });

  it('returns false when granted is false', () => {
    const consent = createInsightConsent({
      userId: 'user-1',
      scopes: ['ai_insights'],
      granted: false,
    });
    expect(canRunAiInsights(consent)).toBe(false);
  });
});

// ── period filtering ─────────────────────────────────────────────────────────

describe('computeBalanceSummary with period filter', () => {
  it('includes only transactions within the period', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 500, type: 'debit', date: '2024-01-15' }),
      makeTxn({ amount: 200, type: 'credit', date: '2024-02-10' }),
      makeTxn({ amount: 100, type: 'debit', date: '2024-03-20' }), // outside period
    ];
    const summary = computeBalanceSummary('acct-1', txns, {
      period: { from: '2024-01-01', to: '2024-02-28' },
    });
    expect(summary.transactionCount).toBe(2);
    expect(summary.totalDebits).toBe(500);
    expect(summary.totalCredits).toBe(200);
  });

  it('returns a zeroed summary when no transactions fall within the period', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 300, type: 'debit', date: '2024-06-01' }),
    ];
    const summary = computeBalanceSummary('acct-1', txns, {
      period: { from: '2024-01-01', to: '2024-03-31' },
    });
    expect(summary.transactionCount).toBe(0);
    expect(summary.totalDebits).toBe(0);
    expect(summary.periodStart).toBe('');
    expect(summary.periodEnd).toBe('');
  });

  it('includes transactions on the boundary dates (inclusive)', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 100, type: 'debit', date: '2024-01-01' }), // on from
      makeTxn({ amount: 200, type: 'credit', date: '2024-03-31' }), // on to
      makeTxn({ amount: 50, type: 'debit', date: '2023-12-31' }), // before from
      makeTxn({ amount: 50, type: 'credit', date: '2024-04-01' }), // after to
    ];
    const summary = computeBalanceSummary('acct-1', txns, {
      period: { from: '2024-01-01', to: '2024-03-31' },
    });
    expect(summary.transactionCount).toBe(2);
    expect(summary.periodStart).toBe('2024-01-01');
    expect(summary.periodEnd).toBe('2024-03-31');
  });

  it('respects openingBalance alongside period filtering', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 300, type: 'debit', date: '2024-02-01' }),
    ];
    const summary = computeBalanceSummary('acct-1', txns, {
      period: { from: '2024-01-01', to: '2024-03-31' },
      openingBalance: 2000,
    });
    // closing = 2000 - 300 = 1700
    expect(summary.openingBalance).toBe(2000);
    expect(summary.closingBalance).toBe(1700);
  });
});

describe('computeCashflowSummary with period filter', () => {
  it('includes only transactions within the period', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 1000, type: 'credit', date: '2024-01-05' }),
      makeTxn({ amount: 400, type: 'debit', date: '2024-02-10' }),
      makeTxn({ amount: 800, type: 'credit', date: '2024-04-01' }), // outside
    ];
    const summary = computeCashflowSummary('acct-1', txns, {
      period: { from: '2024-01-01', to: '2024-03-31' },
    });
    expect(summary.totalInflow).toBe(1000);
    expect(summary.totalOutflow).toBe(400);
    expect(summary.transactionCount).toBe(2);
  });

  it('returns a zeroed summary when no transactions fall within the period', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 500, type: 'credit', date: '2025-01-01' }),
    ];
    const summary = computeCashflowSummary('acct-1', txns, {
      period: { from: '2024-01-01', to: '2024-12-31' },
    });
    expect(summary.totalInflow).toBe(0);
    expect(summary.totalOutflow).toBe(0);
    expect(summary.transactionCount).toBe(0);
  });

  it('combines period filter with category breakdown', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ amount: 200, type: 'debit', categoryId: 'food', date: '2024-01-10' }),
      makeTxn({ amount: 300, type: 'debit', categoryId: 'rent', date: '2024-02-01' }),
      makeTxn({ amount: 150, type: 'debit', categoryId: 'food', date: '2024-05-01' }), // outside
    ];
    const summary = computeCashflowSummary('acct-1', txns, {
      period: { from: '2024-01-01', to: '2024-03-31' },
      includeCategoryBreakdown: true,
    });
    expect(summary.byCategory!['food']).toBe(200);
    expect(summary.byCategory!['rent']).toBe(300);
    expect(summary.byCategory!['food']).not.toBe(350);
  });
});

// ── computeOverallBalanceSummary ──────────────────────────────────────────────

describe('computeOverallBalanceSummary', () => {
  it('returns a zeroed summary when the transaction list is empty', () => {
    const overall = computeOverallBalanceSummary([]);
    expect(overall.currency).toBe('UNKNOWN');
    expect(overall.totalOpeningBalance).toBe(0);
    expect(overall.totalClosingBalance).toBe(0);
    expect(overall.totalDebits).toBe(0);
    expect(overall.totalCredits).toBe(0);
    expect(overall.transactionCount).toBe(0);
    expect(overall.periodStart).toBe('');
    expect(overall.periodEnd).toBe('');
    expect(overall.byAccount).toEqual({});
  });

  it('aggregates totals from multiple accounts', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 500, type: 'debit', date: '2024-01-10' }),
      makeTxn({ accountId: 'acct-1', amount: 300, type: 'credit', date: '2024-01-15' }),
      makeTxn({ accountId: 'acct-2', amount: 700, type: 'debit', date: '2024-01-20' }),
      makeTxn({ accountId: 'acct-2', amount: 200, type: 'credit', date: '2024-01-25' }),
    ];
    const overall = computeOverallBalanceSummary(txns);
    expect(overall.totalDebits).toBe(1200);
    expect(overall.totalCredits).toBe(500);
    expect(overall.transactionCount).toBe(4);
  });

  it('derives periodStart and periodEnd across all accounts', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', date: '2024-02-01' }),
      makeTxn({ accountId: 'acct-2', date: '2024-01-05' }),
      makeTxn({ accountId: 'acct-2', date: '2024-03-20' }),
    ];
    const overall = computeOverallBalanceSummary(txns);
    expect(overall.periodStart).toBe('2024-01-05');
    expect(overall.periodEnd).toBe('2024-03-20');
  });

  it('populates byAccount with individual account summaries', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 400, type: 'debit', date: '2024-01-01' }),
      makeTxn({ accountId: 'acct-2', amount: 600, type: 'credit', date: '2024-01-02' }),
    ];
    const overall = computeOverallBalanceSummary(txns);
    expect(overall.byAccount['acct-1']).toBeDefined();
    expect(overall.byAccount['acct-2']).toBeDefined();
    expect(overall.byAccount['acct-1']!.totalDebits).toBe(400);
    expect(overall.byAccount['acct-2']!.totalCredits).toBe(600);
  });

  it('applies per-account opening balances when provided', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 200, type: 'debit', date: '2024-01-01' }),
      makeTxn({ accountId: 'acct-2', amount: 100, type: 'debit', date: '2024-01-01' }),
    ];
    const overall = computeOverallBalanceSummary(txns, {
      openingBalances: { 'acct-1': 1000, 'acct-2': 500 },
    });
    // acct-1: opening 1000, closing 800; acct-2: opening 500, closing 400
    expect(overall.totalOpeningBalance).toBe(1500);
    expect(overall.totalClosingBalance).toBe(1200);
  });

  it('filters transactions by period', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 300, type: 'debit', date: '2024-01-10' }),
      makeTxn({ accountId: 'acct-1', amount: 100, type: 'debit', date: '2024-04-01' }), // outside
      makeTxn({ accountId: 'acct-2', amount: 500, type: 'credit', date: '2024-02-15' }),
    ];
    const overall = computeOverallBalanceSummary(txns, {
      period: { from: '2024-01-01', to: '2024-03-31' },
    });
    expect(overall.totalDebits).toBe(300);
    expect(overall.totalCredits).toBe(500);
    expect(overall.transactionCount).toBe(2);
  });

  it('throws when mixed currencies are detected', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', currency: 'INR' }),
      makeTxn({ accountId: 'acct-2', currency: 'USD' }),
    ];
    expect(() => computeOverallBalanceSummary(txns)).toThrow(/mixed currencies/);
  });

  it('includes a valid ISO 8601 computedAt timestamp', () => {
    const overall = computeOverallBalanceSummary([makeTxn()]);
    expect(overall.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ── computeOverallCashflowSummary ─────────────────────────────────────────────

describe('computeOverallCashflowSummary', () => {
  it('returns a zeroed summary when the transaction list is empty', () => {
    const overall = computeOverallCashflowSummary([]);
    expect(overall.currency).toBe('UNKNOWN');
    expect(overall.totalInflow).toBe(0);
    expect(overall.totalOutflow).toBe(0);
    expect(overall.netCashflow).toBe(0);
    expect(overall.transactionCount).toBe(0);
    expect(overall.transferCount).toBe(0);
    expect(overall.periodStart).toBe('');
    expect(overall.periodEnd).toBe('');
    expect(overall.byAccount).toEqual({});
  });

  it('aggregates inflow, outflow and netCashflow from multiple accounts', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 1000, type: 'credit', isTransfer: false }),
      makeTxn({ accountId: 'acct-1', amount: 400, type: 'debit', isTransfer: false }),
      makeTxn({ accountId: 'acct-2', amount: 800, type: 'credit', isTransfer: false }),
      makeTxn({ accountId: 'acct-2', amount: 200, type: 'debit', isTransfer: false }),
    ];
    const overall = computeOverallCashflowSummary(txns);
    expect(overall.totalInflow).toBe(1800);
    expect(overall.totalOutflow).toBe(600);
    expect(overall.netCashflow).toBe(1200);
    expect(overall.transactionCount).toBe(4);
  });

  it('counts transfer entries from all accounts in transferCount', () => {
    const txns: InsightTransaction[] = [
      // Both legs of a transfer between acct-1 and acct-2
      makeTxn({ accountId: 'acct-1', amount: 500, type: 'debit', isTransfer: true }),
      makeTxn({ accountId: 'acct-2', amount: 500, type: 'credit', isTransfer: true }),
      makeTxn({ accountId: 'acct-1', amount: 200, type: 'credit', isTransfer: false }),
    ];
    const overall = computeOverallCashflowSummary(txns);
    expect(overall.transferCount).toBe(2);
    expect(overall.transactionCount).toBe(1);
    expect(overall.totalInflow).toBe(200);
  });

  it('derives periodStart and periodEnd across all accounts', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', date: '2024-03-01' }),
      makeTxn({ accountId: 'acct-2', date: '2024-01-10' }),
      makeTxn({ accountId: 'acct-2', date: '2024-06-15' }),
    ];
    const overall = computeOverallCashflowSummary(txns);
    expect(overall.periodStart).toBe('2024-01-10');
    expect(overall.periodEnd).toBe('2024-06-15');
  });

  it('populates byAccount with individual account summaries', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 300, type: 'credit', isTransfer: false }),
      makeTxn({ accountId: 'acct-2', amount: 150, type: 'debit', isTransfer: false }),
    ];
    const overall = computeOverallCashflowSummary(txns);
    expect(overall.byAccount['acct-1']).toBeDefined();
    expect(overall.byAccount['acct-2']).toBeDefined();
    expect(overall.byAccount['acct-1']!.totalInflow).toBe(300);
    expect(overall.byAccount['acct-2']!.totalOutflow).toBe(150);
  });

  it('filters transactions by period', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 500, type: 'credit', date: '2024-01-05' }),
      makeTxn({ accountId: 'acct-1', amount: 200, type: 'debit', date: '2024-04-01' }), // outside
      makeTxn({ accountId: 'acct-2', amount: 300, type: 'debit', date: '2024-02-20' }),
    ];
    const overall = computeOverallCashflowSummary(txns, {
      period: { from: '2024-01-01', to: '2024-03-31' },
    });
    expect(overall.totalInflow).toBe(500);
    expect(overall.totalOutflow).toBe(300);
    expect(overall.transactionCount).toBe(2);
  });

  it('aggregates byCategory across all accounts when requested', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 200, type: 'debit', categoryId: 'food' }),
      makeTxn({ accountId: 'acct-2', amount: 350, type: 'debit', categoryId: 'food' }),
      makeTxn({ accountId: 'acct-2', amount: 600, type: 'debit', categoryId: 'rent' }),
    ];
    const overall = computeOverallCashflowSummary(txns, { includeCategoryBreakdown: true });
    expect(overall.byCategory).toBeDefined();
    expect(overall.byCategory!['food']).toBe(550);
    expect(overall.byCategory!['rent']).toBe(600);
  });

  it('does not include byCategory when option is false', () => {
    const overall = computeOverallCashflowSummary([makeTxn()]);
    expect(overall.byCategory).toBeUndefined();
  });

  it('computes a negative netCashflow when outflow exceeds inflow across accounts', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', amount: 100, type: 'credit' }),
      makeTxn({ accountId: 'acct-2', amount: 800, type: 'debit' }),
    ];
    const overall = computeOverallCashflowSummary(txns);
    expect(overall.netCashflow).toBe(-700);
  });

  it('throws when mixed currencies are detected', () => {
    const txns: InsightTransaction[] = [
      makeTxn({ accountId: 'acct-1', currency: 'INR' }),
      makeTxn({ accountId: 'acct-2', currency: 'EUR' }),
    ];
    expect(() => computeOverallCashflowSummary(txns)).toThrow(/mixed currencies/);
  });

  it('includes a valid ISO 8601 computedAt timestamp', () => {
    const overall = computeOverallCashflowSummary([makeTxn()]);
    expect(overall.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
