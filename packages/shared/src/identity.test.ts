import { describe, it, expect } from 'vitest';
import {
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
} from './identity.js';

describe('createUserProfile', () => {
  it('creates a profile with the correct name and normalised email', () => {
    const profile = createUserProfile({
      name: 'Alice',
      email: '  Alice@Example.COM  ',
      password: 'hunter2',
    });
    expect(profile.name).toBe('Alice');
    expect(profile.email).toBe('alice@example.com');
  });

  it('assigns a non-empty unique id', () => {
    const a = createUserProfile({ name: 'A', email: 'a@b.com', password: 'pw' });
    const b = createUserProfile({ name: 'B', email: 'b@b.com', password: 'pw' });
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
  });

  it('stores a hash and salt, not the plain-text password', () => {
    const profile = createUserProfile({ name: 'Bob', email: 'bob@test.com', password: 's3cr3t' });
    expect(profile.passwordHash).not.toBe('s3cr3t');
    expect(profile.passwordSalt).toBeTruthy();
  });

  it('does not set PIN fields by default', () => {
    const profile = createUserProfile({ name: 'Carol', email: 'c@d.com', password: 'pw' });
    expect(profile.pinHash).toBeUndefined();
    expect(profile.pinSalt).toBeUndefined();
  });

  it('sets createdAt and updatedAt as ISO timestamps', () => {
    const profile = createUserProfile({ name: 'Dan', email: 'd@e.com', password: 'pw' });
    expect(profile.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(profile.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws when name is empty', () => {
    expect(() => createUserProfile({ name: '  ', email: 'x@x.com', password: 'pw' })).toThrow(
      'Name is required',
    );
  });

  it('throws when email is empty', () => {
    expect(() => createUserProfile({ name: 'X', email: '   ', password: 'pw' })).toThrow(
      'Email is required',
    );
  });

  it('throws when password is empty', () => {
    expect(() => createUserProfile({ name: 'X', email: 'x@x.com', password: '' })).toThrow(
      'Password is required',
    );
  });
});

describe('authenticateWithPassword', () => {
  it('returns success for the correct password', () => {
    const profile = createUserProfile({ name: 'Eve', email: 'e@f.com', password: 'correct' });
    const result = authenticateWithPassword(profile, 'correct');
    expect(result.success).toBe(true);
    expect(result.userId).toBe(profile.id);
  });

  it('returns failure for an incorrect password', () => {
    const profile = createUserProfile({ name: 'Frank', email: 'f@g.com', password: 'correct' });
    const result = authenticateWithPassword(profile, 'wrong');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.userId).toBeUndefined();
  });

  it('different profiles with the same password authenticate independently', () => {
    const p1 = createUserProfile({ name: 'G', email: 'g@h.com', password: 'shared' });
    const p2 = createUserProfile({ name: 'H', email: 'h@h.com', password: 'shared' });
    expect(authenticateWithPassword(p1, 'shared').success).toBe(true);
    expect(authenticateWithPassword(p2, 'shared').success).toBe(true);
    // Cross-authenticate must still rely on own salt
    const r1 = authenticateWithPassword(p1, 'shared');
    expect(r1.userId).toBe(p1.id);
  });
});

describe('setPin / verifyPin / removePin', () => {
  it('sets a valid 4-digit PIN and verifies it', () => {
    const profile = createUserProfile({ name: 'Ivy', email: 'i@j.com', password: 'pw' });
    const withPin = setPin(profile, '1234');
    const result = verifyPin(withPin, '1234');
    expect(result.success).toBe(true);
    expect(result.userId).toBe(profile.id);
  });

  it('sets a valid 8-digit PIN and verifies it', () => {
    const profile = createUserProfile({ name: 'Jack', email: 'j@k.com', password: 'pw' });
    const withPin = setPin(profile, '12345678');
    expect(verifyPin(withPin, '12345678').success).toBe(true);
  });

  it('rejects an incorrect PIN', () => {
    const profile = createUserProfile({ name: 'Kate', email: 'k@l.com', password: 'pw' });
    const withPin = setPin(profile, '9999');
    const result = verifyPin(withPin, '0000');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('throws when PIN is fewer than 4 digits', () => {
    const profile = createUserProfile({ name: 'Leo', email: 'l@m.com', password: 'pw' });
    expect(() => setPin(profile, '123')).toThrow('PIN must be 4–8 digits');
  });

  it('throws when PIN is more than 8 digits', () => {
    const profile = createUserProfile({ name: 'Mia', email: 'm@n.com', password: 'pw' });
    expect(() => setPin(profile, '123456789')).toThrow('PIN must be 4–8 digits');
  });

  it('throws when PIN contains non-digits', () => {
    const profile = createUserProfile({ name: 'Ned', email: 'n@o.com', password: 'pw' });
    expect(() => setPin(profile, 'abcd')).toThrow('PIN must be 4–8 digits');
  });

  it('does not mutate the original profile when setting a PIN', () => {
    const profile = createUserProfile({ name: 'Olive', email: 'o@p.com', password: 'pw' });
    setPin(profile, '5678');
    expect(profile.pinHash).toBeUndefined();
  });

  it('fails verifyPin when no PIN is configured', () => {
    const profile = createUserProfile({ name: 'Pat', email: 'p@q.com', password: 'pw' });
    const result = verifyPin(profile, '1234');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no pin/i);
  });

  it('removes a PIN and fails subsequent PIN verification', () => {
    const profile = createUserProfile({ name: 'Quinn', email: 'q@r.com', password: 'pw' });
    const withPin = setPin(profile, '4321');
    const withoutPin = removePin(withPin);
    expect(withoutPin.pinHash).toBeUndefined();
    expect(withoutPin.pinSalt).toBeUndefined();
    expect(verifyPin(withoutPin, '4321').success).toBe(false);
  });

  it('does not mutate the original profile when removing a PIN', () => {
    const profile = createUserProfile({ name: 'Rex', email: 'r@s.com', password: 'pw' });
    const withPin = setPin(profile, '1111');
    removePin(withPin);
    expect(withPin.pinHash).toBeTruthy();
  });
});

describe('toPublicProfile', () => {
  it('strips password and salt fields', () => {
    const profile = createUserProfile({ name: 'Sam', email: 's@t.com', password: 'pw' });
    const pub = toPublicProfile(profile) as Record<string, unknown>;
    expect(pub['passwordHash']).toBeUndefined();
    expect(pub['passwordSalt']).toBeUndefined();
  });

  it('strips PIN fields', () => {
    const profile = createUserProfile({ name: 'Tia', email: 't@u.com', password: 'pw' });
    const withPin = setPin(profile, '2222');
    const pub = toPublicProfile(withPin) as Record<string, unknown>;
    expect(pub['pinHash']).toBeUndefined();
    expect(pub['pinSalt']).toBeUndefined();
  });

  it('reports hasPIN = true when PIN is set', () => {
    const profile = createUserProfile({ name: 'Uma', email: 'u@v.com', password: 'pw' });
    const withPin = setPin(profile, '3333');
    expect(toPublicProfile(withPin).hasPIN).toBe(true);
  });

  it('reports hasPIN = false when no PIN is set', () => {
    const profile = createUserProfile({ name: 'Vic', email: 'v@w.com', password: 'pw' });
    expect(toPublicProfile(profile).hasPIN).toBe(false);
  });

  it('preserves id, name, email, createdAt, updatedAt', () => {
    const profile = createUserProfile({ name: 'Wes', email: 'w@x.com', password: 'pw' });
    const pub = toPublicProfile(profile);
    expect(pub.id).toBe(profile.id);
    expect(pub.name).toBe(profile.name);
    expect(pub.email).toBe(profile.email);
    expect(pub.createdAt).toBe(profile.createdAt);
    expect(pub.updatedAt).toBe(profile.updatedAt);
  });
});

describe('createProfileStore', () => {
  it('creates an empty store with no profiles and no active profile', () => {
    const store = createProfileStore();
    expect(Object.keys(store.profiles)).toHaveLength(0);
    expect(store.activeProfileId).toBeNull();
  });
});

describe('addProfileToStore', () => {
  it('adds a profile to the store', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = addProfileToStore(createProfileStore(), profile);
    expect(store.profiles[profile.id]).toEqual(profile);
  });

  it('supports adding multiple profiles', () => {
    const p1 = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const p2 = createUserProfile({ name: 'Bob', email: 'b@b.com', password: 'pw' });
    const store = addProfileToStore(addProfileToStore(createProfileStore(), p1), p2);
    expect(Object.keys(store.profiles)).toHaveLength(2);
  });

  it('does not mutate the original store', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const original = createProfileStore();
    addProfileToStore(original, profile);
    expect(Object.keys(original.profiles)).toHaveLength(0);
  });

  it('throws when adding a profile with a duplicate ID', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = addProfileToStore(createProfileStore(), profile);
    expect(() => addProfileToStore(store, profile)).toThrow(/already exists/i);
  });
});

