import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { AccessibleLogger, LogLevel } from '../src/cli/accessible-logger.js';

class MemoryWritableStream extends Writable {
  public chunks: string[] = [];

  _write(chunk: any, _encoding: string, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  getContent(): string {
    return this.chunks.join('');
  }

  clear(): void {
    this.chunks = [];
  }
}

test('AccessibleLogger - detects explicit accessibleMode', () => {
  const stream = new MemoryWritableStream();
  const logger = new AccessibleLogger({ accessibleMode: true, stream });
  assert.equal(logger.isAccessible, true);
});

test('AccessibleLogger - detects explicit noColor option', () => {
  const stream = new MemoryWritableStream();
  const logger = new AccessibleLogger({ noColor: true, stream });
  assert.equal(logger.noColor, true);
});

test('AccessibleLogger - outputs flat milestone logs for all log levels', () => {
  const stream = new MemoryWritableStream();
  const logger = new AccessibleLogger({ accessibleMode: true, stream });

  const levels: LogLevel[] = ['start', 'info', 'success', 'warn', 'error', 'retry'];
  for (const level of levels) {
    logger.log(level, `Test message for ${level}`);
  }

  const content = stream.getContent();
  assert.ok(content.includes('[START]   Test message for start'));
  assert.ok(content.includes('[INFO]    Test message for info'));
  assert.ok(content.includes('[SUCCESS] Test message for success'));
  assert.ok(content.includes('[WARNING] Test message for warn'));
  assert.ok(content.includes('[ERROR]   Test message for error'));
  assert.ok(content.includes('[RETRY]   Test message for retry'));

  // Ensure all lines end with \n
  const lines = content.trim().split('\n');
  assert.equal(lines.length, 6);
});

test('AccessibleLogger - formats context object into milestone log', () => {
  const stream = new MemoryWritableStream();
  const logger = new AccessibleLogger({ accessibleMode: true, stream });

  logger.log('info', 'Executing audit', { repo: 'org/repo', targetDir: './web' });

  const content = stream.getContent();
  assert.ok(content.includes('Executing audit (repo="org/repo", targetDir="./web")'));
});

test('AccessibleLogger - startStep in accessible mode does NOT emit carriage returns or ANSI spinners', () => {
  const stream = new MemoryWritableStream();
  const logger = new AccessibleLogger({ accessibleMode: true, stream });

  logger.startStep('Inspecting DOM nodes');
  const content = stream.getContent();

  // Must not contain carriage return \r or dynamic spinner chars
  assert.ok(!content.includes('\r'));
  assert.ok(content.includes('[START]   Inspecting DOM nodes\n'));
});

test('AccessibleLogger - completeStep in accessible mode outputs success milestone', () => {
  const stream = new MemoryWritableStream();
  const logger = new AccessibleLogger({ accessibleMode: true, stream });

  logger.completeStep('Audit completed successfully');
  const content = stream.getContent();

  assert.ok(!content.includes('\r'));
  assert.ok(content.includes('[SUCCESS] Audit completed successfully\n'));
});
