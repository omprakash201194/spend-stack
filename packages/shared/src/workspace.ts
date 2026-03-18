/**
 * Family Workspace module for SpendStack.
 *
 * Provides family workspace creation, membership management,
 * and privacy rules for selective account sharing.
 *
 * Privacy scopes:
 *   - 'private'   — only the resource owner can see it
 *   - 'shared'    — workspace members with 'owner' or 'member' role can see it
 *   - 'workspace' — all workspace members (including 'viewer') can see it
 */

import { randomBytes } from 'crypto';
import type { UserId } from './identity.js';

export type WorkspaceId = string;

export type MemberRole = 'owner' | 'member' | 'viewer';

export type PrivacyScope = 'private' | 'shared' | 'workspace';

export type PrivacyResourceType = 'account' | 'transaction' | 'category';

export interface FamilyWorkspace {
  id: WorkspaceId;
  name: string;
  ownerId: UserId;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: WorkspaceId;
  userId: UserId;
  role: MemberRole;
  joinedAt: string;
}

export interface PrivacyRule {
  id: string;
  workspaceId: WorkspaceId;
  resourceType: PrivacyResourceType;
  resourceId: string;
  ownerId: UserId;
  scope: PrivacyScope;
  createdAt: string;
}

export interface CreateWorkspaceInput {
  name: string;
  ownerId: UserId;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a new family workspace and an owner membership for the creator.
 *
 * @example
 * ```ts
 * const { workspace, ownerMembership } = createFamilyWorkspace({ name: 'Smith Family', ownerId: 'u-1' });
 * ```
 */
export function createFamilyWorkspace(input: CreateWorkspaceInput): {
  workspace: FamilyWorkspace;
  ownerMembership: WorkspaceMember;
} {
  if (!input.name.trim()) {
    throw new Error('Workspace name is required');
  }
  if (!input.ownerId) {
    throw new Error('Owner ID is required');
  }

  const now = new Date().toISOString();

  const workspace: FamilyWorkspace = {
    id: randomBytes(16).toString('hex'),
    name: input.name.trim(),
    ownerId: input.ownerId,
    createdAt: now,
    updatedAt: now,
  };

  const ownerMembership: WorkspaceMember = {
    workspaceId: workspace.id,
    userId: input.ownerId,
    role: 'owner',
    joinedAt: now,
  };

  return { workspace, ownerMembership };
}

/**
 * Creates a membership record for a new workspace member.
 * The 'owner' role is reserved for the workspace creator and cannot be assigned here.
 */
export function addWorkspaceMember(
  workspace: FamilyWorkspace,
  userId: UserId,
  role: Exclude<MemberRole, 'owner'> = 'member',
): WorkspaceMember {
  return {
    workspaceId: workspace.id,
    userId,
    role,
    joinedAt: new Date().toISOString(),
  };
}

/**
 * Removes a member from the membership list by user ID.
 * Returns a new array; the original is not mutated.
 * Throws if the user is not a member or if attempting to remove the workspace owner.
 *
 * @example
 * ```ts
 * const updated = removeWorkspaceMember(workspace, members, 'u-2');
 * ```
 */
export function removeWorkspaceMember(
  workspace: FamilyWorkspace,
  members: WorkspaceMember[],
  userId: UserId,
): WorkspaceMember[] {
  const target = members.find((m) => m.userId === userId);
  if (!target) {
    throw new Error(`User ${userId} is not a member of workspace ${workspace.id}`);
  }
  if (userId === workspace.ownerId || target.role === 'owner') {
    throw new Error('Cannot remove the workspace owner');
  }
  return members.filter((m) => m.userId !== userId);
}

/**
 * Returns `true` if the given user is present in the membership list.
 */
export function isWorkspaceMember(members: WorkspaceMember[], userId: UserId): boolean {
  return members.some((m) => m.userId === userId);
}

/**
 * Returns the role of the specified user, or `undefined` if they are not a member.
 */
export function getMemberRole(
  members: WorkspaceMember[],
  userId: UserId,
): MemberRole | undefined {
  return members.find((m) => m.userId === userId)?.role;
}

/**
 * Creates a privacy rule that controls who in the workspace can view a resource.
 *
 * @example
 * ```ts
 * const rule = createPrivacyRule(workspaceId, ownerId, 'account', accountId, 'shared');
 * ```
 */
export function createPrivacyRule(
  workspaceId: WorkspaceId,
  ownerId: UserId,
  resourceType: PrivacyResourceType,
  resourceId: string,
  scope: PrivacyScope,
): PrivacyRule {
  return {
    id: randomBytes(8).toString('hex'),
    workspaceId,
    resourceType,
    resourceId,
    ownerId,
    scope,
    createdAt: new Date().toISOString(),
  };
}

// ── Workspace data scope ──────────────────────────────────────────────────────

/**
 * Scopes a piece of data to a specific workspace, distinguishing personal
 * (single-user) context from shared family-workspace context.
 *
 * Attach this to domain objects (accounts, transactions, …) to enforce
 * per-workspace data isolation and drive visibility logic.
 *
 * - `'personal'`  — data belongs to one user outside any shared workspace
 * - `'workspace'` — data is associated with a family workspace (`workspaceId` is required)
 */
export type WorkspaceContextKind = 'personal' | 'workspace';

export type WorkspaceDataScope =
  | { readonly kind: 'personal'; readonly ownerId: UserId }
  | { readonly kind: 'workspace'; readonly ownerId: UserId; readonly workspaceId: WorkspaceId };

/**
 * Creates a `WorkspaceDataScope` for personal (non-workspace) data.
 *
 * @example
 * ```ts
 * const scope = createWorkspaceDataScope('personal', 'u-1');
 * ```
 */
export function createWorkspaceDataScope(kind: 'personal', ownerId: UserId): WorkspaceDataScope;

/**
 * Creates a `WorkspaceDataScope` for data that belongs to a family workspace.
 *
 * @example
 * ```ts
 * const scope = createWorkspaceDataScope('workspace', 'u-1', workspace.id);
 * ```
 */
export function createWorkspaceDataScope(
  kind: 'workspace',
  ownerId: UserId,
  workspaceId: WorkspaceId,
): WorkspaceDataScope;

export function createWorkspaceDataScope(
  kind: WorkspaceContextKind,
  ownerId: UserId,
  workspaceId?: WorkspaceId,
): WorkspaceDataScope {
  if (typeof ownerId !== 'string' || ownerId.trim().length === 0) {
    throw new Error('Owner ID is required');
  }
  if (kind === 'workspace') {
    if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
      throw new Error('Workspace ID is required for workspace-scoped data');
    }
    return { kind, ownerId: ownerId.trim(), workspaceId: workspaceId.trim() };
  }
  if (kind === 'personal') {
    return { kind, ownerId: ownerId.trim() };
  }
  throw new Error(`Unknown workspace context kind: ${String(kind)}`);
}

