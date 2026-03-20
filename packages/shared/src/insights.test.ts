import { describe, it, expect } from 'vitest';
import {
  computeBalanceSummary,
  computeCashflowSummary,
  createInsightConsent,
  revokeInsightConsent,
  hasInsightConsent,
  canRunAiInsights,
  INSIGHT_CONSENT_SCHEMA_VERSION,
  createConsentStore,
  addConsentToStore,
  revokeConsentInStore,
  getActiveConsent,
  listUserConsents,
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

// ── ConsentStore ──────────────────────────────────────────────────────────────

describe('createConsentStore', () => {
  it('creates an empty store with no records', () => {
    const store = createConsentStore();
    expect(store.records).toHaveLength(0);
  });

  it('returns an empty array for records', () => {
    const store = createConsentStore();
    expect(Array.isArray(store.records)).toBe(true);
  });
});

describe('addConsentToStore', () => {
  it('appends a consent record to the store', () => {
    const store = createConsentStore();
    const consent = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const updated = addConsentToStore(store, consent);
    expect(updated.records).toHaveLength(1);
    expect(updated.records[0]).toBe(consent);
  });

  it('does not mutate the original store', () => {
    const store = createConsentStore();
    const consent = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    addConsentToStore(store, consent);
    expect(store.records).toHaveLength(0);
  });

  it('preserves insertion order (oldest first)', () => {
    const c1 = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const c2 = createInsightConsent({ userId: 'u1', scopes: ['cashflow_summary'], granted: true });
    let store = createConsentStore();
    store = addConsentToStore(store, c1);
    store = addConsentToStore(store, c2);
    expect(store.records[0]).toBe(c1);
    expect(store.records[1]).toBe(c2);
  });

  it('throws when a record with the same ID is added twice', () => {
    const consent = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    let store = addConsentToStore(createConsentStore(), consent);
    expect(() => addConsentToStore(store, consent)).toThrow(/already exists/);
  });

  it('allows multiple records for the same user', () => {
    const c1 = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const c2 = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: false });
    let store = createConsentStore();
    store = addConsentToStore(store, c1);
    store = addConsentToStore(store, c2);
    expect(store.records).toHaveLength(2);
  });
});

describe('revokeConsentInStore', () => {
  it('marks the consent as revoked in the store', () => {
    const consent = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    let store = addConsentToStore(createConsentStore(), consent);
    store = revokeConsentInStore(store, consent.id);
    expect(store.records[0]?.granted).toBe(false);
    expect(store.records[0]?.revokedAt).not.toBeNull();
  });

  it('does not mutate the original store', () => {
    const consent = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    const store = addConsentToStore(createConsentStore(), consent);
    revokeConsentInStore(store, consent.id);
    expect(store.records[0]?.granted).toBe(true);
    expect(store.records[0]?.revokedAt).toBeNull();
  });

  it('preserves the consent ID and all other fields', () => {
    const consent = createInsightConsent({
      userId: 'u5',
      scopes: ['cashflow_summary'],
      granted: true,
      dataScope: 'anonymized',
    });
    let store = addConsentToStore(createConsentStore(), consent);
    store = revokeConsentInStore(store, consent.id);
    const record = store.records[0]!;
    expect(record.id).toBe(consent.id);
    expect(record.userId).toBe('u5');
    expect(record.scopes).toEqual(['cashflow_summary']);
    expect(record.dataScope).toBe('anonymized');
  });

  it('keeps the total record count unchanged', () => {
    const consent = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    let store = addConsentToStore(createConsentStore(), consent);
    store = revokeConsentInStore(store, consent.id);
    expect(store.records).toHaveLength(1);
  });

  it('throws when the consent ID is not found', () => {
    const store = createConsentStore();
    expect(() => revokeConsentInStore(store, 'nonexistent-id')).toThrow(/not found/);
  });

  it('only modifies the targeted consent when multiple records exist', () => {
    const c1 = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const c2 = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    let store = createConsentStore();
    store = addConsentToStore(store, c1);
    store = addConsentToStore(store, c2);
    store = revokeConsentInStore(store, c1.id);
    expect(store.records.find((r) => r.id === c1.id)?.granted).toBe(false);
    expect(store.records.find((r) => r.id === c2.id)?.granted).toBe(true);
  });
});

