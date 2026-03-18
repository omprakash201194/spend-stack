import React, { useCallback, useRef, useState } from 'react';
import { runImportPipeline } from '@spendstack/parser-engine';
import type { FileType } from '@spendstack/parser-engine';

const SUPPORTED_BANKS = ['ICICI Bank', 'Bank of Baroda', 'Kotak Bank'];
const SUPPORTED_FORMATS = ['PDF', 'CSV', 'XLSX'];

/** Maps a file extension or MIME type to a FileType understood by the pipeline. */
const EXTENSION_TO_FILE_TYPE: Record<string, FileType> = {
  csv: 'csv',
  xlsx: 'xlsx',
  xls: 'xlsx',
  pdf: 'pdf',
};

const ACCEPTED_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_FILE_TYPE));

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type ImportPhase =
  | { kind: 'idle' }
  | { kind: 'dragging' }
  | { kind: 'processing'; fileName: string }
  | {
      kind: 'done';
      fileName: string;
      importJobId: string;
      parserId: string;
      metrics: { totalRowsDetected: number; rowsParsed: number; duplicateRowsSkipped: number; rowsFlaggedForReview: number };
      reviewRequired: boolean;
      warnings: string[];
    }
  | { kind: 'unsupported'; fileName: string }
  | { kind: 'error'; fileName: string; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  return lastDot !== -1 ? name.slice(lastDot + 1).toLowerCase() : '';
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ImportView() {
  const [phase, setPhase] = useState<ImportPhase>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File processing ──────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    const ext = getExtension(file.name);

    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      setPhase({ kind: 'unsupported', fileName: file.name });
      return;
    }

    const fileType = EXTENSION_TO_FILE_TYPE[ext]!;
    setPhase({ kind: 'processing', fileName: file.name });

    try {
      const fileContent = await readFileAsText(file);
      const fileId = generateFileId();

      const result = runImportPipeline({
        fileId,
        fileName: file.name,
        fileContent,
        fileType,
        accountId: 'default',
        uploadedByUserId: 'local-user',
      });

      setPhase({
        kind: 'done',
        fileName: file.name,
        importJobId: result.importJobId,
        parserId: result.parserId,
        metrics: result.metrics,
        reviewRequired: result.reviewRequired,
        warnings: result.parserWarnings,
      });
    } catch (err) {
      setPhase({
        kind: 'error',
        fileName: file.name,
        message: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    }
  }, []);

  // ── Click-to-browse ──────────────────────────────────────────────────────

  function handleDropZoneClick() {
    if (phase.kind === 'processing') return;
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    // Reset so the same file can be re-selected after an error
    e.target.value = '';
  }

  // ── Drag and drop ────────────────────────────────────────────────────────

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (phase.kind !== 'processing') {
      setPhase({ kind: 'dragging' });
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (phase.kind === 'dragging') {
      setPhase({ kind: 'idle' });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (phase.kind === 'processing') return;

    const file = e.dataTransfer.files[0];
    if (file) {
      void processFile(file);
    } else {
      setPhase({ kind: 'idle' });
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  function handleReset() {
    setPhase({ kind: 'idle' });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const isDragging = phase.kind === 'dragging';
  const isProcessing = phase.kind === 'processing';
  const showDropZone = phase.kind === 'idle' || phase.kind === 'dragging' || phase.kind === 'unsupported';

  return (
    <div className="view">
      <header className="view-header">
        <h2 className="view-title">Import Statement</h2>
        <p className="view-subtitle">Upload a bank statement to import your transactions</p>
      </header>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        aria-label="Select statement file"
      />

      {/* Drop zone — shown when idle, dragging, or after an unsupported-file error */}
      {showDropZone && (
        <div
          className={`import-drop-zone${isDragging ? ' import-drop-zone--dragging' : ''}${phase.kind === 'unsupported' ? ' import-drop-zone--error' : ''}`}
          onClick={handleDropZoneClick}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload statement file"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDropZoneClick(); }}
        >
          <p className="empty-state-icon">{isDragging ? '📂' : '⬆'}</p>
          <h3>{isDragging ? 'Release to upload' : 'Drop your statement here'}</h3>
          <p>or click to browse</p>
          {phase.kind === 'unsupported' && (
            <p className="import-validation-error" role="alert">
              ⚠ "{phase.fileName}" is not a supported file type. Please use PDF, CSV, or XLSX.
            </p>
          )}
          <p className="import-hint">
            Supported formats: {SUPPORTED_FORMATS.join(', ')}
          </p>
        </div>
      )}

      {/* Processing / progress */}
      {isProcessing && (
        <div className="import-status" role="status" aria-live="polite">
          <p className="import-status-icon">⏳</p>
          <h3>Importing {phase.fileName}</h3>
          <p>Parsing transactions…</p>
          <div className="import-progress-bar" aria-label="Import progress">
            <div className="import-progress-bar__fill" />
          </div>
        </div>
      )}

      {/* Success result */}
      {phase.kind === 'done' && (
        <div className="import-result">
          <div className="import-result-header">
            <span className="import-result-icon">✅</span>
            <div>
              <h3>Import complete</h3>
              <p className="import-result-meta">{phase.fileName} · Job {phase.importJobId} · Parser: {phase.parserId}</p>
            </div>
          </div>

          <ul className="import-metrics">
            <li className="import-metric">
              <span className="import-metric-value">{phase.metrics.totalRowsDetected}</span>
              <span className="import-metric-label">Rows detected</span>
            </li>
            <li className="import-metric">
              <span className="import-metric-value">{phase.metrics.rowsParsed}</span>
              <span className="import-metric-label">Transactions parsed</span>
            </li>
            <li className="import-metric">
              <span className="import-metric-value">{phase.metrics.duplicateRowsSkipped}</span>
              <span className="import-metric-label">Duplicates skipped</span>
            </li>
            <li className="import-metric">
              <span className="import-metric-value">{phase.metrics.rowsFlaggedForReview}</span>
              <span className="import-metric-label">Flagged for review</span>
            </li>
          </ul>

          {phase.reviewRequired && (
            <p className="import-review-notice" role="alert">
              ⚠ Some transactions need review before they can be finalised.
            </p>
          )}

          {phase.warnings.length > 0 && (
            <ul className="import-warning-list" aria-label="Parser warnings">
              {phase.warnings.map((w, i) => (
                <li key={i} className="import-warning-item">⚠ {w}</li>
              ))}
            </ul>
          )}

          <button className="import-reset-btn" onClick={handleReset}>
            Import another statement
          </button>
        </div>
      )}

      {/* Pipeline error */}
      {phase.kind === 'error' && (
        <div className="import-error" role="alert">
          <p className="import-result-icon">❌</p>
          <h3>Import failed</h3>
          <p className="import-error-filename">{phase.fileName}</p>
          <p className="import-error-message">{phase.message}</p>
          <button className="import-reset-btn" onClick={handleReset}>
            Try again
          </button>
        </div>
      )}

      {/* Supported banks */}
      {(phase.kind === 'idle' || phase.kind === 'unsupported') && (
        <section className="import-banks">
          <h4 className="section-title">Supported Banks</h4>
          <ul className="bank-list">
            {SUPPORTED_BANKS.map((bank) => (
              <li key={bank} className="bank-item">
                {bank}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default ImportView;