describe('removeProfileFromStore', () => {
  it('removes a profile from the store', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = addProfileToStore(createProfileStore(), profile);
    const updated = removeProfileFromStore(store, profile.id);
    expect(updated.profiles[profile.id]).toBeUndefined();
  });

  it('does not mutate the original store', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = addProfileToStore(createProfileStore(), profile);
    removeProfileFromStore(store, profile.id);
    expect(store.profiles[profile.id]).toEqual(profile);
  });

  it('resets activeProfileId to null when the active profile is removed', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    let store = addProfileToStore(createProfileStore(), profile);
    store = switchActiveProfile(store, profile.id);
    store = removeProfileFromStore(store, profile.id);
    expect(store.activeProfileId).toBeNull();
  });

  it('preserves activeProfileId when a different profile is removed', () => {
    const p1 = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const p2 = createUserProfile({ name: 'Bob', email: 'b@b.com', password: 'pw' });
    let store = addProfileToStore(addProfileToStore(createProfileStore(), p1), p2);
    store = switchActiveProfile(store, p1.id);
    store = removeProfileFromStore(store, p2.id);
    expect(store.activeProfileId).toBe(p1.id);
  });

  it('throws when the profile does not exist', () => {
    expect(() => removeProfileFromStore(createProfileStore(), 'nonexistent')).toThrow(
      /not found/i,
    );
  });
});