/**
 * Returns `true` when the given scope matches the specified workspace or the personal context.
 *
 * Pass `workspaceId` to test for a specific workspace; omit it to test for the personal scope.
 *
 * @example
 * ```ts
 * // personal check
 * scopeMatchesWorkspace(scope, 'u-1')               // true when kind === 'personal' && ownerId === 'u-1'
 * // workspace check
 * scopeMatchesWorkspace(scope, 'u-1', workspace.id) // true when kind === 'workspace' && workspaceId matches
 * ```
 */
export function scopeMatchesWorkspace(
  scope: WorkspaceDataScope,
  ownerId: UserId,
  workspaceId?: WorkspaceId,
): boolean {
  if (scope.ownerId !== ownerId) return false;
  if (workspaceId === undefined) {
    return scope.kind === 'personal';
  }
  return scope.kind === 'workspace' && scope.workspaceId === workspaceId;
}

// ── Workspace store ───────────────────────────────────────────────────────────

/**
 * An in-memory store that holds all workspaces, their membership lists, and
 * privacy rules.
 * Designed for use in the local application layer; persist to SQLite via the
 * database package for durability.
 */
export interface WorkspaceStore {
  /** All workspaces, keyed by workspace ID. */
  readonly workspaces: Readonly<Record<WorkspaceId, FamilyWorkspace>>;
  /**
   * Membership lists, keyed by workspace ID.
   * Each entry is a read-only snapshot of the workspace's current member list.
   */
  readonly memberships: Readonly<Record<WorkspaceId, readonly WorkspaceMember[]>>;
  /**
   * Privacy rules, keyed by workspace ID.
   * Each entry is a read-only snapshot of the workspace's current rules.
   * At most one rule exists per `(resourceType, resourceId)` pair.
   */
  readonly privacyRules: Readonly<Record<WorkspaceId, readonly PrivacyRule[]>>;
}

