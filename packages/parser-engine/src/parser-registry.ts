/**
 * Parser registry for the SpendStack import system.
 *
 * All bank parsers are registered here.  The registry is queried during the
 * import pipeline to auto-detect the correct parser for a given file.
 */

import type { ParserDefinition, FileType, BankName } from './core/types.js';
import { iciciBankCsvParser } from './banks/icici/csv-parser.js';
import { bankOfBarodaCsvParser } from './banks/bank-of-baroda/csv-parser.js';
import { kotakBankCsvParser } from './banks/kotak/csv-parser.js';

/** Ordered list of all registered parsers. Detection is attempted in this order. */
const REGISTERED_PARSERS: ParserDefinition[] = [
  iciciBankCsvParser,
  bankOfBarodaCsvParser,
  kotakBankCsvParser,
];

/**
 * Attempts to find a parser that can handle the given content by calling
 * each registered parser's `detect()` method in registration order.
 *
 * @param content  Raw file content (string).
 * @param fileType File type hint (optional; used to pre-filter candidates).
 * @returns The first matching parser, or null if none matched.
 */
export function resolveParser(
  content: string,
  fileType?: FileType,
): ParserDefinition | null {
  const candidates = fileType
    ? REGISTERED_PARSERS.filter((p) => p.supportedFileTypes.includes(fileType))
    : REGISTERED_PARSERS;

  for (const parser of candidates) {
    if (parser.detect(content)) return parser;
  }

  return null;
}

/**
 * Returns a parser by its stable parserId, or null if not found.
 * Useful for resuming an import job that was interrupted.
 */
export function getParserById(parserId: string): ParserDefinition | null {
  return REGISTERED_PARSERS.find((p) => p.parserId === parserId) ?? null;
}

/**
 * Returns all parsers that support the given bank and (optionally) file type.
 */
export function getParsersForBank(
  bankName: BankName,
  fileType?: FileType,
): ParserDefinition[] {
  return REGISTERED_PARSERS.filter(
    (p) =>
      p.bankName === bankName &&
      (fileType === undefined || p.supportedFileTypes.includes(fileType)),
  );
}

/** Returns all registered parsers (read-only snapshot). */
export function listParsers(): readonly ParserDefinition[] {
  return REGISTERED_PARSERS;
}