describe('listProfiles', () => {
  it('returns an empty array for an empty store', () => {
    expect(listProfiles(createProfileStore())).toEqual([]);
  });

  it('returns public profiles for all stored profiles', () => {
    const p1 = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const p2 = createUserProfile({ name: 'Bob', email: 'b@b.com', password: 'pw' });
    const store = addProfileToStore(addProfileToStore(createProfileStore(), p1), p2);
    const list = listProfiles(store);
    expect(list).toHaveLength(2);
    expect(list.every((p) => !('passwordHash' in p))).toBe(true);
  });
});

describe('getProfileById', () => {
  it('returns the full profile for a known ID', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = addProfileToStore(createProfileStore(), profile);
    expect(getProfileById(store, profile.id)).toEqual(profile);
  });

  it('returns undefined for an unknown ID', () => {
    expect(getProfileById(createProfileStore(), 'ghost')).toBeUndefined();
  });
});

describe('switchActiveProfile', () => {
  it('sets the active profile ID', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = switchActiveProfile(addProfileToStore(createProfileStore(), profile), profile.id);
    expect(store.activeProfileId).toBe(profile.id);
  });

  it('allows switching between profiles', () => {
    const p1 = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const p2 = createUserProfile({ name: 'Bob', email: 'b@b.com', password: 'pw' });
    let store = addProfileToStore(addProfileToStore(createProfileStore(), p1), p2);
    store = switchActiveProfile(store, p1.id);
    expect(store.activeProfileId).toBe(p1.id);
    store = switchActiveProfile(store, p2.id);
    expect(store.activeProfileId).toBe(p2.id);
  });

  it('does not mutate the original store', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = addProfileToStore(createProfileStore(), profile);
    switchActiveProfile(store, profile.id);
    expect(store.activeProfileId).toBeNull();
  });

  it('throws when switching to a profile that does not exist', () => {
    expect(() => switchActiveProfile(createProfileStore(), 'ghost')).toThrow(/not found/i);
  });
});

describe('getActiveProfile', () => {
  it('returns undefined when no profile is active', () => {
    expect(getActiveProfile(createProfileStore())).toBeUndefined();
  });

  it('returns the public view of the active profile', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = switchActiveProfile(addProfileToStore(createProfileStore(), profile), profile.id);
    const active = getActiveProfile(store);
    expect(active).toBeDefined();
    expect(active!.id).toBe(profile.id);
    expect(active!.name).toBe('Alice');
  });

  it('strips sensitive fields from the active profile', () => {
    const profile = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const store = switchActiveProfile(addProfileToStore(createProfileStore(), profile), profile.id);
    const active = getActiveProfile(store) as Record<string, unknown>;
    expect(active['passwordHash']).toBeUndefined();
    expect(active['passwordSalt']).toBeUndefined();
  });
});

describe('createProfileDataScope / scopeMatchesProfile', () => {
  it('creates a scope bound to the given profile ID', () => {
    const scope = createProfileDataScope('user-1');
    expect(scope.profileId).toBe('user-1');
  });

  it('throws when profile ID is empty', () => {
    expect(() => createProfileDataScope('')).toThrow('Profile ID is required');
  });

  it('returns true when scope matches the profile ID', () => {
    const scope = createProfileDataScope('user-1');
    expect(scopeMatchesProfile(scope, 'user-1')).toBe(true);
  });

  it('returns false when scope does not match the profile ID', () => {
    const scope = createProfileDataScope('user-1');
    expect(scopeMatchesProfile(scope, 'user-2')).toBe(false);
  });

  it('can be used to filter domain objects by active profile', () => {
    const p1 = createUserProfile({ name: 'Alice', email: 'a@b.com', password: 'pw' });
    const p2 = createUserProfile({ name: 'Bob', email: 'b@b.com', password: 'pw' });

    const items = [
      { name: 'Alice account', scope: createProfileDataScope(p1.id) },
      { name: 'Bob account', scope: createProfileDataScope(p2.id) },
      { name: 'Alice savings', scope: createProfileDataScope(p1.id) },
    ];

    const aliceItems = items.filter((i) => scopeMatchesProfile(i.scope, p1.id));
    expect(aliceItems).toHaveLength(2);
    expect(aliceItems.every((i) => i.name.startsWith('Alice'))).toBe(true);
  });
});