/**
 * Creates an empty `WorkspaceStore` with no workspaces.
 *
 * @example
 * ```ts
 * const store = createWorkspaceStore();
 * ```
 */
export function createWorkspaceStore(): WorkspaceStore {
  return {
    workspaces: Object.create(null) as Record<WorkspaceId, FamilyWorkspace>,
    memberships: Object.create(null) as Record<WorkspaceId, WorkspaceMember[]>,
    privacyRules: Object.create(null) as Record<WorkspaceId, PrivacyRule[]>,
  };
}

/**
 * Adds a workspace (and its initial owner membership) to the store.
 * Returns a new `WorkspaceStore`; the original is not mutated.
 * Throws if a workspace with the same ID already exists, or if `ownerMembership`
 * does not match the workspace (wrong workspaceId, userId, or role).
 */
export function addWorkspaceToStore(
  store: WorkspaceStore,
  workspace: FamilyWorkspace,
  ownerMembership: WorkspaceMember,
): WorkspaceStore {
  if (Object.hasOwn(store.workspaces, workspace.id)) {
    throw new Error(`Workspace with ID ${workspace.id} already exists`);
  }
  if (ownerMembership.workspaceId !== workspace.id) {
    throw new Error('ownerMembership.workspaceId must match the workspace ID');
  }
  if (ownerMembership.userId !== workspace.ownerId) {
    throw new Error('ownerMembership.userId must match the workspace ownerId');
  }
  if (ownerMembership.role !== 'owner') {
    throw new Error('ownerMembership.role must be "owner"');
  }
  const workspaces = Object.assign(
    Object.create(null) as Record<WorkspaceId, FamilyWorkspace>,
    store.workspaces,
    { [workspace.id]: workspace },
  );
  const memberships = Object.assign(
    Object.create(null) as Record<WorkspaceId, WorkspaceMember[]>,
    store.memberships,
    { [workspace.id]: [ownerMembership] },
  );
  return { ...store, workspaces, memberships };
}

/**
 * Returns the workspace with the given ID, or `undefined` if not found.
 */
export function getWorkspaceById(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
): FamilyWorkspace | undefined {
  return Object.hasOwn(store.workspaces, workspaceId)
    ? store.workspaces[workspaceId]
    : undefined;
}

/**
 * Returns all workspaces as an array.
 */
export function listWorkspaces(store: WorkspaceStore): FamilyWorkspace[] {
  return Object.values(store.workspaces);
}

/**
 * Returns the current member list for the given workspace, or an empty array
 * if the workspace is not found.
 */
export function getMembersForWorkspace(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
): WorkspaceMember[] {
  return Object.hasOwn(store.memberships, workspaceId)
    ? [...store.memberships[workspaceId]]
    : [];
}

/**
 * Adds a member to the membership list for the specified workspace.
 * Returns a new `WorkspaceStore`; the original is not mutated.
 * Throws if the workspace is not found, the user is already a member, or
 * `member.workspaceId` does not match the target workspace.
 */
export function addMemberToWorkspaceStore(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
  member: WorkspaceMember,
): WorkspaceStore {
  if (!Object.hasOwn(store.workspaces, workspaceId)) {
    throw new Error(`Workspace with ID ${workspaceId} not found`);
  }
  if (member.workspaceId !== workspaceId) {
    throw new Error(
      `member.workspaceId (${member.workspaceId}) does not match target workspace (${workspaceId})`,
    );
  }
  const existing = store.memberships[workspaceId] ?? [];
  if (existing.some((m) => m.userId === member.userId)) {
    throw new Error(`User ${member.userId} is already a member of workspace ${workspaceId}`);
  }
  const memberships = Object.assign(
    Object.create(null) as Record<WorkspaceId, WorkspaceMember[]>,
    store.memberships,
    { [workspaceId]: [...existing, member] },
  );
  return { ...store, memberships };
}

