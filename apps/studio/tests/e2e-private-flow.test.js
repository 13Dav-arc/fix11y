import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { POST as postWebhook } from '../src/app/api/webhooks/github/route.js';

describe('Phase 5 — Milestone 5.2: Private Repository Setup PR & Native Token E2E Pipeline', () => {
  let rsaPrivateKeyPem;
  const webhookSecret = 'phase5-private-secret-12345';
  const testAppId = '123456';
  let originalEnv;

  before(() => {
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
    process.env.FIX11Y_ACTION_REF = '5144ef5';
  });

  after(() => {
    process.env = originalEnv;
  });

  function computeHmac(payload, secret = webhookSecret) {
    const hmac = crypto.createHmac('sha256', secret);
    return `sha256=${hmac.update(payload).digest('hex')}`;
  }

  it('detects unconfigured private repo, opens setup PR pinned to commit SHA, and enforces air-gap', async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    let upstashProgressWriteCount = 0;
    let runnerDispatchCount = 0;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      calls.push({ url: urlStr, options });

      if (urlStr.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'mock-private-token' }), { status: 201 });
      }

      // First check: does workflow file exist? Simulate 404 (missing)
      if (urlStr.includes('/contents/.github/workflows/fix11y.yml') || urlStr.includes('/contents/.github/workflows/fix11y-remediate.yml')) {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }

      // Default branch ref check
      if (urlStr.includes('/git/ref/heads/main')) {
        return new Response(JSON.stringify({ object: { sha: 'base-commit-sha-999' } }), { status: 200 });
      }

      // Branch creation
      if (urlStr.includes('/git/refs') && options.method === 'POST') {
        return new Response(JSON.stringify({ ref: 'refs/heads/fix11y/setup' }), { status: 201 });
      }

      // File commit via PUT /contents/...
      if (urlStr.includes('/contents/.github/workflows/fix11y.yml') && options.method === 'PUT') {
        return new Response(JSON.stringify({ content: { sha: 'created-file-sha' } }), { status: 201 });
      }

      // Pull Request creation
      if (urlStr.includes('/pulls') && options.method === 'POST') {
        return new Response(JSON.stringify({ html_url: 'https://github.com/corp/secret-app/pull/1', number: 1 }), { status: 201 });
      }

      // Track any accidental runner dispatches or Upstash run progress writes
      if (urlStr.includes('/dispatches')) {
        runnerDispatchCount++;
        return new Response(null, { status: 204 });
      }
      if (urlStr.includes('upstash.io')) {
        const bodyStr = String(options.body || '');
        if (bodyStr.includes('fix11y:run:') || bodyStr.includes('SETEX') || bodyStr.includes('runId')) {
          upstashProgressWriteCount++;
        }
        return new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 });
      }

      return new Response('{}', { status: 200 });
    };

    try {
      const pushPayload = JSON.stringify({
        ref: 'refs/heads/main',
        repository: {
          name: 'secret-app',
          full_name: 'corp/secret-app',
          private: true, // PRIVATE REPOSITORY
          owner: { login: 'corp' },
          default_branch: 'main',
        },
        installation: { id: 776655 },
        head_commit: {
          id: 'commit-private-1234',
          message: 'Update private internal dashboard',
        },
      });

      const signature = computeHmac(pushPayload);
      const req = new Request('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'push',
          'X-Hub-Signature-256': signature,
        },
        body: pushPayload,
      });

      const res = await postWebhook(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'setup_pr_opened');

      // Invariant 8: Air-gap assertions
      assert.equal(upstashProgressWriteCount, 0, 'Private repo must produce ZERO Upstash run progress writes');
      assert.equal(runnerDispatchCount, 0, 'Private repo must produce ZERO shared runner dispatches');

      // Verify PR created on GitHub
      const prCall = calls.find((c) => c.url.includes('/pulls') && c.options.method === 'POST');
      assert.ok(prCall, 'Must open setup pull request');
      const prBody = JSON.parse(prCall.options.body);
      assert.equal(prBody.head, 'fix11y/setup-workflow');
      assert.equal(prBody.base, 'main');
      assert.match(prBody.title, /accessibility remediation workflow/i);

      // Verify workflow file contents committed
      const fileCall = calls.find((c) => c.url.includes('/contents/.github/workflows/fix11y.yml') && c.options.method === 'PUT');
      assert.ok(fileCall, 'Must commit workflow file');
      const fileBody = JSON.parse(fileCall.options.body);
      const decodedWorkflow = Buffer.from(fileBody.content, 'base64').toString('utf8');

      // Verify pinned commit SHA, never @main
      assert.match(decodedWorkflow, /uses:\s+13Dav-arc\/fix11y-action@5144ef5/);
      assert.doesNotMatch(decodedWorkflow, /uses:\s+13Dav-arc\/fix11y-action@main/);

      // Verify native token permissions only — zero App private key
      assert.match(decodedWorkflow, /contents:\s+write/);
      assert.match(decodedWorkflow, /pull-requests:\s+write/);
      assert.match(decodedWorkflow, /checks:\s+write/);
      assert.doesNotMatch(decodedWorkflow, /FIX11Y_APP_PRIVATE_KEY/);
      assert.doesNotMatch(decodedWorkflow, /GITHUB_APP_PRIVATE_KEY/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles configured private repo with workflow present: zero runner dispatch & zero Upstash writes', async () => {
    const originalFetch = globalThis.fetch;
    let upstashProgressWriteCount = 0;
    let runnerDispatchCount = 0;

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'mock-private-token' }), { status: 201 });
      }

      // Workflow file exists! (200 OK)
      if (urlStr.includes('/contents/.github/workflows/fix11y.yml')) {
        return new Response(JSON.stringify({ sha: 'existing-workflow-sha', name: 'fix11y.yml' }), { status: 200 });
      }

      if (urlStr.includes('/dispatches')) {
        runnerDispatchCount++;
        return new Response(null, { status: 204 });
      }
      if (urlStr.includes('upstash.io')) {
        const bodyStr = String(options.body || '');
        if (bodyStr.includes('fix11y:run:') || bodyStr.includes('SETEX') || bodyStr.includes('runId')) {
          upstashProgressWriteCount++;
        }
        return new Response(JSON.stringify([{ result: 1 }, { result: 1 }]), { status: 200 });
      }

      return new Response('{}', { status: 200 });
    };

    try {
      const pushPayload = JSON.stringify({
        ref: 'refs/heads/main',
        repository: {
          name: 'configured-secret-app',
          full_name: 'corp/configured-secret-app',
          private: true,
          owner: { login: 'corp' },
          default_branch: 'main',
        },
        installation: { id: 776655 },
        head_commit: {
          id: 'commit-private-5678',
          message: 'Feature update on private repo',
        },
      });

      const signature = computeHmac(pushPayload);
      const req = new Request('http://localhost:3000/api/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'push',
          'X-Hub-Signature-256': signature,
        },
        body: pushPayload,
      });

      const res = await postWebhook(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'workflow_present');

      // Ensure zero external interactions
      assert.equal(upstashProgressWriteCount, 0, 'No Upstash run progress writes for configured private repo');
      assert.equal(runnerDispatchCount, 0, 'No shared runner dispatch for private repo');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
