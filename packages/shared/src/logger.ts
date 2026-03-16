/**
 * Structured logger with field redaction for SpendStack.
 *
 * Sensitive fields are masked before any log output is produced,
 * so credentials and PII never appear in log files.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  [key: string]: unknown;
}

/** Fields whose values will be replaced with [REDACTED] in log output. */
const REDACTED_FIELDS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'api_key',
  'authorization',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
  'accountNumber',
  'pin',
]);

const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Recursively redacts sensitive fields from a plain object.
 * Returns a new object; the original is not mutated.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return value; // guard against deeply nested structures
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_FIELDS.has(key)) {
      result[key] = REDACTED_PLACEHOLDER;
    } else {
      result[key] = redact(val, depth + 1);
    }
  }
  return result;
}

export interface LoggerOptions {
  context?: string;
  /** Override the log output sink (defaults to console). */
  sink?: (entry: LogEntry) => void;
  /** Minimum log level to emit. Defaults to 'debug'. */
  minLevel?: LogLevel;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function defaultSink(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') {
    console.error(line);
  } else if (entry.level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Creates a structured, redaction-aware logger instance.
 *
 * @example
 * ```ts
 * const log = createLogger({ context: 'import-service' });
 * log.info('Import started', { fileName: 'statement.pdf' });
 * log.warn('Duplicate detected', { transactionId: 'tx-123' });
 * log.error('Unexpected failure', { error: err });
 * ```
 */
export function createLogger(options: LoggerOptions = {}) {
  const { context, sink = defaultSink, minLevel = 'debug' } = options;

  function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(context !== undefined ? { context } : {}),
      ...(meta !== undefined ? (redact(meta) as Record<string, unknown>) : {}),
    };

    sink(entry);
  }

  return {
    debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
    info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
    /** Returns a child logger with a refined context label. */
    child: (childContext: string, childOptions?: Omit<LoggerOptions, 'context'>) =>
      createLogger({ ...options, ...childOptions, context: childContext }),
  };
}

export type Logger = ReturnType<typeof createLogger>;