/**
 * Removes a member from the membership list for the specified workspace.
 * Returns a new `WorkspaceStore`; the original is not mutated.
 * Throws if the workspace is not found, the user is not a member, or the user
 * is the workspace owner.
 */
export function removeMemberFromWorkspaceStore(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
  userId: UserId,
): WorkspaceStore {
  if (!Object.hasOwn(store.workspaces, workspaceId)) {
    throw new Error(`Workspace with ID ${workspaceId} not found`);
  }
  const workspace = store.workspaces[workspaceId];
  const existing = store.memberships[workspaceId] ?? [];
  const updated = removeWorkspaceMember(workspace, existing, userId);
  const memberships = Object.assign(
    Object.create(null) as Record<WorkspaceId, WorkspaceMember[]>,
    store.memberships,
    { [workspaceId]: updated },
  );
  return { ...store, memberships };
}

/**
 * Determines whether `requestingUserId` can see a resource governed by the given privacy rule.
 *
 * | scope       | who can see                                    |
 * |-------------|------------------------------------------------|
 * | `private`   | owner only                                     |
 * | `shared`    | owner + members with 'owner' or 'member' role  |
 * | `workspace` | all workspace members (including 'viewer')     |
 *
 * When `rule` is `undefined` the resource is treated as private (only the owner can see it).
 * When the requesting user is not a workspace member they are always denied.
 */
export function resolveVisibility(
  rule: PrivacyRule | undefined,
  requestingUserId: UserId,
  members: WorkspaceMember[],
): boolean {
  if (!rule) {
    // No rule ⇒ private by default; allow access only to the resource owner
    return false;
  }

  // Owner always has access to their own resources
  if (rule.ownerId === requestingUserId) {
    return true;
  }

  const role = getMemberRole(members, requestingUserId);

  switch (rule.scope) {
    case 'private':
      // Only the owner — already handled above
      return false;

    case 'shared':
      // Members with elevated roles
      return role === 'owner' || role === 'member';

    case 'workspace':
      // Any workspace member
      return role !== undefined;
  }
}

// ── Explicit access policy evaluation ────────────────────────────────────────

/**
 * The outcome of an access-policy evaluation.
 * `'allowed'` means the requesting user may see the resource.
 * `'denied'` means they may not; the `reason` field explains why.
 */
export type AccessPolicyDecision = 'allowed' | 'denied';

/**
 * Structured reason for an access denial — suitable for audit logging.
 *
 * | reason          | meaning                                              |
 * |-----------------|------------------------------------------------------|
 * | `no_rule`       | no privacy rule exists for this resource             |
 * | `not_member`    | requester is not a member of the workspace           |
 * | `scope_private` | rule scope is 'private' and requester is not owner   |
 * | `scope_shared`  | rule scope is 'shared' and requester lacks elevation |
 */
export type AccessPolicyDenialReason =
  | 'no_rule'
  | 'not_member'
  | 'scope_private'
  | 'scope_shared';

export interface AccessPolicyResult {
  decision: AccessPolicyDecision;
  /** Present only when `decision` is `'denied'`. */
  reason?: AccessPolicyDenialReason;
}

/**
 * Evaluates the access policy for a single resource explicitly.
 *
 * Prefer this function over `resolveVisibility` wherever an auditable,
 * structured result is required (e.g. before returning data from a service
 * or recording a `privacy.access_denied` audit event).
 *
 * @example
 * ```ts
 * const result = evaluateAccessPolicy(rule, requestingUserId, members);
 * if (result.decision === 'denied') {
 *   // emit audit event with result.reason
 * }
 * ```
 */
export function evaluateAccessPolicy(
  rule: PrivacyRule | undefined,
  requestingUserId: UserId,
  members: WorkspaceMember[],
): AccessPolicyResult {
  if (!rule) {
    return { decision: 'denied', reason: 'no_rule' };
  }

  if (rule.ownerId === requestingUserId) {
    return { decision: 'allowed' };
  }

  const role = getMemberRole(members, requestingUserId);

  if (role === undefined) {
    return { decision: 'denied', reason: 'not_member' };
  }

  switch (rule.scope) {
    case 'private':
      return { decision: 'denied', reason: 'scope_private' };

    case 'shared':
      if (role === 'owner' || role === 'member') {
        return { decision: 'allowed' };
      }
      return { decision: 'denied', reason: 'scope_shared' };

    case 'workspace':
      return { decision: 'allowed' };
  }
}

