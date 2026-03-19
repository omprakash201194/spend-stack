/**
 * Kotak Mahindra Bank CSV statement parser.
 *
 * Expected CSV column layout (header row required):
 *   Transaction Date, Description, Chq./Ref.No., Withdrawal Amt., Deposit Amt., Closing Balance
 *
 * Date format: DD-MM-YYYY
 * Amount format: plain decimal, commas allowed
 *
 * Parser ID  : kotak-csv-v1
 * Parser Ver : 1.0.0
 */

import type { ParserDefinition, RawStatementRow, NormalizedTransaction, ParseResult } from '../../core/types.js';
import { parseDate, parseAmount, normalizeDescription, parseCsvRow, splitLines } from '../../core/normalization.js';

const PARSER_ID = 'kotak-csv-v1';
const PARSER_VERSION = '1.0.0';

const REQUIRED_HEADERS = [
  'transaction date',
  'description',
  'withdrawal amt',
  'deposit amt',
  'closing balance',
];

interface ColumnMap {
  transactionDate: number;
  description: number;
  refNo: number;
  withdrawalAmt: number;
  depositAmt: number;
  closingBalance: number;
}

function resolveColumns(headers: string[]): ColumnMap | null {
  const lower = headers.map((h) => h.toLowerCase().trim());

  const transactionDate = lower.findIndex((h) => h.includes('transaction date') || h === 'date');
  const description = lower.findIndex((h) => h.includes('description') || h.includes('narration'));
  const refNo = lower.findIndex((h) => h.includes('chq') || h.includes('ref'));
  const withdrawalAmt = lower.findIndex((h) => h.includes('withdrawal'));
  const depositAmt = lower.findIndex((h) => h.includes('deposit'));
  const closingBalance = lower.findIndex(
    (h) => h.includes('closing balance') || h === 'balance',
  );

  if ([transactionDate, description, withdrawalAmt, depositAmt, closingBalance].some((i) => i === -1)) {
    return null;
  }

  return {
    transactionDate,
    description,
    refNo: refNo === -1 ? -1 : refNo,
    withdrawalAmt,
    depositAmt,
    closingBalance,
  };
}

export const kotakBankCsvParser: ParserDefinition = {
  parserId: PARSER_ID,
  bankName: 'kotak',
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

      const dateText = fields[cols.transactionDate] ?? '';
      const descText = fields[cols.description] ?? '';
      const withdrawalText = fields[cols.withdrawalAmt] ?? '';
      const depositText = fields[cols.depositAmt] ?? '';
      const balanceText = fields[cols.closingBalance] ?? '';
      const refNoText = cols.refNo >= 0 ? (fields[cols.refNo] ?? '') : '';

      if (!withdrawalText && !depositText) continue;

      rows.push({
        sourceReference: `row-${i}`,
        rawText: line,
        extractedDateText: dateText,
        extractedAmountText: withdrawalText || depositText,
        extractedDescriptionText: descText,
        extractionMetadata: {
          withdrawalText,
          depositText,
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
        withdrawalText?: string;
        depositText?: string;
        balanceText?: string;
        refNoText?: string;
      };

      const date = parseDate(row.extractedDateText);
      if (!date) continue;

      const debitAmount = parseAmount(meta.withdrawalText ?? '');
      const creditAmount = parseAmount(meta.depositText ?? '');

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
          parseErrors.push({ code: 'missing_date', message: msg, severity: 'error' });
        }
        if (missingAmount) {
          const msg = `Row with description "${tx.description}" is missing an amount.`;
          warnings.push(msg);
          parseErrors.push({ code: 'missing_amount', message: msg, severity: 'error' });
        }
      } else if (!tx.description) {
        lowConfidence += 1;
        const msg = `Transaction on ${tx.date} has an empty description.`;
        warnings.push(msg);
        parseErrors.push({
          code: 'empty_description',
          message: msg,
          severity: 'warning',
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
