import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { UpstashClient } from '../src/app/api/lib/upstash.js';
import { POST as postWebhook } from '../src/app/api/webhooks/github/route.js';
import { GET as getStatus } from '../src/app/api/agent/status/route.js';

describe('Phase 5 — Milestone 5.1: Public Repository Push E2E Integration Pipeline', () => {
  let rsaPrivateKeyPem;
  const webhookSecret = 'phase5-test-secret-key-12345';
  const testAppId = '987654';
  let originalEnv;

  before(() => {
    // Generate RSA key pair for testing
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    rsaPrivateKeyPem = keyPair.privateKey;

    originalEnv = { ...process.env };
    process.env.GITHUB_WEBHOOK_SECRET = webhookSecret;
    process.env.FIX11Y_APP_ID = testAppId;
    process.env.FIX11Y_APP_PRIVATE_KEY = rsaPrivateKeyPem;
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token-xyz';
    process.env.FIX11Y_RUNNER_REPO = '13Dav-arc/fix11y-runner';
  });

  after(() => {
    process.env = originalEnv;
  });

  function computeHmac(payload, secret = webhookSecret) {
    const hmac = crypto.createHmac('sha256', secret);
    return `sha256=${hmac.update(payload).digest('hex')}`;
  }

  it('executes full public repository remediation lifecycle end-to-end', async () => {
    const originalFetch = globalThis.fetch;
    const dispatchedCalls = [];
    const upstashKv = new Map();

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      dispatchedCalls.push({ url: urlStr, options });

      // 1. App installation access token
      if (urlStr.includes('/access_tokens')) {
        return new Response(
          JSON.stringify({ token: 'mock-install-token', expires_at: new Date(Date.now() + 3600000).toISOString() }),
          { status: 201 }
        );
      }

      // 2. Check Run creation
      if (urlStr.includes('/check-runs') && options.method === 'POST') {
        return new Response(JSON.stringify({ id: 888999, status: 'in_progress' }), { status: 201 });
      }

      // 3. Runner repository_dispatch
      if (urlStr.includes('/repos/13Dav-arc/fix11y-runner/dispatches')) {
        return new Response(null, { status: 204 });
      }

      // 4. Upstash commands
      if (urlStr.includes('mock-redis.upstash.io')) {
        const body = options.body ? JSON.parse(options.body) : [];
        const cmd = body[0];
        if (cmd === 'SETEX') {
          const [, key, , val] = body;
          upstashKv.set(key, val);
          return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
        }
        if (cmd === 'GET') {
          const [, key] = body;
          const val = upstashKv.get(key) || null;
          return new Response(JSON.stringify({ result: val }), { status: 200 });
        }
        if (cmd === 'INCR') {
          return new Response(JSON.stringify({ result: 1 }), { status: 200 });
        }
        if (cmd === 'EXPIRE') {
          return new Response(JSON.stringify({ result: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }

      return new Response('{}', { status: 200 });
    };

    try {
      // Step A: Webhook push event ingestion
      const pushPayload = JSON.stringify({
        ref: 'refs/heads/main',
        before: '0000000000000000000000000000000000000000',
        after: 'a1b2c3d4e5f6071829304152637485960718293a',
        repository: {
          name: 'accessible-web-app',
          full_name: 'acme/accessible-web-app',
          private: false,
          owner: { login: 'acme' },
          default_branch: 'main',
        },
        installation: { id: 112233 },
        head_commit: {
          id: 'a1b2c3d4e5f6071829304152637485960718293a',
          message: 'Update template markup with potential accessibility gaps',
        },
      });

      const signature = computeHmac(pushPayload);
      const webhookReq = new Request('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'push',
          'X-Hub-Signature-256': signature,
        },
        body: pushPayload,
      });

      const webhookRes = await postWebhook(webhookReq);
      assert.equal(webhookRes.status, 202);
      const webhookData = await webhookRes.json();
      assert.equal(webhookData.message, 'Scan dispatched to fix11y-runner');
      assert.ok(webhookData.runId);
      assert.equal(webhookData.checkRunId, 888999);

      const runId = webhookData.runId;

      // Step B: Verify Check Run creation
      const checkRunCall = dispatchedCalls.find((c) => c.url.includes('/check-runs') && c.options.method === 'POST');
      assert.ok(checkRunCall, 'Must create GitHub Check Run');
      const checkRunBody = JSON.parse(checkRunCall.options.body);
      assert.equal(checkRunBody.name, 'fix11y: accessibility scan');
      assert.equal(checkRunBody.head_sha, 'a1b2c3d4e5f6071829304152637485960718293a');
      assert.equal(checkRunBody.status, 'in_progress');

      // Step C: Verify Runner Dispatch Payload
      const runnerCall = dispatchedCalls.find((c) => c.url.includes('/13Dav-arc/fix11y-runner/dispatches'));
      assert.ok(runnerCall, 'Must dispatch to fix11y-runner control repo');
      const runnerBody = JSON.parse(runnerCall.options.body);
      assert.equal(runnerBody.event_type, 'fix11y-scan');
      assert.equal(runnerBody.client_payload.runId, runId);
      assert.equal(runnerBody.client_payload.targetVisibility, 'public');
      assert.equal(runnerBody.client_payload.owner, 'acme');
      assert.equal(runnerBody.client_payload.repo, 'accessible-web-app');

      // Step D: Verify Upstash Seeding & Initial Status Polling
      const initialStatusReq = new Request(`http://localhost:3000/api/agent/status?runId=${runId}`);
      const initialStatusRes = await getStatus(initialStatusReq);
      assert.equal(initialStatusRes.status, 200);
      const initialStatusData = await initialStatusRes.json();
      assert.equal(initialStatusData.found, true);
      assert.equal(initialStatusData.status, 'running');
      assert.equal(initialStatusData.step, 'provisioning_runner');

      // Step E: Simulate 3-Job DAG Progression (Jobs 1, 2, 3 write progress updates to Upstash)
      const stages = [
        { step: 'init_sandbox', filesDone: 0, filesTotal: 4 },
        { step: 'initial_audit', filesDone: 2, filesTotal: 4 },
        { step: 'atomic_file_fix', filesDone: 4, filesTotal: 4, patchesCount: 3 },
        { step: 'verify_build', filesDone: 4, filesTotal: 4, patchesCount: 3 },
      ];

      for (const st of stages) {
        const currentRecord = JSON.parse(upstashKv.get(`fix11y:run:${runId}`));
        upstashKv.set(
          `fix11y:run:${runId}`,
          JSON.stringify({
            ...currentRecord,
            ...st,
            updatedAt: new Date().toISOString(),
          })
        );

        const pollReq = new Request(`http://localhost:3000/api/agent/status?runId=${runId}`);
        const pollRes = await getStatus(pollReq);
        const pollData = await pollRes.json();
        assert.equal(pollData.step, st.step);
      }

      // Step F: Simulate Job 3 Resolution (Pull request opened)
      const currentRecord = JSON.parse(upstashKv.get(`fix11y:run:${runId}`));
      upstashKv.set(
        `fix11y:run:${runId}`,
        JSON.stringify({
          ...currentRecord,
          status: 'success',
          step: 'open_pr',
          zeroViolations: false,
          prUrl: 'https://github.com/acme/accessible-web-app/pull/12',
          patchesCount: 3,
          actionsLogUrl: 'https://github.com/13Dav-arc/fix11y-runner/actions/runs/554433',
          updatedAt: new Date().toISOString(),
        })
      );

      // Verify terminal polling returns PR link and success status
      const terminalReq = new Request(`http://localhost:3000/api/agent/status?runId=${runId}`);
      const terminalRes = await getStatus(terminalReq);
      assert.equal(terminalRes.status, 200);
      const terminalData = await terminalRes.json();
      assert.equal(terminalData.status, 'success');
      assert.equal(terminalData.prUrl, 'https://github.com/acme/accessible-web-app/pull/12');
      assert.equal(terminalData.patchesCount, 3);
      assert.equal(terminalData.zeroViolations, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