describe('getActiveConsent', () => {
  it('returns undefined when the store is empty', () => {
    const store = createConsentStore();
    expect(getActiveConsent(store, 'u1', 'balance_summary')).toBeUndefined();
  });

  it('returns the active consent record when granted and not revoked', () => {
    const consent = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const store = addConsentToStore(createConsentStore(), consent);
    expect(getActiveConsent(store, 'u1', 'balance_summary')).toBe(consent);
  });

  it('returns undefined when consent was denied (granted: false)', () => {
    const consent = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: false });
    const store = addConsentToStore(createConsentStore(), consent);
    expect(getActiveConsent(store, 'u1', 'balance_summary')).toBeUndefined();
  });

  it('returns undefined after consent is revoked', () => {
    const consent = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    let store = addConsentToStore(createConsentStore(), consent);
    store = revokeConsentInStore(store, consent.id);
    expect(getActiveConsent(store, 'u1', 'ai_insights')).toBeUndefined();
  });

  it('returns the latest active consent when a new grant follows a revocation', () => {
    const first = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    const regrant = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    let store = addConsentToStore(createConsentStore(), first);
    store = revokeConsentInStore(store, first.id);
    store = addConsentToStore(store, regrant);
    expect(getActiveConsent(store, 'u1', 'ai_insights')).toBe(regrant);
  });

  it('returns undefined when the scope is not covered by the consent', () => {
    const consent = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const store = addConsentToStore(createConsentStore(), consent);
    expect(getActiveConsent(store, 'u1', 'ai_insights')).toBeUndefined();
  });

  it('does not return consent belonging to a different user', () => {
    const consent = createInsightConsent({ userId: 'u2', scopes: ['balance_summary'], granted: true });
    const store = addConsentToStore(createConsentStore(), consent);
    expect(getActiveConsent(store, 'u1', 'balance_summary')).toBeUndefined();
  });

  it('handles multiple users independently', () => {
    const c1 = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    const c2 = createInsightConsent({ userId: 'u2', scopes: ['ai_insights'], granted: false });
    let store = createConsentStore();
    store = addConsentToStore(store, c1);
    store = addConsentToStore(store, c2);
    expect(getActiveConsent(store, 'u1', 'ai_insights')).toBe(c1);
    expect(getActiveConsent(store, 'u2', 'ai_insights')).toBeUndefined();
  });
});

describe('listUserConsents', () => {
  it('returns an empty array when the store has no records for the user', () => {
    const store = createConsentStore();
    expect(listUserConsents(store, 'u1')).toEqual([]);
  });

  it('returns all consent records for the specified user', () => {
    const c1 = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const c2 = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    let store = createConsentStore();
    store = addConsentToStore(store, c1);
    store = addConsentToStore(store, c2);
    const history = listUserConsents(store, 'u1');
    expect(history).toHaveLength(2);
    expect(history).toContain(c1);
    expect(history).toContain(c2);
  });

  it('excludes records belonging to other users', () => {
    const c1 = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const c2 = createInsightConsent({ userId: 'u2', scopes: ['balance_summary'], granted: true });
    let store = createConsentStore();
    store = addConsentToStore(store, c1);
    store = addConsentToStore(store, c2);
    expect(listUserConsents(store, 'u1')).toHaveLength(1);
    expect(listUserConsents(store, 'u1')[0]).toBe(c1);
  });

  it('reflects the latest revocation state for each consent record', () => {
    const c1 = createInsightConsent({ userId: 'u1', scopes: ['ai_insights'], granted: true });
    const c2 = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    let store = createConsentStore();
    store = addConsentToStore(store, c1);
    store = addConsentToStore(store, c2);
    store = revokeConsentInStore(store, c1.id);
    const history = listUserConsents(store, 'u1');
    expect(history).toHaveLength(2);
    // c1 was revoked — its record should now show granted: false
    const c1Record = history.find((r) => r.id === c1.id);
    expect(c1Record?.granted).toBe(false);
    expect(c1Record?.revokedAt).not.toBeNull();
    // c2 is still active
    const c2Record = history.find((r) => r.id === c2.id);
    expect(c2Record?.granted).toBe(true);
  });

  it('does not allow callers to mutate the store via the returned array', () => {
    const c1 = createInsightConsent({ userId: 'u1', scopes: ['balance_summary'], granted: true });
    const store = addConsentToStore(createConsentStore(), c1);
    const history = listUserConsents(store, 'u1');
    // Mutating the returned array should not affect the store
    history.pop();
    expect(store.records).toHaveLength(1);
  });
});
