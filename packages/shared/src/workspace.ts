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
