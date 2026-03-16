import { describe, it, expect, vi } from 'vitest';
import { createLogger, redact } from './logger.js';
import type { LogEntry } from './logger.js';

describe('redact', () => {
  it('returns primitives unchanged', () => {
    expect(redact(42)).toBe(42);
    expect(redact('hello')).toBe('hello');
    expect(redact(null)).toBeNull();
    expect(redact(true)).toBe(true);
  });

  it('redacts known sensitive fields', () => {
    const result = redact({ password: 'secret123', name: 'Alice' }) as Record<string, unknown>;
    expect(result['password']).toBe('[REDACTED]');
    expect(result['name']).toBe('Alice');
  });

  it('redacts multiple sensitive fields at once', () => {
    const result = redact({
      token: 'abc',
      apiKey: 'xyz',
      creditCard: '4111-1111-1111-1111',
      user: 'bob',
    }) as Record<string, unknown>;
    expect(result['token']).toBe('[REDACTED]');
    expect(result['apiKey']).toBe('[REDACTED]');
    expect(result['creditCard']).toBe('[REDACTED]');
    expect(result['user']).toBe('bob');
  });

  it('redacts nested sensitive fields', () => {
    const result = redact({
      user: { password: 'hunter2', email: 'a@b.com' },
    }) as Record<string, unknown>;
    const user = result['user'] as Record<string, unknown>;
    expect(user['password']).toBe('[REDACTED]');
    expect(user['email']).toBe('a@b.com');
  });

  it('handles arrays and redacts inside them', () => {
    const result = redact([{ secret: 's', value: 1 }, { value: 2 }]) as Array<Record<string, unknown>>;
    expect(result[0]?.['secret']).toBe('[REDACTED]');
    expect(result[0]?.['value']).toBe(1);
    expect(result[1]?.['value']).toBe(2);
  });

  it('does not mutate the original object', () => {
    const original = { password: 'my-pass', name: 'Carol' };
    redact(original);
    expect(original.password).toBe('my-pass');
  });
});

describe('createLogger', () => {
  function makeSink() {
    const entries: LogEntry[] = [];
    const sink = (entry: LogEntry) => entries.push(entry);
    return { entries, sink };
  }

  it('emits info log with correct level and message', () => {
    const { entries, sink } = makeSink();
    const log = createLogger({ sink });
    log.info('Hello world');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('info');
    expect(entries[0]?.message).toBe('Hello world');
  });

  it('includes context when provided', () => {
    const { entries, sink } = makeSink();
    const log = createLogger({ context: 'my-service', sink });
    log.debug('Testing');
    expect(entries[0]?.context).toBe('my-service');
  });

  it('redacts sensitive fields in meta', () => {
    const { entries, sink } = makeSink();
    const log = createLogger({ sink });
    log.info('User login', { userId: 'u-1', password: 'supersecret' });
    const entry = entries[0] as Record<string, unknown>;
    expect(entry['password']).toBe('[REDACTED]');
    expect(entry['userId']).toBe('u-1');
  });

  it('includes a timestamp in ISO format', () => {
    const { entries, sink } = makeSink();
    const log = createLogger({ sink });
    log.warn('Watch out');
    expect(entries[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('respects minLevel — suppresses logs below threshold', () => {
    const { entries, sink } = makeSink();
    const log = createLogger({ sink, minLevel: 'warn' });
    log.debug('Should be suppressed');
    log.info('Also suppressed');
    log.warn('Should appear');
    log.error('Also appears');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.level).toBe('warn');
    expect(entries[1]?.level).toBe('error');
  });

  it('error method logs at error level', () => {
    const { entries, sink } = makeSink();
    const log = createLogger({ sink });
    log.error('Boom', { code: 500 });
    expect(entries[0]?.level).toBe('error');
  });

  it('child logger inherits context', () => {
    const { entries, sink } = makeSink();
    const parent = createLogger({ context: 'parent', sink });
    const child = parent.child('child');
    child.info('child message');
    expect(entries[0]?.context).toBe('child');
  });

  it('falls back to console when no sink provided', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const log = createLogger();
    log.info('console test');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
