/**
 * Core domain types for Transaction Intelligence.
 *
 * Every derived decision preserves traceability to the inputs and rules
 * that produced it, satisfying the auditability requirement.
 */

// ---------------------------------------------------------------------------
// Raw imported row (input to the normalization pipeline)
// ---------------------------------------------------------------------------

/** A raw record as parsed from a bank statement before normalization. */
export interface RawStatementRow {
  /** Stable identifier assigned during import. */
  id: string;
  /** Import job that produced this row. */
  importJobId: string;
  /** Account the statement belongs to. */
  accountId: string;
  /** Raw date string as it appears in the statement. */
  rawDate: string;
  /** Raw description / narration string. */
  rawDescription: string;
  /** Raw amount string (may include currency symbols, commas, etc.). */
  rawAmount: string;
  /** Raw balance string, if present in the statement. */
  rawBalance?: string;
  /** Whether the row represents money leaving the account. */
  isDebit: boolean;
  /** Parser confidence for this row (0–1). */
  parseConfidence: number;
}

// ---------------------------------------------------------------------------
// Normalized Transaction
// ---------------------------------------------------------------------------

/** Direction of money flow relative to the account. */
export type TransactionType = 'debit' | 'credit';

/** Lifecycle state of a transaction. */
export type TransactionStatus = 'pending' | 'cleared' | 'void';

/**
 * Source of the categorization decision, in priority order.
 * Lower index = higher precedence.
 */
export type CategorizationSource =
  | 'manual'
  | 'user-rule'
  | 'transfer'
  | 'built-in'
  | 'ai'
  | 'uncategorized';

/**
 * A normalized, enriched transaction produced from a RawStatementRow.
 * All monetary values are stored as numbers in the account's currency unit
 * (e.g., rupees, not paise).
 */
