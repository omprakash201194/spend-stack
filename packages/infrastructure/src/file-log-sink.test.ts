import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createFileLogSink } from './file-log-sink.js';
import type { LogEntry } from '@spendstack/shared';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spendstack-log-test-'));
}

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'test message',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('createFileLogSink', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the log directory if it does not exist', () => {
    const logDir = path.join(tmpDir, 'logs', 'nested');
    createFileLogSink({ logDir });
    expect(fs.existsSync(logDir)).toBe(true);
  });

  it('writes a JSON-lines entry to the active log file', () => {
    const sink = createFileLogSink({ logDir: tmpDir });
    sink(makeEntry({ message: 'hello' }));

    const logPath = path.join(tmpDir, 'spendstack.log');
    const content = fs.readFileSync(logPath, 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.message).toBe('hello');
    expect(parsed.level).toBe('info');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('appends multiple entries as separate JSON lines', () => {
    const sink = createFileLogSink({ logDir: tmpDir });
    sink(makeEntry({ message: 'first' }));
    sink(makeEntry({ message: 'second' }));
    sink(makeEntry({ message: 'third' }));

    const logPath = path.join(tmpDir, 'spendstack.log');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!).message).toBe('first');
    expect(JSON.parse(lines[1]!).message).toBe('second');
    expect(JSON.parse(lines[2]!).message).toBe('third');
  });

  it('respects a custom baseName', () => {
    const sink = createFileLogSink({ logDir: tmpDir, baseName: 'myapp' });
    sink(makeEntry());

    expect(fs.existsSync(path.join(tmpDir, 'myapp.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'spendstack.log'))).toBe(false);
  });

  it('rotates the log file when it exceeds maxFileSize', () => {
    const sink = createFileLogSink({ logDir: tmpDir, maxFileSize: 10 }); // tiny limit

    sink(makeEntry({ message: 'entry that will fill the first file' }));
    sink(makeEntry({ message: 'this triggers rotation' }));

    expect(fs.existsSync(path.join(tmpDir, 'spendstack.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'spendstack.1.log'))).toBe(true);
  });

  it('deletes the oldest file when maxRotatedFiles is exceeded', () => {
    const sink = createFileLogSink({ logDir: tmpDir, maxFileSize: 10, maxRotatedFiles: 2 });

    // Write enough entries to fill 3 rotated files (2 max + 1 being deleted).
    for (let i = 0; i < 10; i++) {
      sink(makeEntry({ message: `entry ${i}` }));
    }

    // .1.log and .2.log should exist, but .3.log should have been deleted/never created.
    expect(fs.existsSync(path.join(tmpDir, 'spendstack.1.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'spendstack.2.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'spendstack.3.log'))).toBe(false);
  });

  it('shifts rotated files by index on rotation', () => {
    const sink = createFileLogSink({ logDir: tmpDir, maxFileSize: 10, maxRotatedFiles: 3 });

    // First rotation: active -> .1.log
    sink(makeEntry({ message: 'first' }));
    sink(makeEntry({ message: 'second triggers rotation' }));

    // Second rotation: .1.log -> .2.log, active -> .1.log
    sink(makeEntry({ message: 'third triggers another rotation' }));

    expect(fs.existsSync(path.join(tmpDir, 'spendstack.1.log'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'spendstack.2.log'))).toBe(true);
  });

  it('works correctly when the active log file does not exist yet', () => {
    const sink = createFileLogSink({ logDir: tmpDir });
    // No file exists — should write normally without throwing.
    expect(() => sink(makeEntry())).not.toThrow();
    expect(fs.existsSync(path.join(tmpDir, 'spendstack.log'))).toBe(true);
  });
});
