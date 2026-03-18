export { createLogger, redact } from './logger.js';
export type { Logger, LogEntry, LogLevel, LoggerOptions } from './logger.js';

export { createFlagResolver, flags, FEATURE_FLAGS } from './feature-flags.js';
export type { FeatureFlagName, FeatureFlagValue, FlagResolver } from './feature-flags.js';

export {
  createUserProfile,
  authenticateWithPassword,
  setPin,
  verifyPin,
  removePin,
  toPublicProfile,
  createProfileStore,
  addProfileToStore,
  removeProfileFromStore,
  listProfiles,
  getProfileById,
  switchActiveProfile,
  getActiveProfile,
  createProfileDataScope,
  scopeMatchesProfile,
  createSession,
  isSessionValid,
  invalidateSession,
  serializeSession,
  deserializeSession,
} from './identity.js';
export type {
  UserId,
  UserProfile,
  PublicUserProfile,
  CreateProfileInput,
  AuthResult,
  ProfileStore,
  ProfileDataScope,
  AuthSession,
  CreateSessionOptions,
} from './identity.js';

export {
  createFamilyWorkspace,
  addWorkspaceMember,
  isWorkspaceMember,
  getMemberRole,
  createPrivacyRule,
  resolveVisibility,
} from './workspace.js';
export type {
  WorkspaceId,
  MemberRole,
  PrivacyScope,
  PrivacyResourceType,
  FamilyWorkspace,
  WorkspaceMember,
  PrivacyRule,
  CreateWorkspaceInput,
} from './workspace.js';

export {
  createAuditEvent,
  appendAuditEvent,
  formatAuditHistory,
  AUDIT_SCHEMA_VERSION,
} from './audit.js';
export type {
  AuditSchemaVersion,
  AuditEventType,
  AuditEvent,
  AuditLog,
} from './audit.js';

export { buildDiagnosticsBundle } from './diagnostics.js';
export type {
  RuntimeInfo,
  AuditSummary,
  DiagnosticsBundle,
  BuildDiagnosticsBundleOptions,
} from './diagnostics.js';

export {
  computeBalanceSummary,
  computeCashflowSummary,
  createInsightConsent,
  revokeInsightConsent,
  hasInsightConsent,
  canRunAiInsights,
  INSIGHT_CONSENT_SCHEMA_VERSION,
} from './insights.js';
export type {
  InsightTransaction,
  BalanceSummary,
  BalanceSummaryOptions,
  CashflowSummary,
  CashflowSummaryOptions,
  InsightConsentSchemaVersion,
  InsightConsentScope,
  InsightDataScope,
  InsightConsent,
  CreateInsightConsentParams,
} from './insights.js';
