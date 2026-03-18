import { describe, it, expect } from 'vitest';
import {
  createFamilyWorkspace,
  addWorkspaceMember,
  removeWorkspaceMember,
  isWorkspaceMember,
  getMemberRole,
  createPrivacyRule,
  resolveVisibility,
  createWorkspaceDataScope,
  scopeMatchesWorkspace,
  createWorkspaceStore,
  addWorkspaceToStore,
  getWorkspaceById,
  listWorkspaces,
  getMembersForWorkspace,
  addMemberToWorkspaceStore,
  removeMemberFromWorkspaceStore,
} from './workspace.js';

describe('createFamilyWorkspace', () => {
  it('creates a workspace with the correct name and owner', () => {
    const { workspace } = createFamilyWorkspace({ name: 'Smith Family', ownerId: 'u-1' });
    expect(workspace.name).toBe('Smith Family');
    expect(workspace.ownerId).toBe('u-1');
  });

  it('assigns a non-empty unique id', () => {
    const { workspace: a } = createFamilyWorkspace({ name: 'A', ownerId: 'u-1' });
    const { workspace: b } = createFamilyWorkspace({ name: 'B', ownerId: 'u-2' });
    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('sets createdAt and updatedAt as ISO timestamps', () => {
    const { workspace } = createFamilyWorkspace({ name: 'Test', ownerId: 'u-1' });
    expect(workspace.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(workspace.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns an owner membership with role "owner"', () => {
    const { workspace, ownerMembership } = createFamilyWorkspace({
      name: 'Family',
      ownerId: 'u-99',
    });
    expect(ownerMembership.role).toBe('owner');
    expect(ownerMembership.userId).toBe('u-99');
    expect(ownerMembership.workspaceId).toBe(workspace.id);
  });

  it('trims whitespace from workspace name', () => {
    const { workspace } = createFamilyWorkspace({ name: '  Trimmed  ', ownerId: 'u-1' });
    expect(workspace.name).toBe('Trimmed');
  });

  it('throws when name is empty', () => {
    expect(() => createFamilyWorkspace({ name: '   ', ownerId: 'u-1' })).toThrow(
      'Workspace name is required',
    );
  });

  it('throws when ownerId is empty', () => {
    expect(() => createFamilyWorkspace({ name: 'Family', ownerId: '' })).toThrow(
      'Owner ID is required',
    );
  });
});

describe('addWorkspaceMember', () => {
  function makeWorkspace() {
    return createFamilyWorkspace({ name: 'Test WS', ownerId: 'u-owner' }).workspace;
  }

  it('creates a membership with the default "member" role', () => {
    const ws = makeWorkspace();
    const membership = addWorkspaceMember(ws, 'u-2');
    expect(membership.role).toBe('member');
    expect(membership.userId).toBe('u-2');
    expect(membership.workspaceId).toBe(ws.id);
  });

  it('creates a membership with "viewer" role when specified', () => {
    const ws = makeWorkspace();
    const membership = addWorkspaceMember(ws, 'u-3', 'viewer');
    expect(membership.role).toBe('viewer');
  });

  it('sets joinedAt as an ISO timestamp', () => {
    const ws = makeWorkspace();
    const membership = addWorkspaceMember(ws, 'u-4');
    expect(membership.joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('isWorkspaceMember', () => {
  it('returns true for a user present in the list', () => {
    const { workspace, ownerMembership } = createFamilyWorkspace({
      name: 'WS',
      ownerId: 'u-1',
    });
    const member = addWorkspaceMember(workspace, 'u-2');
    expect(isWorkspaceMember([ownerMembership, member], 'u-2')).toBe(true);
  });

  it('returns false for a user not in the list', () => {
    const { ownerMembership } = createFamilyWorkspace({ name: 'WS', ownerId: 'u-1' });
    expect(isWorkspaceMember([ownerMembership], 'u-99')).toBe(false);
  });
});

describe('getMemberRole', () => {
  it('returns the role for a known member', () => {
    const { workspace, ownerMembership } = createFamilyWorkspace({ name: 'WS', ownerId: 'u-1' });
    const viewer = addWorkspaceMember(workspace, 'u-2', 'viewer');
    expect(getMemberRole([ownerMembership, viewer], 'u-2')).toBe('viewer');
    expect(getMemberRole([ownerMembership, viewer], 'u-1')).toBe('owner');
  });

  it('returns undefined for a non-member', () => {
    const { ownerMembership } = createFamilyWorkspace({ name: 'WS', ownerId: 'u-1' });
    expect(getMemberRole([ownerMembership], 'u-99')).toBeUndefined();
  });
});

describe('createPrivacyRule', () => {
  it('creates a rule with all expected fields', () => {
    const rule = createPrivacyRule('ws-1', 'u-1', 'account', 'acc-1', 'shared');
    expect(rule.workspaceId).toBe('ws-1');
    expect(rule.ownerId).toBe('u-1');
    expect(rule.resourceType).toBe('account');
    expect(rule.resourceId).toBe('acc-1');
    expect(rule.scope).toBe('shared');
    expect(rule.id).toBeTruthy();
    expect(rule.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('assigns unique ids to each rule', () => {
    const r1 = createPrivacyRule('ws-1', 'u-1', 'account', 'acc-1', 'private');
    const r2 = createPrivacyRule('ws-1', 'u-1', 'account', 'acc-2', 'private');
    expect(r1.id).not.toBe(r2.id);
  });
});

describe('resolveVisibility', () => {
  function makeMembers() {
    const { workspace, ownerMembership } = createFamilyWorkspace({ name: 'WS', ownerId: 'u-owner' });
    const member = addWorkspaceMember(workspace, 'u-member');
    const viewer = addWorkspaceMember(workspace, 'u-viewer', 'viewer');
    return { workspace, members: [ownerMembership, member, viewer] };
  }

  it('owner can always see their own private resource', () => {
    const { workspace, members } = makeMembers();
    const rule = createPrivacyRule(workspace.id, 'u-owner', 'account', 'acc-1', 'private');
    expect(resolveVisibility(rule, 'u-owner', members)).toBe(true);
  });

  it('non-owner cannot see a private resource', () => {
    const { workspace, members } = makeMembers();
    const rule = createPrivacyRule(workspace.id, 'u-owner', 'account', 'acc-1', 'private');
    expect(resolveVisibility(rule, 'u-member', members)).toBe(false);
    expect(resolveVisibility(rule, 'u-viewer', members)).toBe(false);
  });

  it('shared scope: member and owner can see, viewer cannot', () => {
    const { workspace, members } = makeMembers();
    const rule = createPrivacyRule(workspace.id, 'u-owner', 'account', 'acc-1', 'shared');
    expect(resolveVisibility(rule, 'u-owner', members)).toBe(true);
    expect(resolveVisibility(rule, 'u-member', members)).toBe(true);
    expect(resolveVisibility(rule, 'u-viewer', members)).toBe(false);
  });

  it('workspace scope: all members including viewer can see', () => {
    const { workspace, members } = makeMembers();
    const rule = createPrivacyRule(workspace.id, 'u-owner', 'account', 'acc-1', 'workspace');
    expect(resolveVisibility(rule, 'u-owner', members)).toBe(true);
    expect(resolveVisibility(rule, 'u-member', members)).toBe(true);
    expect(resolveVisibility(rule, 'u-viewer', members)).toBe(true);
  });

  it('non-workspace-member cannot see workspace-scoped resource', () => {
    const { workspace, members } = makeMembers();
    const rule = createPrivacyRule(workspace.id, 'u-owner', 'account', 'acc-1', 'workspace');
    expect(resolveVisibility(rule, 'u-outsider', members)).toBe(false);
  });

  it('returns false when rule is undefined (default private)', () => {
    const { members } = makeMembers();
    expect(resolveVisibility(undefined, 'u-member', members)).toBe(false);
  });
});

describe('removeWorkspaceMember', () => {
  function makeSetup() {
    const { workspace, ownerMembership } = createFamilyWorkspace({ name: 'WS', ownerId: 'u-owner' });
    const member = addWorkspaceMember(workspace, 'u-member');
    const viewer = addWorkspaceMember(workspace, 'u-viewer', 'viewer');
    return { workspace, members: [ownerMembership, member, viewer] };
  }

  it('removes a member from the list', () => {
    const { workspace, members } = makeSetup();
    const updated = removeWorkspaceMember(workspace, members, 'u-member');
    expect(updated.some((m) => m.userId === 'u-member')).toBe(false);
    expect(updated).toHaveLength(2);
  });

  it('removes a viewer from the list', () => {
    const { workspace, members } = makeSetup();
    const updated = removeWorkspaceMember(workspace, members, 'u-viewer');
    expect(updated.some((m) => m.userId === 'u-viewer')).toBe(false);
    expect(updated).toHaveLength(2);
  });

  it('does not mutate the original members array', () => {
    const { workspace, members } = makeSetup();
    removeWorkspaceMember(workspace, members, 'u-member');
    expect(members).toHaveLength(3);
  });

  it('throws when the user is not a member', () => {
    const { workspace, members } = makeSetup();
    expect(() => removeWorkspaceMember(workspace, members, 'u-outsider')).toThrow(
      'is not a member',
    );
  });

  it('throws when attempting to remove the workspace owner', () => {
    const { workspace, members } = makeSetup();
    expect(() => removeWorkspaceMember(workspace, members, 'u-owner')).toThrow(
      'Cannot remove the workspace owner',
    );
  });
});

describe('WorkspaceDataScope', () => {
  it('createWorkspaceDataScope: personal scope has kind personal and ownerId', () => {
    const scope = createWorkspaceDataScope('personal', 'u-1');
    expect(scope.kind).toBe('personal');
    expect(scope.ownerId).toBe('u-1');
    expect(scope.workspaceId).toBeUndefined();
  });

  it('createWorkspaceDataScope: workspace scope includes workspaceId', () => {
    const scope = createWorkspaceDataScope('workspace', 'u-1', 'ws-42');
    expect(scope.kind).toBe('workspace');
    expect(scope.ownerId).toBe('u-1');
    expect(scope.workspaceId).toBe('ws-42');
  });

  it('createWorkspaceDataScope: throws when ownerId is empty', () => {
    expect(() => createWorkspaceDataScope('personal', '')).toThrow('Owner ID is required');
  });

  it('createWorkspaceDataScope: throws when workspaceId missing for workspace kind', () => {
    expect(() => createWorkspaceDataScope('workspace', 'u-1', undefined as unknown as string)).toThrow(
      'Workspace ID is required',
    );
  });

  it('scopeMatchesWorkspace: personal scope matches personal check', () => {
    const scope = createWorkspaceDataScope('personal', 'u-1');
    expect(scopeMatchesWorkspace(scope, 'u-1')).toBe(true);
  });

  it('scopeMatchesWorkspace: personal scope does not match workspace check', () => {
    const scope = createWorkspaceDataScope('personal', 'u-1');
    expect(scopeMatchesWorkspace(scope, 'u-1', 'ws-1')).toBe(false);
  });

  it('scopeMatchesWorkspace: workspace scope matches the correct workspace', () => {
    const scope = createWorkspaceDataScope('workspace', 'u-1', 'ws-42');
    expect(scopeMatchesWorkspace(scope, 'u-1', 'ws-42')).toBe(true);
  });

  it('scopeMatchesWorkspace: workspace scope does not match a different workspace', () => {
    const scope = createWorkspaceDataScope('workspace', 'u-1', 'ws-42');
    expect(scopeMatchesWorkspace(scope, 'u-1', 'ws-99')).toBe(false);
  });

  it('scopeMatchesWorkspace: returns false for wrong owner', () => {
    const scope = createWorkspaceDataScope('personal', 'u-1');
    expect(scopeMatchesWorkspace(scope, 'u-2')).toBe(false);
  });
});

describe('WorkspaceStore', () => {
  function makePopulatedStore() {
    const { workspace, ownerMembership } = createFamilyWorkspace({ name: 'Family', ownerId: 'u-owner' });
    const store = addWorkspaceToStore(createWorkspaceStore(), workspace, ownerMembership);
    return { store, workspace, ownerMembership };
  }

  it('createWorkspaceStore: creates an empty store', () => {
    const store = createWorkspaceStore();
    expect(listWorkspaces(store)).toHaveLength(0);
  });

  it('addWorkspaceToStore: adds a workspace and its owner membership', () => {
    const { store, workspace } = makePopulatedStore();
    expect(getWorkspaceById(store, workspace.id)).toMatchObject({ name: 'Family' });
    expect(getMembersForWorkspace(store, workspace.id)).toHaveLength(1);
    expect(getMembersForWorkspace(store, workspace.id)[0].role).toBe('owner');
  });

  it('addWorkspaceToStore: throws on duplicate workspace ID', () => {
    const { store, workspace, ownerMembership } = makePopulatedStore();
    expect(() => addWorkspaceToStore(store, workspace, ownerMembership)).toThrow('already exists');
  });

  it('addWorkspaceToStore: does not mutate the original store', () => {
    const base = createWorkspaceStore();
    const { workspace, ownerMembership } = createFamilyWorkspace({ name: 'WS', ownerId: 'u-1' });
    addWorkspaceToStore(base, workspace, ownerMembership);
    expect(listWorkspaces(base)).toHaveLength(0);
  });

  it('listWorkspaces: returns all workspaces', () => {
    const { workspace: ws1, ownerMembership: om1 } = createFamilyWorkspace({ name: 'A', ownerId: 'u-1' });
    const { workspace: ws2, ownerMembership: om2 } = createFamilyWorkspace({ name: 'B', ownerId: 'u-2' });
    let store = createWorkspaceStore();
    store = addWorkspaceToStore(store, ws1, om1);
    store = addWorkspaceToStore(store, ws2, om2);
    expect(listWorkspaces(store)).toHaveLength(2);
  });

  it('getWorkspaceById: returns undefined for unknown ID', () => {
    const store = createWorkspaceStore();
    expect(getWorkspaceById(store, 'no-such-id')).toBeUndefined();
  });

  it('getMembersForWorkspace: returns empty array for unknown workspace', () => {
    const store = createWorkspaceStore();
    expect(getMembersForWorkspace(store, 'unknown')).toEqual([]);
  });

  it('addMemberToWorkspaceStore: adds a new member', () => {
    const { store, workspace } = makePopulatedStore();
    const newMember = addWorkspaceMember(workspace, 'u-new');
    const updated = addMemberToWorkspaceStore(store, workspace.id, newMember);
    expect(getMembersForWorkspace(updated, workspace.id)).toHaveLength(2);
  });

  it('addMemberToWorkspaceStore: throws for unknown workspace', () => {
    const { store } = makePopulatedStore();
    const { workspace: other } = createFamilyWorkspace({ name: 'Other', ownerId: 'u-x' });
    const m = addWorkspaceMember(other, 'u-y');
    expect(() => addMemberToWorkspaceStore(store, 'no-such-ws', m)).toThrow('not found');
  });

  it('addMemberToWorkspaceStore: throws on duplicate user', () => {
    const { store, workspace, ownerMembership } = makePopulatedStore();
    expect(() => addMemberToWorkspaceStore(store, workspace.id, ownerMembership)).toThrow(
      'already a member',
    );
  });

  it('removeMemberFromWorkspaceStore: removes an existing member', () => {
    const { store, workspace } = makePopulatedStore();
    const newMember = addWorkspaceMember(workspace, 'u-extra');
    const withMember = addMemberToWorkspaceStore(store, workspace.id, newMember);
    const removed = removeMemberFromWorkspaceStore(withMember, workspace.id, 'u-extra');
    expect(getMembersForWorkspace(removed, workspace.id)).toHaveLength(1);
  });

  it('removeMemberFromWorkspaceStore: throws when trying to remove owner', () => {
    const { store, workspace } = makePopulatedStore();
    expect(() => removeMemberFromWorkspaceStore(store, workspace.id, 'u-owner')).toThrow(
      'Cannot remove the workspace owner',
    );
  });

  it('removeMemberFromWorkspaceStore: throws for unknown workspace', () => {
    const { store } = makePopulatedStore();
    expect(() => removeMemberFromWorkspaceStore(store, 'no-such-ws', 'u-x')).toThrow('not found');
  });
});
