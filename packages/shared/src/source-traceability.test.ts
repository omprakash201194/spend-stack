import { describe, it, expect } from 'vitest';
import {
  buildTraceStore,
  getTraceForTransaction,
  getTracesForFile,
  getTraceBySourceRef,
  hasTraceData,
  getImportJobIds,
  formatTraceForDisplay,
} from './source-traceability.js';
import type { SourceTraceRecord } from './source-traceability.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const record1: SourceTraceRecord = {
  normalizedIndex: 0,
  sourceReference: '2',
  sourceFileId: 'file-001',
  sourceFileName: 'icici-jan-2024.csv',
  importJobId: 'job-001',
  parserId: 'icici-csv-v1',
  parserVersion: '1.0.0',
  importedAt: '2024-01-05T10:00:00.000Z',
  rawText: '05/01/2024,SALARY,,,50000.00,100000.00',
};

const record2: SourceTraceRecord = {
  normalizedIndex: 1,
  sourceReference: '3',
  sourceFileId: 'file-001',
  sourceFileName: 'icici-jan-2024.csv',
  importJobId: 'job-001',
  parserId: 'icici-csv-v1',
  parserVersion: '1.0.0',
  importedAt: '2024-01-05T10:00:00.000Z',
  rawText: '10/01/2024,ATM,,5000.00,,95000.00',
};

const record3: SourceTraceRecord = {
  normalizedIndex: 0,
  sourceReference: '2',
  sourceFileId: 'file-002',
  sourceFileName: 'kotak-feb-2024.csv',
  importJobId: 'job-002',
  parserId: 'kotak-csv-v1',
  parserVersion: '1.0.0',
  importedAt: '2024-02-01T08:30:00.000Z',
};

// ---------------------------------------------------------------------------
// buildTraceStore
// ---------------------------------------------------------------------------

