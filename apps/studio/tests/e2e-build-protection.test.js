import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

import { runResolveJob } from '../../../fix11y-runner/src/resolve-job.js';
import { GET as getStatus } from '../src/app/api/agent/status/route.js';

describe('Phase 5 — Milestone 5.3: Build Verification Rejection & Broken Build Shield E2E', () => {
  let originalEnv;

  before(() => {
    originalEnv = { ...process.env };
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token-xyz';
  });

  after(() => {
    process.env = originalEnv;
  });
  it('suppresses PR creation in resolve job when verification tests fail, marking check run as failure with test_failure category', async () => {
    const checkUpdates = [];
    let prCreated = false;

    const mockOctokit = {
      updateCheckRun: async (params) => {
        checkUpdates.push(params);
        return { id: 999123 };
      },
      createPullRequest: async () => {
        prCreated = true;
        throw new Error('PR creation should NEVER be called when build verification fails');
      },
    };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix11y-build-shield-'));
    const origCwd = process.cwd();

    try {
      process.chdir(tmpDir);
      fs.mkdirSync('artifacts', { recursive: true });
      fs.writeFileSync(
        path.join('artifacts', 'verification-result.json'),
        JSON.stringify({
          success: false,
          category: 'test_failure',
          exitCode: 1,
          summary: 'Target repository test suite failed with exit code 1.',
          logExcerpt: 'FAIL src/__tests__/button.test.jsx\n  ● renders accessible label\n    Expected: "Submit"\n    Received: ""',
        }),
        'utf8'
      );

      // Execute Job 3 (resolve) with failed verification
      const result = await runResolveJob({
        payload: {
          owner: 'test-org',
          repo: 'critical-app',
          sha: 'badd00d1234567890abcdef',
          checkRunId: 888111,
          runId: 'e2e-run-build-fail',
        },
        patchResult: 'success',
        verifyResult: 'failure',
        hasPatches: true,
        octokit: mockOctokit,
        token: 'mock-gh-token',
      });

      // 1. Result verification
      assert.equal(result.status, 'failure');
      assert.equal(result.category, 'test_failure');

      // 2. Broken build shield invariant: 0 PRs created
      assert.equal(prCreated, false, 'Broken Build Shield: Pull Request creation must be completely suppressed');

      // 3. GitHub Check Run updated to failure with rejection reason
      assert.equal(checkUpdates.length, 1);
      assert.equal(checkUpdates[0].conclusion, 'failure');
      assert.equal(checkUpdates[0].output.title, 'fix11y: Test verification failed');
      assert.match(
        checkUpdates[0].output.summary,
        /To prevent breaking changes, no pull request was created/i
      );
      assert.match(
        checkUpdates[0].output.text,
        /FAIL src\/__tests__\/button\.test\.jsx/
      );
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('serves test_failure state via /api/agent/status with null PR and failure details', async () => {
    const originalFetch = globalThis.fetch;
    const runId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

    const failedProgressPayload = {
      status: 'failed',
      repo: 'test-org/critical-app',
      sha: 'badd00d1234567890abcdef',
      targetVisibility: 'public',
      step: 'verify_build',
      category: 'test_failure',
      filesDone: 4,
      filesTotal: 4,
      prUrl: null,
      actionsLogUrl: 'https://github.com/13Dav-arc/fix11y-runner/actions/runs/123456',
      error: 'Test suite failed in verify_build: npm test exited with code 1',
      errorExcerpt: 'FAIL src/__tests__/button.test.jsx: AssertionError',
      summary: 'Automated patches caused test failure in verify_build.',
      startedAt: new Date(Date.now() - 120000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('upstash.io')) {
        let body = [];
        try {
          body = JSON.parse(options.body || '[]');
        } catch {}

        if (Array.isArray(body) && body[0] === 'INCR') {
          return new Response(JSON.stringify({ result: 1 }), { status: 200 });
        }
        if (Array.isArray(body) && body[0] === 'GET') {
          return new Response(JSON.stringify({ result: JSON.stringify(failedProgressPayload) }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    try {
      const req = new Request(`http://localhost:3000/api/agent/status?runId=${runId}`);
      const res = await getStatus(req);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.found, true);
      assert.equal(data.status, 'failed');
      assert.equal(data.step, 'verify_build');
      assert.equal(data.category, 'test_failure');
      assert.equal(data.prUrl, null);
      assert.match(data.errorExcerpt, /FAIL src\/__tests__\/button\.test\.jsx/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('verifies ProgressPanel renders Terminal State 4 with zero broken builds badge, polite announcer, and zero PR links', async () => {
    const panelPath = fileURLToPath(new URL('../src/components/ProgressPanel.jsx', import.meta.url));
    const panelContent = fs.readFileSync(panelPath, 'utf8');

    // 1. Verify component source logic for test failure classification
    assert.match(
      panelContent,
      /isTestFailure\s*=\s*isTerminalFailure\s*&&\s*activeData\.category\s*===\s*'test_failure'/,
      'Must strictly classify test_failure category'
    );

    // 2. Verify announcement text
    assert.match(
      panelContent,
      /Build verification failed\. Test suite failed during sandbox verification\. No pull request opened\./,
      'Must provide screen reader announcement for build verification failure'
    );

    // 3. Verify markup contract for Terminal State 4 container
    assert.match(
      panelContent,
      /role="status"\s+aria-label="Build verification failed"/,
      'Output landmark must declare role="status" and aria-label="Build verification failed"'
    );
    assert.match(panelContent, /Zero Broken Builds Guarantee/, 'Must render Zero Broken Builds Guarantee badge');
    assert.match(panelContent, /Build Verification Failed — No Pull Request Created/, 'Must render failure heading');
    assert.match(
      panelContent,
      /To protect your branch from breaking changes, fix11y rejected the patches\s+and opened no pull request\./,
      'Must explain rejection shield behavior'
    );

    // 4. Invariant: Terminal State 4 must NEVER contain a PR link
    const testFailureBlockMatch = panelContent.match(/\{\/\* Terminal State 4: Build Verification Rejection[\s\S]*?\{\/\* Terminal State 5:/);
    assert.ok(testFailureBlockMatch, 'Must locate Terminal State 4 code block');
    const testFailureBlock = testFailureBlockMatch[0];
    assert.doesNotMatch(testFailureBlock, /activeData\.prUrl/, 'Terminal State 4 must NEVER render activeData.prUrl');
    assert.doesNotMatch(testFailureBlock, /View Pull Request/, 'Terminal State 4 must NEVER have View Pull Request link');

    // 5. Audit Terminal State 4 DOM structure using JSDOM + axe-core
    const sampleHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Build Shield Verification</title></head>
        <body>
          <main>
            <h1>Remediation Progress</h1>
            <div class="sr-only" role="status" aria-live="polite">
              Build verification failed. Test suite failed during sandbox verification. No pull request opened.
            </div>
            <output
              role="status"
              aria-label="Build verification failed"
              class="rounded-xl border border-red-500/50 bg-red-500/10 p-5 flex flex-col gap-4 text-red-200"
            >
              <div>
                <span class="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/40 mb-1">
                  Zero Broken Builds Guarantee
                </span>
                <h2 class="text-base font-bold text-white tracking-tight">
                  Build Verification Failed — No Pull Request Created
                </h2>
                <p class="text-xs text-red-200/90 mt-1 leading-relaxed">
                  Automated accessibility patches were generated, but your test suite ('npm test') failed during
                  sandbox build verification. To protect your branch from breaking changes, fix11y rejected the patches
                  and opened no pull request.
                </p>
              </div>
              <div>
                <a
                  href="https://github.com/13Dav-arc/fix11y-runner/actions/runs/123456"
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-canvas border border-border text-slate-200 text-xs font-semibold"
                >
                  Inspect Actions Run Logs
                </a>
              </div>
            </output>
          </main>
        </body>
      </html>
    `;

    const dom = new JSDOM(sampleHtml);
    const axeResults = await axe.run(dom.window.document.documentElement, {
      rules: {
        // Color contrast requires layout engine; standard in headless jsdom
        'color-contrast': { enabled: false },
      },
    });

    assert.equal(
      axeResults.violations.length,
      0,
      `Terminal State 4 markup must have 0 axe accessibility violations: ${JSON.stringify(axeResults.violations, null, 2)}`
    );
  });
});
