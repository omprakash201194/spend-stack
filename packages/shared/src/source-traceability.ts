/**
 * Source traceability module for SpendStack.
 *
 * Provides the data model and query API for linking normalized transactions back
 * to their original source statement rows.  This enables:
 *   - User-visible "where did this transaction come from?" views
 *   - Audit history for imported transactions
 *   - Debugging and reconciliation workflows
 *
 * Trace data is produced by the import pipeline and stored alongside
 * transactions.  All query functions are null-safe and handle missing or
 * partial trace data gracefully (returning `null` or an empty array rather
 * than throwing).
 */

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/**
 * A portable record linking a normalized transaction back to its source.
 *
 * This is the transport and query form of the traceability record.  It is safe
 * to pass across package boundaries and to persist in the database alongside
 * the normalized transaction.  The optional `rawText` field carries the
 * verbatim source row when available; callers must handle its absence.
 */
export interface SourceTraceRecord {
  /** Zero-based index of the normalized transaction in the import result array. */
  normalizedIndex: number;
  /**
   * Matches `RawStatementRow.sourceReference` for the originating row.
   * This is the stable row identifier used throughout the pipeline.
   */
  sourceReference: string;
  /** ID of the source statement file. */
  sourceFileId: string;
  /** Human-readable file name as uploaded by the user. */
  sourceFileName: string;
  /** ID of the import job that produced this transaction. */
  importJobId: string;
  /** Stable parser identifier (e.g. `"icici-csv-v1"`). */
  parserId: string;
  /** Semver version of the parser. */
  parserVersion: string;
  /** ISO 8601 UTC timestamp of when the transaction was imported. */
  importedAt: string;
  /**
   * Verbatim raw text of the originating row, when available.
   * May be absent for older imports or when the parser did not preserve it.
   */
  rawText?: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * An in-memory lookup structure for fast traceability queries.
 *
 * Built once from a flat array of records using `buildTraceStore()` and then
 * queried as needed by the UI and audit layers.  All public query functions
 * accept a `TraceStore` as their first argument.
 */
export interface TraceStore {
  /** Records indexed by `importJobId → normalizedIndex`. */
  readonly _byJobAndIndex: ReadonlyMap<string, ReadonlyMap<number, SourceTraceRecord>>;
  /** Records indexed by `sourceFileId`. */
  readonly _byFileId: ReadonlyMap<string, readonly SourceTraceRecord[]>;
  /** Total number of records in the store. */
  readonly size: number;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds a `TraceStore` from a flat array of `SourceTraceRecord`s.
 *
 * O(n) in the number of records.  Safe to call with an empty array — the
 * resulting store will have `size === 0` and all query functions will return
 * `null` or empty arrays.
 *
 * @example
 * ```ts
 * const store = buildTraceStore(importResult.sourceTraces);
 * const trace = getTraceForTransaction(store, importJobId, 0);
 * ```
 */
export function buildTraceStore(records: readonly SourceTraceRecord[]): TraceStore {
  const byJobAndIndex = new Map<string, Map<number, SourceTraceRecord>>();
  const byFileId = new Map<string, SourceTraceRecord[]>();

  for (const record of records) {
    // Index by job ID + normalizedIndex for O(1) per-transaction lookup.
    let jobMap = byJobAndIndex.get(record.importJobId);
    if (!jobMap) {
      jobMap = new Map<number, SourceTraceRecord>();
      byJobAndIndex.set(record.importJobId, jobMap);
    }
    jobMap.set(record.normalizedIndex, record);

    // Index by source file ID for "show all transactions from this file" queries.
    let fileList = byFileId.get(record.sourceFileId);
    if (!fileList) {
      fileList = [];
      byFileId.set(record.sourceFileId, fileList);
    }
    fileList.push(record);
  }

  return {
    _byJobAndIndex: byJobAndIndex,
    _byFileId: byFileId,
    size: records.length,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns the trace record for a specific normalized transaction.
 *
 * Returns `null` when no trace is available — callers should handle this
 * gracefully (e.g. show "Trace data unavailable" in the UI).
 *
 * @param store - The trace store to query.
 * @param importJobId - ID of the import job that produced the transaction.
 * @param normalizedIndex - Zero-based position of the transaction in the
 *   import result array.
 */
export function getTraceForTransaction(
  store: TraceStore,
  importJobId: string,
  normalizedIndex: number,
): SourceTraceRecord | null {
  const jobMap = store._byJobAndIndex.get(importJobId);
  if (!jobMap) return null;
  return jobMap.get(normalizedIndex) ?? null;
}

/**
 * Returns all trace records for a specific source statement file.
 *
 * Returns an empty array when no traces are available for the given file.
 * This is the expected result for transactions imported before trace recording
 * was introduced.
 *
 * @param store - The trace store to query.
 * @param sourceFileId - ID of the source statement file.
 */
export function getTracesForFile(
  store: TraceStore,
  sourceFileId: string,
): readonly SourceTraceRecord[] {
  return store._byFileId.get(sourceFileId) ?? [];
}

/**
 * Returns the trace record matching a specific source row reference within an
 * import job.
 *
 * Returns `null` when no match is found.  When multiple transactions share the
 * same `sourceReference` within a job, the lowest-index match is returned.
 *
 * @param store - The trace store to query.
 * @param importJobId - ID of the import job.
 * @param sourceReference - The `RawStatementRow.sourceReference` to find.
 */
export function getTraceBySourceRef(
  store: TraceStore,
  importJobId: string,
  sourceReference: string,
): SourceTraceRecord | null {
  const jobMap = store._byJobAndIndex.get(importJobId);
  if (!jobMap) return null;
  for (const record of jobMap.values()) {
    if (record.sourceReference === sourceReference) return record;
  }
  return null;
}

/**
 * Returns `true` when the store contains at least one trace record.
 *
 * Use this as a pre-flight guard before rendering traceability UI so that
 * the view can show a "no trace data available" message instead of an empty
 * table.
 */
export function hasTraceData(store: TraceStore): boolean {
  return store.size > 0;
}

/**
 * Returns the list of all import job IDs that have at least one trace record
 * in the store.
 *
 * Useful for building a summary list of import sessions that have full
 * traceability data available.
 */
export function getImportJobIds(store: TraceStore): string[] {
  return Array.from(store._byJobAndIndex.keys());
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Formats a trace record as a human-readable one-line summary.
 *
 * Suitable for display in a transaction detail panel or audit history view.
 * The string is intentionally compact to fit in a single UI row.
 *
 * @example
 * ```ts
 * formatTraceForDisplay(record);
 * // => "Imported from 'statement.csv' (row 2) via icici-csv-v1 on 2024-01-05"
 * ```
 */
export function formatTraceForDisplay(record: SourceTraceRecord): string {
  const dateLabel = extractDateLabel(record.importedAt);
  return (
    `Imported from '${record.sourceFileName}' ` +
    `(row ${record.sourceReference}) ` +
    `via ${record.parserId} ` +
    `on ${dateLabel}`
  );
}

/**
 * Extracts the YYYY-MM-DD portion of an ISO 8601 timestamp string.
 * Falls back to the full string when the value does not start with a
 * recognisable date prefix, so that display is never broken by a malformed
 * timestamp.
 */
function extractDateLabel(importedAt: string): string {
  const prefix = importedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(prefix) ? prefix : importedAt;
}