export interface Transaction {
  /** Stable unique identifier. */
  id: string;
  /** Back-reference to the raw row for full traceability. */
  rawRowId: string;
  /** Account this transaction belongs to. */
  accountId: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  date: string;
  /** Original description from the statement. */
  description: string;
  /** Cleaned, normalized description (trimmed, collapsed whitespace, uppercased). */
  normalizedDescription: string;
  /** Transaction amount — always a positive number. */
  amount: number;
  /** Whether money left (`debit`) or entered (`credit`) the account. */
  type: TransactionType;
  /** ISO 4217 currency code (e.g., `"INR"`). */
  currency: string;
  /** Running balance after this transaction, if available. */
  balance?: number;
  /** Assigned category identifier. */
  categoryId?: string;
  /** How the category was determined. */
  categorizationSource: CategorizationSource;
  /** Whether this is an own-account transfer. */
  isTransfer: boolean;
  /** ID of the matching peer transaction for transfers. */
  transferPeerId?: string;
  /**
   * Overall confidence score (0–1) combining parse confidence
   * and categorization confidence.
   */
  confidence: number;
  /** Current lifecycle status. */
  status: TransactionStatus;
  /** Optional free-text notes added by the user. */
  notes?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-update timestamp. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Transfer Detection
// ---------------------------------------------------------------------------

/** Result produced by the transfer detector for a single transaction. */
export interface TransferDetectionResult {
  /** Whether the transaction is a likely own-account transfer. */
  isTransfer: boolean;
  /** Confidence score for this decision (0–1). */
  confidence: number;
  /** ID of the matched peer transaction, if found. */
  peerId?: string;
  /** Human-readable explanation for auditability. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Categorization Rule Engine
// ---------------------------------------------------------------------------

/** Fields on a Transaction that a rule condition can match against. */
export type RuleConditionField = 'normalizedDescription' | 'description' | 'amount' | 'type';

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
  field: RuleConditionField;
  operator: RuleConditionOperator;
  /** String or numeric value to compare against. */
  value: string | number;
}

/** Whether all conditions must match, or just one. */
export type RuleMatchMode = 'all' | 'any';

/** A deterministic categorization rule. */
export interface CategorizationRule {
  /** Stable unique identifier. */
  id: string;
  /**
   * Lower number = higher precedence.
   * Built-in rules typically start at 1000; user rules at 1.
   */
  priority: number;
  /** Origin of the rule. */
  source: 'user' | 'built-in';
  /** Conditions that must be satisfied for the rule to fire. */
  conditions: RuleCondition[];
  /** Match mode for multiple conditions. Defaults to `"all"`. */
  matchMode: RuleMatchMode;
  /** Category ID to assign when this rule fires. */
  categoryId: string;
  /** Whether the rule is currently active. */
  isActive: boolean;
}

/** Result of applying the categorization rule engine. */
export interface CategorizationResult {
  /** ID of the matched category, or `undefined` if uncategorized. */
  categoryId: string | undefined;
  /** Source of the winning decision. */
  source: CategorizationSource;
  /** The rule that matched, if any. */
  matchedRule: CategorizationRule | undefined;
  /** Human-readable explanation for auditability. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Transfer Link
// ---------------------------------------------------------------------------

/**
 * Who created a transfer link.
 * `"auto"` means the system detected it; `"manual"` means the user created or
 * overrode it.
 */
export type TransferLinkSource = 'auto' | 'manual';

/**
 * Lifecycle status of a transfer link.
 *
 * - `"confirmed"` – high-confidence automatic match, or user-approved.
 * - `"pending-review"` – uncertain automatic match awaiting human decision.
 * - `"rejected"` – user explicitly marked this pair as NOT a transfer.
 */
export type TransferLinkStatus = 'confirmed' | 'pending-review' | 'rejected';

/**
 * An explicit representation of the pairing between a debit transaction on
 * one account and the corresponding credit transaction on another account
 * that together constitute an own-account transfer.
 *
 * Keeping the link as a first-class entity (rather than just fields on
 * Transaction) allows it to be confirmed, rejected, or overridden
 * independently of the transactions themselves.
 */
export interface TransferLink {
  /** Stable unique identifier for this link. */
  id: string;
  /** ID of the debit side of the transfer. */
  debitTransactionId: string;
  /** ID of the credit side of the transfer. */
  creditTransactionId: string;
  /** Confidence score produced by the detector (0–1). */
  confidence: number;
  /** Whether the link was created automatically or by the user. */
  source: TransferLinkSource;
  /** Current lifecycle status. */
  status: TransferLinkStatus;
  /** Human-readable explanation of why these transactions were linked. */
  reason: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last-update timestamp. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Review Queue
// ---------------------------------------------------------------------------

/** Reasons a transaction may be placed in the review queue. */
export type ReviewReason =
  | 'low-confidence'
  | 'ambiguous-transfer'
  | 'uncategorized'
  | 'parse-error';

/** Actions a reviewer can take to resolve a queue item. */
export type ReviewAction = 'approve' | 'edit' | 'reject';

/** A resolution applied by a human reviewer. */
export interface ReviewResolution {
  /** Action taken by the reviewer. */
  action: ReviewAction;
  /** Identifier of the user who performed the review. */
  userId: string;
  /** Optional notes explaining the decision. */
  notes?: string;
  /** ISO 8601 timestamp when the resolution was recorded. */
  resolvedAt: string;
}

/** A single entry in the immutable audit trail of a review item. */
export interface ReviewAuditEntry {
  /** ISO 8601 timestamp of this audit event. */
  timestamp: string;
  /** What happened (e.g., `"created"`, `"resolved"`, `"edited"`). */
  event: string;
  /** Additional context for the event. */
  detail: string;
}

/** An item in the review queue awaiting human attention. */
export interface ReviewQueueItem {
  /** Stable unique identifier for this queue entry. */
  id: string;
  /** The transaction that requires review. */
  transactionId: string;
  /** Why the item was enqueued. */
  reason: ReviewReason;
  /** Confidence score at the time of enqueuing (0–1). */
  confidence: number;
  /** ISO 8601 timestamp when the item was enqueued. */
  createdAt: string;
  /** ISO 8601 timestamp when the item was resolved, if resolved. */
  resolvedAt?: string;
  /** The resolution applied by the reviewer, if resolved. */
  resolution?: ReviewResolution;
  /** Immutable, append-only audit trail. */
  auditTrail: ReviewAuditEntry[];
}

/**
 * An in-memory store of review queue items, keyed by item ID.
 *
 * All store mutation helpers return a new `ReviewQueueStore`; the original
 * is never mutated.  Persistence is the caller's responsibility.
 */
export interface ReviewQueueStore {
  /** All review queue items, keyed by item ID. */
  readonly items: Readonly<Record<string, ReviewQueueItem>>;
}