describe('buildTraceStore', () => {
  it('returns a store with size 0 for an empty array', () => {
    const store = buildTraceStore([]);
    expect(store.size).toBe(0);
  });

  it('returns a store with the correct size', () => {
    const store = buildTraceStore([record1, record2, record3]);
    expect(store.size).toBe(3);
  });

  it('indexes records by importJobId and normalizedIndex', () => {
    const store = buildTraceStore([record1, record2]);
    const result = getTraceForTransaction(store, 'job-001', 0);
    expect(result).toBe(record1);
  });

  it('indexes records from multiple jobs independently', () => {
    const store = buildTraceStore([record1, record2, record3]);
    expect(getTraceForTransaction(store, 'job-001', 0)).toBe(record1);
    expect(getTraceForTransaction(store, 'job-002', 0)).toBe(record3);
  });

  it('indexes records by sourceFileId', () => {
    const store = buildTraceStore([record1, record2, record3]);
    const fileTraces = getTracesForFile(store, 'file-001');
    expect(fileTraces).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getTraceForTransaction
// ---------------------------------------------------------------------------

describe('getTraceForTransaction', () => {
  it('returns the matching record', () => {
    const store = buildTraceStore([record1, record2]);
    expect(getTraceForTransaction(store, 'job-001', 1)).toBe(record2);
  });

  it('returns null for an unknown importJobId', () => {
    const store = buildTraceStore([record1]);
    expect(getTraceForTransaction(store, 'job-999', 0)).toBeNull();
  });

  it('returns null for an unknown normalizedIndex', () => {
    const store = buildTraceStore([record1]);
    expect(getTraceForTransaction(store, 'job-001', 99)).toBeNull();
  });

  it('returns null from an empty store', () => {
    const store = buildTraceStore([]);
    expect(getTraceForTransaction(store, 'job-001', 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getTracesForFile
// ---------------------------------------------------------------------------

describe('getTracesForFile', () => {
  it('returns all records for a file', () => {
    const store = buildTraceStore([record1, record2, record3]);
    const traces = getTracesForFile(store, 'file-001');
    expect(traces).toHaveLength(2);
    expect(traces).toContain(record1);
    expect(traces).toContain(record2);
  });

  it('returns an empty array for an unknown fileId', () => {
    const store = buildTraceStore([record1]);
    expect(getTracesForFile(store, 'file-999')).toHaveLength(0);
  });

  it('returns an empty array from an empty store', () => {
    const store = buildTraceStore([]);
    expect(getTracesForFile(store, 'file-001')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getTraceBySourceRef
// ---------------------------------------------------------------------------

describe('getTraceBySourceRef', () => {
  it('returns the matching record', () => {
    const store = buildTraceStore([record1, record2]);
    const result = getTraceBySourceRef(store, 'job-001', '3');
    expect(result).toBe(record2);
  });

  it('returns null for an unknown sourceReference', () => {
    const store = buildTraceStore([record1]);
    expect(getTraceBySourceRef(store, 'job-001', 'row-999')).toBeNull();
  });

  it('returns null for an unknown importJobId', () => {
    const store = buildTraceStore([record1]);
    expect(getTraceBySourceRef(store, 'job-999', '2')).toBeNull();
  });

  it('returns null from an empty store', () => {
    const store = buildTraceStore([]);
    expect(getTraceBySourceRef(store, 'job-001', '2')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasTraceData
// ---------------------------------------------------------------------------

describe('hasTraceData', () => {
  it('returns false for an empty store', () => {
    expect(hasTraceData(buildTraceStore([]))).toBe(false);
  });

  it('returns true when the store has at least one record', () => {
    expect(hasTraceData(buildTraceStore([record1]))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getImportJobIds
// ---------------------------------------------------------------------------

describe('getImportJobIds', () => {
  it('returns an empty array for an empty store', () => {
    expect(getImportJobIds(buildTraceStore([]))).toHaveLength(0);
  });

  it('returns unique job IDs', () => {
    const store = buildTraceStore([record1, record2, record3]);
    const ids = getImportJobIds(store);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('job-001');
    expect(ids).toContain('job-002');
  });

  it('returns a single ID when all records share the same job', () => {
    const store = buildTraceStore([record1, record2]);
    expect(getImportJobIds(store)).toEqual(['job-001']);
  });
});

// ---------------------------------------------------------------------------
// formatTraceForDisplay
// ---------------------------------------------------------------------------

describe('formatTraceForDisplay', () => {
  it('includes the file name', () => {
    expect(formatTraceForDisplay(record1)).toContain('icici-jan-2024.csv');
  });

  it('includes the sourceReference', () => {
    expect(formatTraceForDisplay(record1)).toContain('row 2');
  });

  it('includes the parserId', () => {
    expect(formatTraceForDisplay(record1)).toContain('icici-csv-v1');
  });

  it('includes the date portion of importedAt', () => {
    expect(formatTraceForDisplay(record1)).toContain('2024-01-05');
  });

  it('produces a single line with no newlines', () => {
    const output = formatTraceForDisplay(record1);
    expect(output).not.toContain('\n');
  });

  it('works for a record without rawText', () => {
    const output = formatTraceForDisplay(record3);
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  it('falls back gracefully when importedAt is not a standard ISO string', () => {
    const malformed: SourceTraceRecord = {
      ...record1,
      importedAt: 'not-a-date',
    };
    // Should not throw; the full string is used as the date label.
    const output = formatTraceForDisplay(malformed);
    expect(output).toContain('not-a-date');
  });
});

// ---------------------------------------------------------------------------
// Audit integration — trace.queried event type
// ---------------------------------------------------------------------------

describe('trace.queried audit event type', () => {
  it('is a valid AuditEventType accepted by createAuditEvent', async () => {
    const { createAuditEvent } = await import('./audit.js');
    const event = createAuditEvent({
      type: 'trace.queried',
      actorId: 'user-1',
      resourceType: 'transaction',
      resourceId: 'tx-42',
      metadata: { importJobId: 'job-001', normalizedIndex: 0 },
    });
    expect(event.type).toBe('trace.queried');
    expect(event.metadata['importJobId']).toBe('job-001');
  });

  it('supports a full query-then-audit workflow', async () => {
    const { createAuditEvent, appendAuditEvent } = await import('./audit.js');

    const store = buildTraceStore([record1, record2]);
    const trace = getTraceForTransaction(store, 'job-001', 0);

    // Trace was found — record a trace.queried audit event.
    expect(trace).not.toBeNull();

    let log = [] as Awaited<ReturnType<typeof appendAuditEvent>>[];
    const auditEvent = createAuditEvent({
      type: 'trace.queried',
      actorId: 'user-1',
      resourceType: 'transaction',
      resourceId: 'tx-42',
      metadata: {
        importJobId: trace!.importJobId,
        normalizedIndex: trace!.normalizedIndex,
        sourceFileId: trace!.sourceFileId,
      },
    });
    log = appendAuditEvent(log as never, auditEvent) as never;

    expect(log).toHaveLength(1);
    const recorded = (log as unknown as typeof auditEvent[])[0]!;
    expect(recorded.type).toBe('trace.queried');
    expect(recorded.metadata['sourceFileId']).toBe('file-001');
  });
});