/**
 * Filters `items` to those visible to `requestingUserId` according to the
 * supplied privacy rules and workspace membership.
 *
 * `getId` maps each item to its resource ID so that the matching privacy rule
 * can be located. Items with no matching rule are treated as having no rule
 * (denied by default).
 *
 * Typical use: apply before returning a list of accounts or transactions to
 * a UI component or service API response.
 *
 * @example
 * ```ts
 * const visible = filterVisibleResources(
 *   accounts,
 *   (a) => a.id,
 *   rules,
 *   requestingUserId,
 *   members,
 * );
 * ```
 */
export function filterVisibleResources<T>(
  items: T[],
  getId: (item: T) => string,
  rules: PrivacyRule[],
  requestingUserId: UserId,
  members: WorkspaceMember[],
): T[] {
  const ruleMap = new Map(rules.map((r) => [r.resourceId, r]));
  return items.filter(
    (item) =>
      evaluateAccessPolicy(ruleMap.get(getId(item)), requestingUserId, members).decision ===
      'allowed',
  );
}

// ── Privacy rule store ────────────────────────────────────────────────────────

/**
 * Adds a privacy rule to the store for the specified workspace.
 * If a rule already exists for the same `(resourceType, resourceId)` pair it
 * is replaced (upsert semantics — one rule per resource).
 * Returns a new `WorkspaceStore`; the original is not mutated.
 * Throws if the workspace is not found.
 */
export function addPrivacyRuleToStore(
  store: WorkspaceStore,
  rule: PrivacyRule,
): WorkspaceStore {
  if (!Object.hasOwn(store.workspaces, rule.workspaceId)) {
    throw new Error(`Workspace with ID ${rule.workspaceId} not found`);
  }
  const existing = store.privacyRules[rule.workspaceId] ?? [];
  // Replace any existing rule for the same resource (upsert)
  const replaced = existing.filter(
    (r) => !(r.resourceType === rule.resourceType && r.resourceId === rule.resourceId),
  );
  const privacyRules = Object.assign(
    Object.create(null) as Record<WorkspaceId, PrivacyRule[]>,
    store.privacyRules,
    { [rule.workspaceId]: [...replaced, rule] },
  );
  return { ...store, privacyRules };
}

/**
 * Removes a privacy rule from the store by rule ID.
 * Returns a new `WorkspaceStore`; the original is not mutated.
 * Throws if the workspace is not found or the rule does not exist.
 */
export function removePrivacyRuleFromStore(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
  ruleId: string,
): WorkspaceStore {
  if (!Object.hasOwn(store.workspaces, workspaceId)) {
    throw new Error(`Workspace with ID ${workspaceId} not found`);
  }
  const existing = store.privacyRules[workspaceId] ?? [];
  if (!existing.some((r) => r.id === ruleId)) {
    throw new Error(`Privacy rule ${ruleId} not found in workspace ${workspaceId}`);
  }
  const privacyRules = Object.assign(
    Object.create(null) as Record<WorkspaceId, PrivacyRule[]>,
    store.privacyRules,
    { [workspaceId]: existing.filter((r) => r.id !== ruleId) },
  );
  return { ...store, privacyRules };
}

/**
 * Returns all privacy rules for the specified workspace as an array.
 * Returns an empty array if no rules exist.
 */
export function getPrivacyRulesForWorkspace(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
): PrivacyRule[] {
  return Object.hasOwn(store.privacyRules, workspaceId)
    ? [...store.privacyRules[workspaceId]]
    : [];
}

/**
 * Returns the privacy rule for a specific resource, or `undefined` if none exists.
 */
export function getPrivacyRuleForResource(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
  resourceType: PrivacyResourceType,
  resourceId: string,
): PrivacyRule | undefined {
  const rules = store.privacyRules[workspaceId] ?? [];
  return rules.find((r) => r.resourceType === resourceType && r.resourceId === resourceId);
}
