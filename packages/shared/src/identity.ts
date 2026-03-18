/**
 * Identity module for SpendStack.
 *
 * Provides user profile management, email/password authentication,
 * and optional PIN unlock after initial authentication.
 *
 * Passwords and PINs are hashed with PBKDF2 (SHA-256) before storage;
 * the plain-text value is never retained.
 */

import { randomBytes, pbkdf2Sync } from 'crypto';

export type UserId = string;

export interface UserProfile {
  id: UserId;
  name: string;
  /** Stored as lowercase-trimmed value. */
  email: string;
  /** PBKDF2-SHA256 hex digest. */
  passwordHash: string;
  passwordSalt: string;
  /** Optional PIN hash — absent when no PIN is configured. */
  pinHash?: string;
  pinSalt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Safe view of a profile — excludes all hashes and salts. */
export interface PublicUserProfile {
  id: UserId;
  name: string;
  email: string;
  /** Whether the profile has a PIN configured. */
  hasPIN: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileInput {
  name: string;
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  userId?: UserId;
  error?: string;
}

// ── Hashing helpers ──────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 10_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

function hashSecret(secret: string, salt: string): string {
  return pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a new user profile with a hashed password.
 *
 * @example
 * ```ts
 * const profile = createUserProfile({ name: 'Alice', email: 'alice@example.com', password: 'hunter2' });
 * ```
 */
export function createUserProfile(input: CreateProfileInput): UserProfile {
  if (!input.name.trim()) {
    throw new Error('Name is required');
  }
  if (!input.email.trim()) {
    throw new Error('Email is required');
  }
  if (!input.password) {
    throw new Error('Password is required');
  }

  const salt = generateSalt();
  const now = new Date().toISOString();

  return {
    id: randomBytes(16).toString('hex'),
    name: input.name.trim(),
    email: input.email.toLowerCase().trim(),
    passwordHash: hashSecret(input.password, salt),
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Authenticates a user by verifying the supplied password against the stored hash.
 *
 * @example
 * ```ts
 * const result = authenticateWithPassword(profile, 'hunter2');
 * if (result.success) { // proceed }
 * ```
 */
export function authenticateWithPassword(profile: UserProfile, password: string): AuthResult {
  const hash = hashSecret(password, profile.passwordSalt);
  if (hash === profile.passwordHash) {
    return { success: true, userId: profile.id };
  }
  return { success: false, error: 'Invalid email or password' };
}

/**
 * Configures (or replaces) a PIN on the profile.
 * PIN must be 4–8 decimal digits.
 *
 * Returns a new `UserProfile` with the PIN fields set; the original is not mutated.
 */
export function setPin(profile: UserProfile, pin: string): UserProfile {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4–8 digits');
  }

  const salt = generateSalt();

  return {
    ...profile,
    pinHash: hashSecret(pin, salt),
    pinSalt: salt,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Verifies the supplied PIN against the stored hash.
 * Returns a failure result when no PIN is configured.
 */
export function verifyPin(profile: UserProfile, pin: string): AuthResult {
  if (!profile.pinHash || !profile.pinSalt) {
    return { success: false, error: 'No PIN configured for this profile' };
  }

  const hash = hashSecret(pin, profile.pinSalt);
  if (hash === profile.pinHash) {
    return { success: true, userId: profile.id };
  }
  return { success: false, error: 'Incorrect PIN' };
}

/**
 * Removes the PIN from a profile.
 * Returns a new `UserProfile` without PIN fields; the original is not mutated.
 */
export function removePin(profile: UserProfile): UserProfile {
  const { pinHash: _pinHash, pinSalt: _pinSalt, ...rest } = profile;
  return { ...rest, updatedAt: new Date().toISOString() };
}

// ── PIN attempt tracking ──────────────────────────────────────────────────────

/** Maximum number of consecutive failed PIN attempts before lockout. */
export const PIN_MAX_ATTEMPTS = 5;

/** Duration (in seconds) of a PIN lockout after exceeding max attempts. */
export const PIN_LOCKOUT_SECONDS = 300;

/**
 * Tracks consecutive failed PIN attempts for a single profile session.
 * Persist this alongside the active session to enforce lockout across
 * app restarts. Contains no secrets — safe to store in local state.
 */
export interface PinAttemptState {
  /** Number of consecutive failed attempts since the last success. */
  readonly failedAttempts: number;
  /**
   * ISO 8601 UTC timestamp until which PIN entry is locked.
   * Absent when not currently locked.
   */
  readonly lockedUntil?: string;
}

/**
 * Creates an initial (clean) `PinAttemptState` with no failed attempts.
 *
 * @example
 * ```ts
 * const state = createPinAttemptState();
 * ```
 */
export function createPinAttemptState(): PinAttemptState {
  return { failedAttempts: 0 };
}

/**
 * Returns `true` when the current time is within an active lockout period.
 *
 * @example
 * ```ts
 * if (isPinLocked(state)) { // show "too many attempts" message }
 * ```
 */
export function isPinLocked(state: PinAttemptState): boolean {
  if (!state.lockedUntil) return false;
  return new Date(state.lockedUntil).getTime() > Date.now();
}

/**
 * Records a successful PIN verification. Resets the attempt counter and
 * clears any lockout. Returns a new `PinAttemptState`; the original is not mutated.
 *
 * @example
 * ```ts
 * const result = verifyPin(profile, enteredPin);
 * if (result.success) {
 *   state = recordPinSuccess(state);
 * }
 * ```
 */
export function recordPinSuccess(state: PinAttemptState): PinAttemptState {
  return { failedAttempts: 0 };
}

/**
 * Records a failed PIN attempt. Increments the counter and imposes a lockout
 * when `PIN_MAX_ATTEMPTS` is reached. Returns a new `PinAttemptState`;
 * the original is not mutated.
 *
 * When locked out, the caller should prompt the user to fall back to their
 * primary credentials via `authenticateWithPassword`.
 *
 * @example
 * ```ts
 * const result = verifyPin(profile, enteredPin);
 * if (!result.success) {
 *   state = recordPinFailure(state);
 *   if (isPinLocked(state)) {
 *     // prompt for primary credentials
 *   }
 * }
 * ```
 */
export function recordPinFailure(state: PinAttemptState): PinAttemptState {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts >= PIN_MAX_ATTEMPTS) {
    return {
      failedAttempts,
      lockedUntil: new Date(Date.now() + PIN_LOCKOUT_SECONDS * 1000).toISOString(),
    };
  }
  return { failedAttempts };
}

/**
 * Returns a safe, public view of a profile with all hashes and salts stripped.
 */
export function toPublicProfile(profile: UserProfile): PublicUserProfile {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    hasPIN: profile.pinHash !== undefined,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

// ── Profile store ─────────────────────────────────────────────────────────────

/**
 * An in-memory store that holds all local user profiles and tracks
 * which one is currently active.
 */
export interface ProfileStore {
  /** All profiles, keyed by user ID. */
  readonly profiles: Readonly<Record<UserId, UserProfile>>;
  /** The ID of the currently active profile, or `null` when none is selected. */
  readonly activeProfileId: UserId | null;
}

/**
 * Scopes a piece of data to a specific user profile.
 * Attach this to any domain object (account, transaction, category, …)
 * to enforce per-profile data isolation.
 */
export interface ProfileDataScope {
  readonly profileId: UserId;
}

/**
 * Creates an empty profile store with no profiles and no active profile.
 *
 * @example
 * ```ts
 * const store = createProfileStore();
 * ```
 */
export function createProfileStore(): ProfileStore {
  return { profiles: Object.create(null) as Record<UserId, UserProfile>, activeProfileId: null };
}

/**
 * Adds a profile to the store.
 * Returns a new `ProfileStore`; the original is not mutated.
 * Throws if a profile with the same ID already exists.
 */
export function addProfileToStore(store: ProfileStore, profile: UserProfile): ProfileStore {
  if (Object.hasOwn(store.profiles, profile.id)) {
    throw new Error(`Profile with ID ${profile.id} already exists`);
  }
  const profiles = Object.assign(Object.create(null) as Record<UserId, UserProfile>, store.profiles, {
    [profile.id]: profile,
  });
  return { ...store, profiles };
}

/**
 * Removes a profile from the store.
 * Returns a new `ProfileStore`; the original is not mutated.
 * If the removed profile was the active one, `activeProfileId` is reset to `null`.
 * Throws if the profile does not exist in the store.
 */
export function removeProfileFromStore(store: ProfileStore, userId: UserId): ProfileStore {
  if (!Object.hasOwn(store.profiles, userId)) {
    throw new Error(`Profile with ID ${userId} not found`);
  }
  const profiles = Object.assign(Object.create(null) as Record<UserId, UserProfile>, store.profiles);
  delete profiles[userId];
  return {
    ...store,
    profiles,
    activeProfileId: store.activeProfileId === userId ? null : store.activeProfileId,
  };
}

/**
 * Returns all profiles in the store as a list of public (safe) views.
 * Profiles are returned in the order they were added.
 */
export function listProfiles(store: ProfileStore): PublicUserProfile[] {
  return Object.values(store.profiles).map(toPublicProfile);
}

/**
 * Returns the full `UserProfile` for the given ID, or `undefined` if not found.
 */
export function getProfileById(store: ProfileStore, userId: UserId): UserProfile | undefined {
  return Object.hasOwn(store.profiles, userId) ? store.profiles[userId] : undefined;
}

/**
 * Switches the active profile to the specified user ID.
 * Returns a new `ProfileStore`; the original is not mutated.
 * Throws if the profile does not exist in the store.
 *
 * @example
 * ```ts
 * const updated = switchActiveProfile(store, profile.id);
 * ```
 */
export function switchActiveProfile(store: ProfileStore, userId: UserId): ProfileStore {
  if (!Object.hasOwn(store.profiles, userId)) {
    throw new Error(`Profile with ID ${userId} not found`);
  }
  return { ...store, activeProfileId: userId };
}

/**
 * Returns the public view of the currently active profile, or `undefined`
 * when no profile is active.
 *
 * @example
 * ```ts
 * const active = getActiveProfile(store);
 * if (active) { // show active profile name }
 * ```
 */
export function getActiveProfile(store: ProfileStore): PublicUserProfile | undefined {
  if (store.activeProfileId === null) return undefined;
  return Object.hasOwn(store.profiles, store.activeProfileId)
    ? toPublicProfile(store.profiles[store.activeProfileId])
    : undefined;
}

// ── Session management ────────────────────────────────────────────────────────

/** Default session lifetime: 30 days in seconds. */
const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface CreateSessionOptions {
  /** Session lifetime in seconds. Defaults to 30 days. */
  ttlSeconds?: number;
}

/**
 * An authenticated session binding a user to a validity window.
 * Contains no secrets — safe to persist to local storage.
 */
export interface AuthSession {
  readonly sessionId: string;
  readonly userId: UserId;
  /** ISO 8601 UTC creation timestamp. */
  readonly createdAt: string;
  /** ISO 8601 UTC expiry timestamp. */
  readonly expiresAt: string;
}

/**
 * Creates a new session for the given user after a successful authentication.
 *
 * @example
 * ```ts
 * const result = authenticateWithPassword(profile, password);
 * if (result.success) {
 *   const session = createSession(result.userId!);
 * }
 * ```
 */
export function createSession(userId: UserId, options?: CreateSessionOptions): AuthSession {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('User ID is required');
  }
  const ttl = options?.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  if (typeof ttl !== 'number' || ttl <= 0) {
    throw new Error('ttlSeconds must be a positive number');
  }
  const now = Date.now();
  return {
    sessionId: randomBytes(16).toString('hex'),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl * 1000).toISOString(),
  };
}

/**
 * Returns `true` when the session has not yet expired.
 *
 * @example
 * ```ts
 * if (isSessionValid(session)) { // allow access }
 * ```
 */
export function isSessionValid(session: AuthSession): boolean {
  return new Date(session.expiresAt).getTime() > Date.now();
}

/**
 * Invalidates a session by returning a new session whose `expiresAt` is set to
 * the current time, effectively signing the user out.
 * The original session is not mutated.
 *
 * @example
 * ```ts
 * const signedOut = invalidateSession(activeSession);
 * // isSessionValid(signedOut) → false
 * ```
 */
export function invalidateSession(session: AuthSession): AuthSession {
  return { ...session, expiresAt: new Date().toISOString() };
}

/**
 * Serializes an `AuthSession` to a JSON string suitable for safe persistence.
 * No passwords or secrets are included.
 *
 * @example
 * ```ts
 * const raw = serializeSession(session);
 * localStorage.setItem('session', raw);
 * ```
 */
export function serializeSession(session: AuthSession): string {
  return JSON.stringify(session);
}

/**
 * Parses and validates a JSON string produced by `serializeSession`.
 * Throws a descriptive error if the data is missing required fields.
 *
 * @example
 * ```ts
 * const session = deserializeSession(localStorage.getItem('session') ?? '');
 * ```
 */
export function deserializeSession(raw: string): AuthSession {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid session: not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid session: expected an object');
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj['sessionId'] !== 'string' || !obj['sessionId']) {
    throw new Error('Invalid session: missing sessionId');
  }
  if (typeof obj['userId'] !== 'string' || !obj['userId']) {
    throw new Error('Invalid session: missing userId');
  }
  if (typeof obj['createdAt'] !== 'string' || !obj['createdAt']) {
    throw new Error('Invalid session: missing createdAt');
  }
  if (typeof obj['expiresAt'] !== 'string' || !obj['expiresAt']) {
    throw new Error('Invalid session: missing expiresAt');
  }

  return {
    sessionId: obj['sessionId'],
    userId: obj['userId'],
    createdAt: obj['createdAt'],
    expiresAt: obj['expiresAt'],
  };
}

// ── Profile data scope ────────────────────────────────────────────────────────

/**
 * Creates a `ProfileDataScope` that binds a piece of data to the given profile.
 * Attach this scope to domain objects (accounts, transactions, categories, …)
 * to enforce per-profile data isolation.
 *
 * @example
 * ```ts
 * const scope = createProfileDataScope(profile.id);
 * const account = { ...newAccount, scope };
 * ```
 */
export function createProfileDataScope(profileId: UserId): ProfileDataScope {
  if (typeof profileId !== 'string' || profileId.trim().length === 0) {
    throw new Error('Profile ID is required');
  }
  return { profileId: profileId.trim() };
}

/**
 * Returns `true` when the given data scope belongs to the specified profile.
 * Use this to filter domain objects by the active profile.
 *
 * @example
 * ```ts
 * const myAccounts = allAccounts.filter(a => scopeMatchesProfile(a.scope, activeId));
 * ```
 */
export function scopeMatchesProfile(scope: ProfileDataScope, profileId: UserId): boolean {
  return scope.profileId === profileId;
}
