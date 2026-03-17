/**
 * Diagnostics bundle for SpendStack.
 *
 * Produces a snapshot of system state suitable for troubleshooting — without
 * including raw secrets or unnecessary sensitive payloads.
 *
 * The bundle is intended for use by support staff or advanced users when
 * filing bug reports or investigating anomalies.
 */

import { randomBytes } from 'crypto';
import { redact } from './logger.js';
import type { AuditLog } from './audit.js';
import type { FeatureFlagName, FeatureFlagValue } from './feature-flags.js';

export interface RuntimeInfo {
  /** Node.js version string (e.g. `"v22.0.0"`). */
  nodeVersion: string;
  /** Operating system platform (e.g. `"linux"`, `"darwin"`, `"win32"`). */
  platform: string;
  /** CPU architecture (e.g. `"x64"`, `"arm64"`). */
  arch: string;
}

export interface AuditSummary {
  /** Total number of events in the audit log. */
  totalEvents: number;
  /** Count of events grouped by event type. */
  eventsByType: Record<string, number>;
  /** ISO 8601 timestamp of the oldest event, or `null` when the log is empty. */
  firstEventAt: string | null;
  /** ISO 8601 timestamp of the most recent event, or `null` when the log is empty. */
  lastEventAt: string | null;
}

/**
 * A portable diagnostics snapshot.
 *
 * - Contains no raw secrets or full transaction payloads.
 * - Suitable for attaching to support tickets or storing for post-mortem review.
 */
export interface DiagnosticsBundle {
  /** Unique ID for this bundle snapshot. */
  bundleId: string;
  /** ISO 8601 UTC timestamp of when the bundle was generated. */
  generatedAt: string;
  /** Application version string (semver). */
  appVersion: string;
  runtimeInfo: RuntimeInfo;
  featureFlags: Record<FeatureFlagName, FeatureFlagValue>;
  auditSummary: AuditSummary;
  /**
   * Any additional context the caller chose to include.
   * Sensitive fields are automatically redacted before inclusion.
   */
  extraContext: Record<string, unknown>;
}

export interface BuildDiagnosticsBundleOptions {
  /** Semver application version string. */
  appVersion: string;
  /** Snapshot of all feature flag values (use `flags.getAll()`). */
  featureFlags: Record<FeatureFlagName, FeatureFlagValue>;
  /** The current audit log. */
  auditLog: AuditLog;
  /**
   * Additional key/value context to embed in the bundle.
   * Sensitive fields (passwords, tokens, etc.) are redacted automatically.
   */
  extraContext?: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRuntimeInfo(): RuntimeInfo {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

function summarizeAuditLog(log: AuditLog): AuditSummary {
  const eventsByType: Record<string, number> = {};
  for (const event of log) {
    eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
  }

  return {
    totalEvents: log.length,
    eventsByType,
    firstEventAt: log.length > 0 ? (log[0]?.timestamp ?? null) : null,
    lastEventAt: log.length > 0 ? (log[log.length - 1]?.timestamp ?? null) : null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a diagnostics bundle from the provided context.
 *
 * Sensitive fields in `extraContext` are automatically redacted using the
 * same rules applied to application logs, so the bundle is safe to share
 * with support without manual scrubbing.
 *
 * @example
 * ```ts
 * const bundle = buildDiagnosticsBundle({
 *   appVersion: '0.1.0',
 *   featureFlags: flags.getAll(),
 *   auditLog,
 *   extraContext: { lastImportFileId: 'file-123' },
 * });
 * ```
 */
export function buildDiagnosticsBundle(options: BuildDiagnosticsBundleOptions): DiagnosticsBundle {
  const { appVersion, featureFlags, auditLog, extraContext = {} } = options;

  return {
    bundleId: `diag-${randomBytes(8).toString('hex')}`,
    generatedAt: new Date().toISOString(),
    appVersion,
    runtimeInfo: getRuntimeInfo(),
    featureFlags,
    auditSummary: summarizeAuditLog(auditLog),
    extraContext: redact(extraContext) as Record<string, unknown>,
  };
}
