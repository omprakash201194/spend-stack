/**
 * Audit event model for SpendStack.
 *
 * Records important user and system actions in a stable, versionable schema.
 * The schema version field allows future migrations without breaking existing
 * audit logs.
 *
 * All audit events are immutable once created. The audit log is an
 * append-only sequence of events stored in chronological order (oldest first).
 */

import { randomBytes } from 'crypto';

/** Current schema version — increment when the event shape changes in a breaking way. */
export const AUDIT_SCHEMA_VERSION = 1 as const;

export type AuditSchemaVersion = typeof AUDIT_SCHEMA_VERSION;

/**
 * All auditable action types.
 *
 * Naming convention: `<domain>.<action>` using snake_case for the action part.
 */
export type AuditEventType =
  // User identity events
  | 'user.created'
  | 'user.authenticated'
  | 'user.authentication_failed'
  | 'user.signed_out'
  | 'user.pin_set'
  | 'user.pin_removed'
  // Workspace events
  | 'workspace.created'
  | 'workspace.member_added'
  | 'workspace.member_removed'
  // Privacy events
  | 'privacy.rule_created'
  | 'privacy.rule_updated'
  | 'privacy.rule_deleted'
  | 'privacy.access_denied'
  // Import events
  | 'import.started'
  | 'import.completed'
  | 'import.failed'
  | 'import.cancelled'
  // Transaction events
  | 'transaction.reviewed'
  | 'transaction.categorized'
  | 'transaction.flagged'
  // Insight & analytics events
  | 'insight.consent_granted'
  | 'insight.consent_revoked'
  | 'insight.balance_summary_computed'
  | 'insight.cashflow_summary_computed'
  | 'insight.ai_insights_requested'
  // File lifecycle events
  | 'file.retained'
  | 'file.deleted'
  | 'file.deletion_failed'
  | 'file.cleanup_run_completed';

/**
 * A single audit event.
 *
 * The shape is stable for a given `schemaVersion`.
 * Metadata should not contain raw secrets or PII beyond what is strictly
 * necessary; callers are encouraged to pass only IDs, not full payloads.
 */
export interface AuditEvent {
  /** Unique identifier for this event. */
  id: string;
  /** Schema version — always 1 for the current shape. */
  schemaVersion: AuditSchemaVersion;
  type: AuditEventType;
  /** ID of the user who triggered the action, or `'system'` for automated actions. */
  actorId: string;
  /** Category of the affected resource (e.g. `'user'`, `'import'`, `'transaction'`). */
  resourceType: string;
  /** Identifier of the affected resource. */
  resourceId: string;
  /** ISO 8601 UTC timestamp. */
  timestamp: string;
  /**
   * Optional correlation ID linking related events together.
   * For example, all events in a single import session share the same `correlationId`.
   */
  correlationId?: string;
  /**
   * Additional context for this event.
   * Avoid storing raw secrets or full payloads; prefer IDs and status values.
   */
  metadata: Record<string, unknown>;
}

/**
 * An append-only sequence of audit events stored in chronological order
 * (oldest first).
 */
export type AuditLog = readonly AuditEvent[];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a new audit event with a generated ID and current timestamp.
 *
 * @example
 * ```ts
 * const event = createAuditEvent({
 *   type: 'import.completed',
 *   actorId: 'user-1',
 *   resourceType: 'import',
 *   resourceId: 'file-123',
 *   metadata: { rowsImported: 42, parserId: 'icici-csv-v1' },
 * });
 * ```
 */
export function createAuditEvent(
  params: Omit<AuditEvent, 'id' | 'schemaVersion' | 'timestamp'>,
): AuditEvent {
  return {
    id: randomBytes(8).toString('hex'),
    schemaVersion: AUDIT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    ...params,
  };
}

/**
 * Appends a new event to an existing audit log.
 * Returns a new array; the original log is not mutated.
 *
 * @example
 * ```ts
 * const updatedLog = appendAuditEvent(existingLog, event);
 * ```
 */
export function appendAuditEvent(log: AuditLog, event: AuditEvent): AuditLog {
  return [...log, event];
}

/**
 * Options for filtering the audit log in {@link queryAuditLog}.
 *
 * All filters are applied with logical AND — only events matching every
 * supplied criterion are returned.
 */
export interface AuditQueryOptions {
  /** Return only events whose `type` is in this set. */
  types?: readonly AuditEventType[];
  /** Return only events triggered by this actor. Pass `'system'` for automated events. */
  actorId?: string;
  /** Return only events on this resource category (e.g. `'import'`, `'user'`). */
  resourceType?: string;
  /** Return only events on this specific resource. */
  resourceId?: string;
  /** Return only events sharing this correlation ID. */
  correlationId?: string;
  /**
   * Return only events at or after this ISO 8601 UTC timestamp.
   * Compared lexicographically against `event.timestamp`.
   */
  from?: string;
  /**
   * Return only events at or before this ISO 8601 UTC timestamp.
   * Compared lexicographically against `event.timestamp`.
   */
  to?: string;
}

/**
 * Filters an audit log by any combination of criteria supplied in `options`.
 *
 * Returns a new (potentially shorter) array; the original log is not mutated.
 * When no options are provided the entire log is returned as-is.
 *
 * @example
 * ```ts
 * const importEvents = queryAuditLog(log, { types: ['import.started', 'import.completed'] });
 * const userEvents   = queryAuditLog(log, { actorId: 'user-1', from: '2024-01-01T00:00:00.000Z' });
 * ```
 */
export function queryAuditLog(log: AuditLog, options: AuditQueryOptions = {}): AuditEvent[] {
  const { types, actorId, resourceType, resourceId, correlationId, from, to } = options;

  return log.filter((event) => {
    if (types !== undefined && !types.includes(event.type)) return false;
    if (actorId !== undefined && event.actorId !== actorId) return false;
    if (resourceType !== undefined && event.resourceType !== resourceType) return false;
    if (resourceId !== undefined && event.resourceId !== resourceId) return false;
    if (correlationId !== undefined && event.correlationId !== correlationId) return false;
    if (from !== undefined && event.timestamp < from) return false;
    if (to !== undefined && event.timestamp > to) return false;
    return true;
  });
}

/**
 * Returns a human-readable summary of the audit log, suitable for display
 * in a support view or user-visible history panel.
 *
 * Each line is formatted as:
 * `[timestamp] actorId → type (resourceType:resourceId)`
 *
 * @example
 * ```ts
 * const history = formatAuditHistory(log);
 * // => "[2024-01-05T10:00:00.000Z] user-1 → import.started (import:file-123)"
 * ```
 */
export function formatAuditHistory(log: AuditLog): string {
  if (log.length === 0) return '';
  return log
    .map(
      (e) =>
        `[${e.timestamp}] ${e.actorId} → ${e.type} (${e.resourceType}:${e.resourceId})`,
    )
    .join('\n');
}
