// Core types
export type {
  FileType,
  BankName,
  CurrencyCode,
  NormalizedTransaction,
  RawStatementRow,
  ParseConfidenceSummary,
  ParseResult,
  ParserDefinition,
  ReviewQueueReason,
  ImportJobStatus,
  TransactionSourceTrace,
} from './core/types.js';

// Normalization utilities
export {
  parseDate,
  parseAmount,
  normalizeDescription,
  hashDescription,
  parseCsvRow,
  splitLines,
} from './core/normalization.js';

// Duplicate detection
export {
  computeFingerprint,
  detectDuplicates,
  descriptionSimilarity,
} from './core/duplicate-detector.js';
export type {
  DuplicateFingerprint,
  ExactDuplicate,
  FuzzyCandidate,
  DuplicateDetectionResult,
} from './core/duplicate-detector.js';

// File lifecycle / retention
export {
  DEFAULT_RETENTION_DAYS,
  createStatementFileRecord,
  computeDeleteAfterAt,
  isExpired,
  findExpiredFiles,
  markDeleted,
  markSkipped,
} from './core/file-retention.js';
export type {
  RetentionPolicy,
  DeletionStatus,
  StatementFileRecord,
} from './core/file-retention.js';

// Bank parsers
export { iciciBankCsvParser } from './banks/icici/csv-parser.js';
export { bankOfBarodaCsvParser } from './banks/bank-of-baroda/csv-parser.js';
export { kotakBankCsvParser } from './banks/kotak/csv-parser.js';

// Parser registry
export {
  resolveParser,
  getParserById,
  getParsersForBank,
  listParsers,
} from './parser-registry.js';

// Import pipeline
export {
  runImportPipeline,
  ImportPipelineError,
} from './import-pipeline.js';
export type {
  ImportPipelineInput,
  ImportPipelineResult,
  ReviewQueueItem,
} from './import-pipeline.js';
