/**
 * @spendstack/transaction-intelligence — public API
 *
 * Re-exports all types, the normalization pipeline, transfer detector,
 * categorization rule engine, and review queue manager.
 */

// Types
export type {
  RawStatementRow,
  Transaction,
  TransactionType,
  TransactionStatus,
  CategorizationSource,
  TransferDetectionResult,
  RuleConditionField,
  RuleConditionOperator,
  RuleCondition,
  RuleMatchMode,
  CategorizationRule,
  CategorizationResult,
  ReviewReason,
  ReviewAction,
  ReviewResolution,
  ReviewAuditEntry,
  ReviewQueueItem,
} from './types.js';

// Normalization
export {
  normalizeTransaction,
  normalizeBatch,
  parseAmount,
  parseDate,
  normalizeDescription,
} from './normalize.js';
export type { NormalizeOptions } from './normalize.js';

// Transfer detection
export { detectTransfer, detectTransfersBatch } from './transfer-detector.js';
export type { TransferDetectorOptions } from './transfer-detector.js';

// Categorization
export {
  evaluateCondition,
  applyCategorizationRules,
  sortRules,
  categorizeBatch,
} from './categorization.js';

// Review queue
export {
  shouldEnqueueForReview,
  inferReviewReason,
  createReviewItem,
  resolveReviewItem,
  buildReviewQueue,
} from './review-queue.js';
export type { ReviewQueueOptions } from './review-queue.js';
