import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { GET as getState } from '../src/app/api/agent/state/route.js';
import { GET as getStream } from '../src/app/api/agent/stream/route.js';

describe('Phase 6: Web Studio Real-Time SSE & State Rehydration', () => {
  const testDbDir = path.resolve(process.cwd(), 'apps/agent');
  const testDbPath = path.resolve(testDbDir, '.checkpoints.db');
  let createdDb = false;

  before(() => {
    // Ensure apps/agent directory exists for test SQLite db
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    if (!fs.existsSync(testDbPath)) {
      createdDb = true;
      const db = new DatabaseSync(testDbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS checkpoints (
          thread_id TEXT NOT NULL,
          checkpoint_id TEXT NOT NULL,
          checkpoint TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER,
          PRIMARY KEY (thread_id, checkpoint_id)
        );
      `);

      // Seed a test checkpoint
      const sampleCheckpoint = {
        channel_values: {
          repoUrl: 'acme/test-repo',
          targetDirectory: '.',
          phase: 'complete',
          appliedPatches: [
            {
              filePath: 'index.html',
              diff: '+ <img alt="Hero banner">',
              rationale: 'Added missing alt text to hero image',
              timestamp: 1700000001000,
            },
          ],
          quarantinedIssues: [],
          llmCallCount: 1,
          budgetCapReached: false,
          verificationPassed: true,
          prUrl: 'https://github.com/acme/test-repo/pull/42',
        },
      };

      const stmt = db.prepare(`
        INSERT INTO checkpoints (thread_id, checkpoint_id, checkpoint, metadata, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        'test-thread-1',
        'chk-001',
        JSON.stringify(sampleCheckpoint),
        JSON.stringify({ step: 1 }),
        1700000000000
      );

      db.close();
    }
  });

  after(() => {
    if (createdDb && fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {
        // Ignore test cleanup lock
      }
    }
  });

  describe('GET /api/agent/state (State Rehydration)', () => {
    it('returns 400 Bad Request if threadId is missing', async () => {
      const req = new Request('http://localhost:3000/api/agent/state?repo=acme/test-repo');
      const res = await getState(req);

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Missing required query parameter "threadId"/);
    });

    it('returns 200 with found=false and status=idle for non-existent thread', async () => {
      const req = new Request(
        'http://localhost:3000/api/agent/state?repo=acme/test-repo&threadId=non-existent-999'
      );
      const res = await getState(req);

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.found, false);
      assert.equal(data.status, 'idle');
      assert.deepEqual(data.events, []);
    });

    it('rehydrates past execution history and state from SQLite checkpoints', async () => {
      const req = new Request(
        'http://localhost:3000/api/agent/state?repo=acme/test-repo&threadId=test-thread-1'
      );
      const res = await getState(req);

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.found, true);
      assert.equal(data.status, 'completed');
      assert.equal(data.phase, 'complete');
      assert.equal(data.repo, 'acme/test-repo');
      assert.equal(data.verificationPassed, true);
      assert.equal(data.prUrl, 'https://github.com/acme/test-repo/pull/42');
      assert.equal(data.appliedPatches.length, 1);
      assert.equal(data.appliedPatches[0].filePath, 'index.html');

      // Verify reconstructed event list
      assert.ok(Array.isArray(data.events));
      assert.ok(data.events.some((e) => e.type === 'phase_change'));
      assert.ok(data.events.some((e) => e.type === 'patch_applied'));
      assert.ok(data.events.some((e) => e.type === 'verification'));
      assert.ok(data.events.some((e) => e.type === 'complete'));
    });
  });

  describe('GET /api/agent/stream (SSE Streaming)', () => {
    it('sets standard SSE streaming headers', async () => {
      const abortController = new AbortController();
      const req = new Request(
        'http://localhost:3000/api/agent/stream?repo=acme/test-repo&threadId=test-stream-1',
        { signal: abortController.signal }
      );

      const res = await getStream(req);

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Content-Type'), 'text/event-stream');
      assert.equal(res.headers.get('Cache-Control'), 'no-cache, no-transform');
      assert.equal(res.headers.get('Connection'), 'keep-alive');

      // Read initial connection event
      const reader = res.body.getReader();
      const { value, done } = await reader.read();
      assert.equal(done, false);

      const text = new TextDecoder().decode(value);
      assert.ok(text.startsWith('data: '));
      const payload = JSON.parse(text.replace('data: ', '').trim());
      assert.equal(payload.type, 'connected');
      assert.equal(payload.repo, 'acme/test-repo');
      assert.equal(payload.threadId, 'test-stream-1');

      abortController.abort();
      reader.releaseLock();
    });
  });

  describe('AgentActivityStream Component Structure & Accessibility', () => {
    it('implements required exports, accessibility attributes, and focus management', () => {
      const compPath = fileURLToPath(new URL('../src/components/AgentActivityStream.jsx', import.meta.url));
      assert.ok(fs.existsSync(compPath), 'AgentActivityStream.jsx must exist');

      const content = fs.readFileSync(compPath, 'utf8');

      // Verify exports
      assert.match(content, /export function AgentActivityStream/, 'Must export named component AgentActivityStream');
      assert.match(content, /export default AgentActivityStream/, 'Must provide default export');

      // Verify screen reader live announcer (WCAG 4.1.3)
      assert.match(content, /role="status"/, 'Must contain role="status" live region');
      assert.match(content, /aria-live="polite"/, 'Must announce asynchronously with aria-live="polite"');
      assert.match(content, /className="[^"]*sr-only[^"]*"/, 'Live announcer must be screen-reader only');

      // Verify endpoint integration
      assert.match(content, /\/api\/agent\/state/, 'Must integrate with state rehydration route');
      assert.match(content, /\/api\/agent\/stream/, 'Must integrate with SSE streaming route');

      // Verify programmatic focus management
      assert.match(content, /prLinkRef/, 'Must maintain ref to PR link');
      assert.match(content, /prLinkRef\.current\.focus\(\)/, 'Must programmatically focus PR link on completion');

      // Verify budget cap circuit breaker notice
      assert.match(content, /budgetCapReached/, 'Must handle budgetCapReached flag');
      assert.match(content, /role="alert"/, 'Must display alert when budget cap is reached');
    });
  });
});
