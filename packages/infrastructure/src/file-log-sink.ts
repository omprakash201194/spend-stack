/**
 * File-based log sink with automatic rotation for SpendStack.
 *
 * Writes structured JSON-lines entries to a rotating set of local log files.
 * Compatible with the `createLogger` sink API from @spendstack/shared.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { LogEntry } from '@spendstack/shared';

export interface FileLogSinkOptions {
  /**
   * Directory where log files are written.
   * Typically `app.getPath('userData')` from Electron.
   */
  logDir: string;

  /**
   * Base name for log files (without extension).
   * Defaults to 'spendstack'.
   * Files are named `<baseName>.log`, `<baseName>.1.log`, etc.
   */
  baseName?: string;

  /**
   * Maximum size in bytes of a single log file before rotation.
   * Defaults to 5 MB.
   */
  maxFileSize?: number;

  /**
   * Maximum number of rotated log files to retain (not counting the active one).
   * Older files beyond this count are deleted.
   * Defaults to 4 (so up to 5 files total including the active one).
   */
  maxRotatedFiles?: number;
}

const DEFAULT_BASE_NAME = 'spendstack';
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_ROTATED_FILES = 4;

/**
 * Creates a file-based log sink that writes JSON-lines log entries to disk
 * and rotates files when they exceed `maxFileSize`.
 *
 * The returned function matches the `sink` parameter of `createLogger()`.
 *
 * @example
 * ```ts
 * const sink = createFileLogSink({ logDir: app.getPath('userData') });
 * const log = createLogger({ context: 'main', sink });
 * log.info('Application started');
 * ```
 */
export function createFileLogSink(options: FileLogSinkOptions): (entry: LogEntry) => void {
  const {
    logDir,
    baseName = DEFAULT_BASE_NAME,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxRotatedFiles = DEFAULT_MAX_ROTATED_FILES,
  } = options;

  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (err) {
    // If we cannot create the log directory, fall back to console-only output.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[spendstack] Failed to create log directory "${logDir}": ${msg}`);
    return (entry: LogEntry) => {
      console.error(JSON.stringify(entry));
    };
  }

  const activeLogPath = path.join(logDir, `${baseName}.log`);

  function rotateIfNeeded(): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(activeLogPath);
    } catch {
      // File does not exist yet — nothing to rotate.
      return;
    }

    if (stat.size < maxFileSize) return;

    try {
      // Remove the oldest rotated file if we are at the limit.
      const oldest = path.join(logDir, `${baseName}.${maxRotatedFiles}.log`);
      if (fs.existsSync(oldest)) {
        fs.unlinkSync(oldest);
      }

      // Shift existing rotated files up by one index.
      for (let i = maxRotatedFiles - 1; i >= 1; i--) {
        const src = path.join(logDir, `${baseName}.${i}.log`);
        const dst = path.join(logDir, `${baseName}.${i + 1}.log`);
        if (fs.existsSync(src)) {
          fs.renameSync(src, dst);
        }
      }

      // Rename the active log to the first rotated slot.
      fs.renameSync(activeLogPath, path.join(logDir, `${baseName}.1.log`));
    } catch (err) {
      // Rotation failures must not crash the app; the active log will simply
      // continue growing until the next successful rotation attempt.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[spendstack] Log rotation failed: ${msg}`);
    }
  }

  return function sink(entry: LogEntry): void {
    rotateIfNeeded();
    const line = JSON.stringify(entry) + '\n';
    try {
      fs.appendFileSync(activeLogPath, line, 'utf8');
    } catch (err) {
      // If the file write fails (e.g. disk full), fall back to stderr so the
      // entry is not silently lost.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[spendstack] Failed to write log entry: ${msg}\n${line}`);
    }
  };
}
