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
  if (target.role === 'owner') {
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
 * - `'workspace'` — data is associated with a family workspace (`workspaceId` is set)
 */
export type WorkspaceContextKind = 'personal' | 'workspace';

export interface WorkspaceDataScope {
  readonly kind: WorkspaceContextKind;
  /** Present when `kind === 'workspace'`. */
  readonly workspaceId?: WorkspaceId;
  /** The user who owns the scoped data. */
  readonly ownerId: UserId;
}

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
  if (!ownerId) {
    throw new Error('Owner ID is required');
  }
  if (kind === 'workspace') {
    if (!workspaceId) {
      throw new Error('Workspace ID is required for workspace-scoped data');
    }
    return { kind, ownerId, workspaceId };
  }
  return { kind, ownerId };
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
 * An in-memory store that holds all workspaces and their membership lists.
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
  };
}

/**
 * Adds a workspace (and its initial owner membership) to the store.
 * Returns a new `WorkspaceStore`; the original is not mutated.
 * Throws if a workspace with the same ID already exists.
 */
export function addWorkspaceToStore(
  store: WorkspaceStore,
  workspace: FamilyWorkspace,
  ownerMembership: WorkspaceMember,
): WorkspaceStore {
  if (Object.hasOwn(store.workspaces, workspace.id)) {
    throw new Error(`Workspace with ID ${workspace.id} already exists`);
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
  return { workspaces, memberships };
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
 * Throws if the workspace is not found or if the user is already a member.
 */
export function addMemberToWorkspaceStore(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
  member: WorkspaceMember,
): WorkspaceStore {
  if (!Object.hasOwn(store.workspaces, workspaceId)) {
    throw new Error(`Workspace with ID ${workspaceId} not found`);
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
