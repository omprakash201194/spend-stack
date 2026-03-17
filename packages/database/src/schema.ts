/**
 * TypeScript type definitions for the SpendStack SQLite database schema.
 *
 * These types mirror the entity model described in the technical specification
 * (section 6.2) and serve as the authoritative source of truth for table
 * shapes used across the application.
 *
 * Column naming follows snake_case to match SQLite conventions.
 */

// ---------------------------------------------------------------------------
// Identity & Access
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'suspended' | 'deleted';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  pin_hash: string | null;
  recovery_key_hash: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  status: UserStatus;
}

// ---------------------------------------------------------------------------
// Workspace & Family
// ---------------------------------------------------------------------------

export type WorkspaceStatus = 'active' | 'archived';
export type WorkspaceMemberRole = 'owner' | 'adult_member' | 'viewer';
export type WorkspaceMemberStatus = 'active' | 'removed';

export interface FamilyWorkspace {
  id: string;
  name: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  status: WorkspaceStatus;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceMemberRole;
  joined_at: string;
  status: WorkspaceMemberStatus;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export type AccountVisibility = 'private' | 'workspace_shared' | 'selected_members';

export interface Account {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  bank_name: string;
  account_type: string;
  display_name: string;
  masked_account_number: string;
  encrypted_account_number: string;
  currency: string;
  sharing_visibility: AccountVisibility;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface AccountVisibilityGrant {
  id: string;
  account_id: string;
  granted_to_user_id: string;
  granted_by_user_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Statement Import
// ---------------------------------------------------------------------------

export type FileType = 'pdf' | 'csv' | 'xlsx';
export type RetentionPolicy = 'auto_delete' | 'keep';
export type DeletionStatus = 'pending' | 'deleted' | 'skipped';

/** Represents an uploaded original bank statement file. */
export interface StatementFile {
  id: string;
  workspace_id: string;
  uploaded_by_user_id: string;
  account_id: string | null;
  source_bank: string;
  file_name: string;
  file_type: FileType;
  file_size_bytes: number;
  storage_path: string;
  retention_policy: RetentionPolicy;
  /** ISO timestamp after which the file should be deleted. */
  delete_after_at: string | null;
  deletion_status: DeletionStatus;
  keep_original_requested: boolean;
  created_at: string;
}

export type ImportJobStatus =
  | 'uploaded'
  | 'parsing'
  | 'review_required'
  | 'finalized'
  | 'failed'
  | 'cancelled';

/** Represents one processing run for a statement import. */
export interface ImportJob {
  id: string;
  statement_file_id: string;
  parser_id: string;
  parser_version: string;
  import_status: ImportJobStatus;
  started_at: string;
  completed_at: string | null;
  total_rows_detected: number;
  rows_parsed: number;
  rows_flagged_for_review: number;
  duplicate_rows_skipped: number;
  duplicate_rows_overridden: number;
  error_summary: string | null;
  initiated_by_user_id: string;
}

/** Stores the raw row/line extracted from the source statement. */
export interface RawStatementRow {
  id: string;
  import_job_id: string;
  statement_file_id: string;
  source_reference: string;
  raw_text: string;
  extracted_date_text: string;
  extracted_amount_text: string;
  extracted_description_text: string;
  extraction_metadata_json: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export type TransactionDirection = 'debit' | 'credit';
export type ReviewStatus = 'pending' | 'approved' | 'corrected';
export type DuplicateStatus = 'unique' | 'skipped_duplicate' | 'imported_override';
export type LifecycleStatus = 'active' | 'excluded' | 'deleted';

export interface Transaction {
  id: string;
  workspace_id: string;
  account_id: string;
  owner_user_id: string;
  import_job_id: string;
  raw_statement_row_id: string;
  transaction_date: string;
  posted_date: string | null;
  amount: number;
  direction: TransactionDirection;
  merchant_display: string;
  description_normalized: string;
  category_id: string | null;
  subcategory_id: string | null;
  transaction_type: string;
  transfer_group_id: string | null;
  recurrence_group_id: string | null;
  confidence_score: number;
  review_status: ReviewStatus;
  duplicate_status: DuplicateStatus;
  lifecycle_status: LifecycleStatus;
  source_bank: string;
  source_statement_id: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Categories & Rules
// ---------------------------------------------------------------------------

export type CategoryKind = 'expense' | 'income' | 'transfer' | 'other';

export interface Category {
  id: string;
  workspace_id: string | null;
  name: string;
  parent_category_id: string | null;
  category_kind: CategoryKind;
  color_token: string;
  icon_token: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export type RuleScope = 'personal' | 'workspace_shared' | 'system_builtin';
export type MatchType = 'contains' | 'exact' | 'regex' | 'amount_range';
export type RuleActionType = 'set_category' | 'set_subcategory';

export interface CategorizationRule {
  id: string;
  workspace_id: string;
  created_by_user_id: string;
  name: string;
  priority: number;
  rule_scope: RuleScope;
  match_type: MatchType;
  match_expression: string;
  target_category_id: string;
  target_subcategory_id: string | null;
  action_type: RuleActionType;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Review Queue
// ---------------------------------------------------------------------------

export type ReviewQueueReason =
  | 'low_confidence_parse'
  | 'duplicate_conflict'
  | 'ambiguous_transfer'
  | 'missing_date'
  | 'missing_amount'
  | 'parser_warning';

export type ReviewQueueStatus = 'pending' | 'resolved' | 'skipped';

export interface ReviewQueueItem {
  id: string;
  import_job_id: string;
  transaction_id: string | null;
  raw_statement_row_id: string;
  queue_reason: ReviewQueueReason;
  suggested_fix_json: string | null;
  assigned_user_id: string | null;
  status: ReviewQueueStatus;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

// ---------------------------------------------------------------------------
// Transfer & Recurrence
// ---------------------------------------------------------------------------

export type TransferDetectionMethod = 'automatic' | 'manual';
export type TransferStatus = 'confirmed' | 'pending_review' | 'rejected';

export interface TransferLink {
  id: string;
  workspace_id: string;
  debit_transaction_id: string;
  credit_transaction_id: string;
  detection_method: TransferDetectionMethod;
  confidence_score: number;
  status: TransferStatus;
  created_at: string;
}

export type RecurrenceType = 'expense' | 'income';

export interface RecurrenceGroup {
  id: string;
  workspace_id: string;
  recurrence_type: RecurrenceType;
  merchant_fingerprint: string;
  average_amount: number;
  cadence: string;
  last_detected_at: string;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Analytics & Insights
// ---------------------------------------------------------------------------

export interface InsightSnapshot {
  id: string;
  workspace_id: string;
  snapshot_type: string;
  period_start: string;
  period_end: string;
  payload_json: string;
  generated_by: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Consent & Audit
// ---------------------------------------------------------------------------

export interface ConsentRecord {
  id: string;
  user_id: string;
  consent_type: string;
  consent_version: string;
  granted: boolean;
  granted_at: string;
  revoked_at: string | null;
  metadata_json: string | null;
}

export interface AuditEvent {
  id: string;
  workspace_id: string;
  actor_user_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
  source_type: string;
  reason_code: string | null;
  before_json: string | null;
  after_json: string | null;
  explanation_text: string | null;
  correlation_id: string | null;
}

// ---------------------------------------------------------------------------
// Settings & Feature Flags
// ---------------------------------------------------------------------------

export interface FeatureFlagOverride {
  id: string;
  flag_name: string;
  enabled: boolean;
  updated_at: string;
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at: string;
}
