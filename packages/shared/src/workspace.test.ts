import { describe, it, expect } from 'vitest';
import {
  createFamilyWorkspace,
  addWorkspaceMember,
  isWorkspaceMember,
  getMemberRole,
  createPrivacyRule,
  resolveVisibility,
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
