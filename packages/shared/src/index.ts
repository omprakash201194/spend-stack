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
} from './identity.js';
export type {
  UserId,
  UserProfile,
  PublicUserProfile,
  CreateProfileInput,
  AuthResult,
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
