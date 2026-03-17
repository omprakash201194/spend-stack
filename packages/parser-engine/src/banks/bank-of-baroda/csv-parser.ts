/**
 * Bank of Baroda CSV statement parser.
 *
 * Expected CSV column layout (header row required):
 *   Tran Date, Description, Ref No., Debit Amount, Credit Amount, Balance
 *
 * Date format: DD-MM-YYYY
 * Amount format: plain decimal, commas allowed
 *
 * Parser ID  : bob-csv-v1
 * Parser Ver : 1.0.0
 */

import type { ParserDefinition, RawStatementRow, NormalizedTransaction, ParseResult } from '../../core/types.js';
import { parseDate, parseAmount, normalizeDescription, parseCsvRow, splitLines } from '../../core/normalization.js';

const PARSER_ID = 'bob-csv-v1';
const PARSER_VERSION = '1.0.0';

const REQUIRED_HEADERS = ['tran date', 'description', 'debit amount', 'credit amount', 'balance'];

interface ColumnMap {
  tranDate: number;
  description: number;
  refNo: number;
  debitAmount: number;
  creditAmount: number;
  balance: number;
}

function resolveColumns(headers: string[]): ColumnMap | null {
  const lower = headers.map((h) => h.toLowerCase().trim());

  const tranDate = lower.findIndex((h) => h.includes('tran date') || h.includes('transaction date'));
  const description = lower.findIndex((h) => h.includes('description') || h.includes('narration') || h.includes('particulars'));
  const refNo = lower.findIndex((h) => h.includes('ref') || h.includes('cheque'));
  const debitAmount = lower.findIndex((h) => h.includes('debit'));
  const creditAmount = lower.findIndex((h) => h.includes('credit'));
  const balance = lower.findIndex((h) => h === 'balance' || h.includes('closing balance'));

  if ([tranDate, description, debitAmount, creditAmount, balance].some((i) => i === -1)) {
    return null;
  }

  return {
    tranDate,
    description,
    refNo: refNo === -1 ? -1 : refNo,
    debitAmount,
    creditAmount,
    balance,
  };
}

export const bankOfBarodaCsvParser: ParserDefinition = {
  parserId: PARSER_ID,
  bankName: 'bank-of-baroda',
  supportedFileTypes: ['csv'],
  parserVersion: PARSER_VERSION,

  detect(content: string): boolean {
    const lines = splitLines(content);
    if (lines.length === 0) return false;
    const headers = parseCsvRow(lines[0]!).map((h) => h.toLowerCase().trim());
    return REQUIRED_HEADERS.every((req) => headers.some((h) => h.includes(req)));
  },

  extract(content: string): RawStatementRow[] {
    const lines = splitLines(content);
    if (lines.length < 2) return [];

    const headers = parseCsvRow(lines[0]!);
    const cols = resolveColumns(headers);
    if (!cols) return [];

    const rows: RawStatementRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      const fields = parseCsvRow(line);

      const dateText = fields[cols.tranDate] ?? '';
      const descText = fields[cols.description] ?? '';
      const debitText = fields[cols.debitAmount] ?? '';
      const creditText = fields[cols.creditAmount] ?? '';
      const balanceText = fields[cols.balance] ?? '';
      const refNoText = cols.refNo >= 0 ? (fields[cols.refNo] ?? '') : '';

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
      });
    }

    return result;
  },

  validate(result: ParseResult): ParseResult {
    const warnings = [...result.parserWarnings];
    let highConfidence = 0;
    let lowConfidence = 0;
    let failed = 0;

    for (const tx of result.normalizedCandidates) {
      if (!tx.date || (!tx.debitAmount && !tx.creditAmount)) {
        failed += 1;
        warnings.push(`Row with description "${tx.description}" is missing required fields.`);
      } else if (!tx.description) {
        lowConfidence += 1;
        warnings.push(`Transaction on ${tx.date} has an empty description.`);
      } else {
        highConfidence += 1;
      }
    }

    return {
      ...result,
      parserWarnings: warnings,
      confidenceSummary: {
        totalRows: result.rawRows.length,
        highConfidence,
        lowConfidence,
        failed,
      },
    };
  },
};
