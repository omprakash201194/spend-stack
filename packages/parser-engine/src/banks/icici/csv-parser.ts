/**
 * ICICI Bank CSV statement parser.
 *
 * Expected CSV column layout (header row required):
 *   Transaction Date, Value Date, Description, Ref No./Cheque No., Debit, Credit, Balance
 *
 * Date format: DD/MM/YYYY
 * Amount format: plain decimal, commas allowed (e.g. "1,00,000.00")
 *
 * Real ICICI Internet Banking CSV exports may include up to a few rows of
 * account metadata (account number, date range, etc.) before the transaction
 * header row.  Both detect() and extract() scan the first
 * HEADER_SEARCH_LIMIT lines so these preamble rows are handled gracefully.
 *
 * Parser ID  : icici-csv-v1
 * Parser Ver : 1.0.0
 */

import type { ParserDefinition, RawStatementRow, NormalizedTransaction, ParseResult } from '../../core/types.js';
import { parseDate, parseAmount, normalizeDescription, parseCsvRow, splitLines } from '../../core/normalization.js';

const PARSER_ID = 'icici-csv-v1';
const PARSER_VERSION = '1.0.0';

/**
 * Maximum number of leading lines to scan when searching for the transaction
 * header row.  ICICI CSV exports may include account-number / date-range rows
 * before the actual column headers.
 */
const HEADER_SEARCH_LIMIT = 5;

// Column indices after parsing the header row
interface ColumnMap {
  transactionDate: number;
  description: number;
  refNo: number;
  debit: number;
  credit: number;
  balance: number;
}

function resolveColumns(headers: string[]): ColumnMap | null {
  const lower = headers.map((h) => h.toLowerCase().trim());

  const transactionDate = lower.findIndex((h) => h.includes('transaction date'));
  const description = lower.findIndex((h) => h.includes('description'));
  const refNo = lower.findIndex((h) => h.includes('ref no') || h.includes('cheque'));
  const debit = lower.findIndex((h) => h === 'debit');
  const credit = lower.findIndex((h) => h === 'credit');
  const balance = lower.findIndex((h) => h === 'balance');

  if ([transactionDate, description, debit, credit, balance].some((i) => i === -1)) {
    return null;
  }

  return { transactionDate, description, refNo: refNo === -1 ? -1 : refNo, debit, credit, balance };
}

/**
 * Scans the first HEADER_SEARCH_LIMIT lines of `lines` for the ICICI
 * transaction-table header.  Returns the index of that line, or -1 when not
 * found.
 *
 * Uses resolveColumns() for matching so that detect() and extract() rely on
 * identical column-mapping rules — preventing detect() from returning true for
 * a line that extract() cannot actually map.
 */
function findHeaderLineIndex(lines: string[]): number {
  const limit = Math.min(lines.length, HEADER_SEARCH_LIMIT);
  for (let i = 0; i < limit; i++) {
    const headers = parseCsvRow(lines[i]!);
    if (resolveColumns(headers) !== null) {
      return i;
    }
  }
  return -1;
}

export const iciciBankCsvParser: ParserDefinition = {
  parserId: PARSER_ID,
  bankName: 'icici',
  supportedFileTypes: ['csv'],
  parserVersion: PARSER_VERSION,

  detect(content: string): boolean {
    const lines = splitLines(content);
    return findHeaderLineIndex(lines) !== -1;
  },

  extract(content: string): RawStatementRow[] {
    const lines = splitLines(content);
    const headerIdx = findHeaderLineIndex(lines);
    if (headerIdx === -1) return [];

    const headers = parseCsvRow(lines[headerIdx]!);
    const cols = resolveColumns(headers);
    if (!cols) return [];

    const rows: RawStatementRow[] = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i]!;
      const fields = parseCsvRow(line);

      const dateText = fields[cols.transactionDate] ?? '';
      const descText = fields[cols.description] ?? '';
      const debitText = fields[cols.debit] ?? '';
      const creditText = fields[cols.credit] ?? '';
      const balanceText = fields[cols.balance] ?? '';
      const refNoText = cols.refNo >= 0 ? (fields[cols.refNo] ?? '') : '';

      // Skip rows where both debit and credit are blank (likely summary rows)
      if (!debitText && !creditText) continue;

      rows.push({
        sourceReference: `row-${i}`,
        rawText: line,
        extractedDateText: dateText,
        extractedAmountText: debitText || creditText,
        extractedDescriptionText: descText,
        extractionMetadata: {
          debitText,
          creditText,
          balanceText,
          refNoText,
          parserVersion: PARSER_VERSION,
        },
      });
    }

    return rows;
  },

  normalize(rows: RawStatementRow[]): NormalizedTransaction[] {
    const result: NormalizedTransaction[] = [];

    for (const row of rows) {
      const meta = row.extractionMetadata as {
        debitText?: string;
        creditText?: string;
        balanceText?: string;
        refNoText?: string;
      };

      const date = parseDate(row.extractedDateText);
      if (!date) continue;

      const debitAmount = parseAmount(meta.debitText ?? '');
      const creditAmount = parseAmount(meta.creditText ?? '');

      if (debitAmount === null && creditAmount === null) continue;

      const signedAmount =
        creditAmount !== null ? creditAmount : -(debitAmount ?? 0);

      result.push({
        date,
        description: normalizeDescription(row.extractedDescriptionText),
        debitAmount,
        creditAmount,
        signedAmount,
        balanceIfAvailable: parseAmount(meta.balanceText ?? ''),
        currency: 'INR',
        rawReference: meta.refNoText ?? '',
        sourceReference: row.sourceReference,
      });
    }

    return result;
  },

  validate(result: ParseResult): ParseResult {
    const warnings = [...result.parserWarnings];
    const parseErrors = [...result.parseErrors];
    let highConfidence = 0;
    let lowConfidence = 0;
    let failed = 0;

    for (const tx of result.normalizedCandidates) {
      const missingDate = !tx.date;
      const missingAmount = tx.debitAmount === null && tx.creditAmount === null;

      if (missingDate || missingAmount) {
        failed += 1;
        if (missingDate) {
          const msg = `Row with description "${tx.description}" is missing a date.`;
          warnings.push(msg);
          parseErrors.push({ code: 'missing_date', message: msg, severity: 'error', sourceReference: tx.sourceReference });
        }
        if (missingAmount) {
          const msg = `Row with description "${tx.description}" is missing an amount.`;
          warnings.push(msg);
          parseErrors.push({ code: 'missing_amount', message: msg, severity: 'error', sourceReference: tx.sourceReference });
        }
      } else if (!tx.description) {
        lowConfidence += 1;
        const msg = `Transaction on ${tx.date} has an empty description.`;
        warnings.push(msg);
        parseErrors.push({
          code: 'empty_description',
          message: msg,
          severity: 'warning',
          sourceReference: tx.sourceReference,
        });
      } else {
        highConfidence += 1;
      }
    }

    return {
      ...result,
      parserWarnings: warnings,
      parseErrors,
      confidenceSummary: {
        totalRows: result.rawRows.length,
        highConfidence,
        lowConfidence,
        failed,
      },
    };
  },
};
