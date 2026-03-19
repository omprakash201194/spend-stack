import { describe, it, expect } from 'vitest';
import { runImportPipeline, ImportPipelineError } from './import-pipeline.js';

const ICICI_CSV = `Transaction Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
05/01/2024,05/01/2024,NEFT/987654321/SALARY CREDIT,,,50000.00,100000.00
10/01/2024,10/01/2024,ATM WITHDRAWAL,,5000.00,,95000.00
15/01/2024,15/01/2024,UPI/SWIGGY,,450.00,,94550.00`;

const KOTAK_CSV = `Transaction Date,Description,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance
05-01-2024,IMPS SALARY,REF001,,50000.00,100000.00
10-01-2024,ATM DEBIT,REF002,2000.00,,98000.00`;

const UNKNOWN_CSV = `Date,Narration,Amount
01/01/2024,PAYMENT,500.00`;

describe('runImportPipeline — ICICI CSV', () => {
  it('completes successfully for a valid ICICI CSV', () => {
    const result = runImportPipeline({
      fileId: 'file-001',
      fileName: 'icici-jan-2024.csv',
      fileContent: ICICI_CSV,
      fileType: 'csv',
      accountId: 'acc-1',
      uploadedByUserId: 'user-1',
    });

    expect(result.status).toBe('finalized');
    expect(result.parserId).toBe('icici-csv-v1');
    expect(result.rawRows.length).toBe(3);
    expect(result.normalizedTransactions.length).toBe(3);
    expect(result.metrics.totalRowsDetected).toBe(3);
    expect(result.metrics.rowsParsed).toBe(3);
  });

  it('creates a StatementFile with auto_delete retention', () => {
    const result = runImportPipeline({
      fileId: 'file-002',
      fileName: 'statement.csv',
      fileContent: ICICI_CSV,
      fileType: 'csv',
      accountId: 'acc-1',
      uploadedByUserId: 'user-1',
    });

    expect(result.statementFile.id).toBe('file-002');
    expect(result.statementFile.retentionPolicy).toBe('auto_delete');
    expect(result.statementFile.deleteAfterAt).not.toBeNull();
  });

  it('detects exact duplicate transactions', () => {
    // The ICICI parser normalizes the description to upper case.
    // We supply an existing transaction that exactly matches the normalized output.
    const existingTx = {
      date: '2024-01-05',
      description: 'NEFT/987654321/SALARY CREDIT',
      debitAmount: null,
      creditAmount: 50000,
      signedAmount: 50000,
      balanceIfAvailable: 100000,
      currency: 'INR',
      rawReference: '',
    };

    const result = runImportPipeline({
      fileId: 'file-003',
      fileName: 'statement.csv',
      fileContent: ICICI_CSV,
      fileType: 'csv',
      accountId: 'acc-1',
      uploadedByUserId: 'user-1',
      existingTransactions: [existingTx],
    });

    expect(result.metrics.duplicateRowsSkipped).toBeGreaterThanOrEqual(1);
    // Salary transaction was already there — should not be in unique list
    const salaryInUnique = result.normalizedTransactions.some(
      (t) => t.description.includes('SALARY'),
    );
    expect(salaryInUnique).toBe(false);
  });

  it('records the parser version on the result', () => {
    const result = runImportPipeline({
      fileId: 'file-004',
      fileName: 'statement.csv',
      fileContent: ICICI_CSV,
      fileType: 'csv',
      accountId: 'acc-1',
      uploadedByUserId: 'user-1',
    });
    expect(result.parserVersion).toBe('1.0.0');
  });

  it('returns an empty parseErrors array for a clean statement', () => {
    const result = runImportPipeline({
      fileId: 'file-005',
      fileName: 'statement.csv',
      fileContent: ICICI_CSV,
      fileType: 'csv',
      accountId: 'acc-1',
      uploadedByUserId: 'user-1',
    });
    expect(result.parseErrors).toHaveLength(0);
  });
});

describe('runImportPipeline — Kotak CSV', () => {
  it('resolves the Kotak parser and normalizes transactions', () => {
    const result = runImportPipeline({
      fileId: 'file-010',
      fileName: 'kotak-jan-2024.csv',
      fileContent: KOTAK_CSV,
      fileType: 'csv',
      accountId: 'acc-2',
      uploadedByUserId: 'user-1',
    });
    expect(result.parserId).toBe('kotak-csv-v1');
    expect(result.normalizedTransactions.length).toBe(2);
  });
});

describe('runImportPipeline — unsupported format', () => {
  it('returns status=failed when no parser is found', () => {
    const result = runImportPipeline({
      fileId: 'file-100',
      fileName: 'unknown.csv',
      fileContent: UNKNOWN_CSV,
      fileType: 'csv',
      accountId: 'acc-1',
      uploadedByUserId: 'user-1',
    });

    expect(result.status).toBe('failed');
    expect(result.parserId).toBe('unknown');
    expect(result.parserWarnings.length).toBeGreaterThan(0);
    expect(result.normalizedTransactions).toHaveLength(0);
  });

  it('populates parseErrors with an unsupported_format error when no parser is found', () => {
    const result = runImportPipeline({
      fileId: 'file-101',
      fileName: 'unknown.csv',
      fileContent: UNKNOWN_CSV,
      fileType: 'csv',
      accountId: 'acc-1',
      uploadedByUserId: 'user-1',
    });

    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]?.code).toBe('unsupported_format');
    expect(result.parseErrors[0]?.severity).toBe('error');
  });
});

describe('runImportPipeline — retention policy', () => {
  it('respects the "keep" retention policy', () => {
    const result = runImportPipeline({
      fileId: 'file-200',
      fileName: 'keep.csv',
      fileContent: ICICI_CSV,
      fileType: 'csv',
      accountId: 'acc-1',
      uploadedByUserId: 'user-1',
      retentionPolicy: 'keep',
    });
    expect(result.statementFile.retentionPolicy).toBe('keep');
    expect(result.statementFile.deleteAfterAt).toBeNull();
  });
});

describe('ImportPipelineError', () => {
  it('is an Error with the correct name', () => {
    const err = new ImportPipelineError('something went wrong', 'file-x');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ImportPipelineError');
    expect(err.fileId).toBe('file-x');
    expect(err.message).toBe('something went wrong');
  });
});
