/**
 * Diagnostics bundle writer for SpendStack.
 *
 * Serialises a `DiagnosticsBundle` to a JSON file on disk.
 * The result object clearly communicates success or failure so that callers
 * can report the outcome to users without relying on exceptions.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DiagnosticsBundle } from '@spendstack/shared';

export interface WriteBundleResult {
  /** Whether the write completed successfully. */
  success: boolean;
  /** Absolute path of the file that was written (present on success). */
  filePath?: string;
  /** Human-readable error description (present on failure). */
  error?: string;
}

/**
 * Serialises `bundle` as pretty-printed JSON and writes it to `filePath`.
 *
 * - Automatically creates any missing parent directories.
 * - Never throws; all errors are captured in the returned result.
 *
 * @example
 * ```ts
 * const result = writeDiagnosticsBundle(bundle, '/tmp/diag-2024.json');
 * if (!result.success) {
 *   console.error('Export failed:', result.error);
 * }
 * ```
 */
export function writeDiagnosticsBundle(
  bundle: DiagnosticsBundle,
  filePath: string,
): WriteBundleResult {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const content = JSON.stringify(bundle, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
