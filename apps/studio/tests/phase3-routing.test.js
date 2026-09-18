import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { UpstashClient } from '../src/app/api/lib/upstash.js';
import {
  GitHubAppService,
  generateAppJwt,
  verifyGitHubSignature,
} from '../src/app/api/lib/github-app.js';
import { getVercelConfig, validateVercelEnv } from '../src/app/api/lib/env-check.js';
import { POST as postWebhook } from '../src/app/api/webhooks/github/route.js';
import { GET as getStatus } from '../src/app/api/agent/status/route.js';
import { POST as postTrigger } from '../src/app/api/agent/trigger/route.js';

describe('Phase 3: Serverless API Layer & Repository Routing', () => {
  let rsaPrivateKeyPem;
  let rsaPublicKeyPem;
  const webhookSecret = 'test-phase3-secret-key-12345';
  const testAppId = '123456';
  let originalEnv;

  before(() => {
    // 1. Generate in-memory RSA key pair for hermetic JWT tests
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    rsaPrivateKeyPem = keyPair.privateKey;
    rsaPublicKeyPem = keyPair.publicKey;

    // 2. Snapshot environment
    originalEnv = { ...process.env };

    // 3. Populate test environment with mock credentials
    process.env.GITHUB_WEBHOOK_SECRET = webhookSecret;
    process.env.FIX11Y_APP_ID = testAppId;
    process.env.FIX11Y_APP_PRIVATE_KEY = rsaPrivateKeyPem;
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token-xyz';
    process.env.FIX11Y_RUNNER_REPO = '13Dav-arc/fix11y-runner';
    process.env.FIX11Y_ACTION_REF = '5144ef5';
  });

  after(() => {
    // Restore environment
    process.env = originalEnv;
  });

  function computeHmac(payload, secret = webhookSecret) {
    const hmac = crypto.createHmac('sha256', secret);
    return `sha256=${hmac.update(payload).digest('hex')}`;
  }

  describe('Pre-Flight Environment & Alias Validation', () => {
    it('successfully validates full Vercel environment config', () => {
      const config = validateVercelEnv();
      assert.equal(config.webhookSecret, webhookSecret);
      assert.equal(config.appId, testAppId);
      assert.equal(config.runnerRepo, '13Dav-arc/fix11y-runner');
      assert.equal(config.actionRef, '5144ef5');
    });

    it('resolves GITHUB_APP_* aliases if FIX11Y_APP_* are omitted', () => {
      const savedAppId = process.env.FIX11Y_APP_ID;
      const savedKey = process.env.FIX11Y_APP_PRIVATE_KEY;
      delete process.env.FIX11Y_APP_ID;
      delete process.env.FIX11Y_APP_PRIVATE_KEY;
      process.env.GITHUB_APP_ID = 'alias-app-789';
      process.env.GITHUB_APP_PRIVATE_KEY = rsaPrivateKeyPem;

      const { ok, config } = getVercelConfig();
      assert.equal(ok, true);
      assert.equal(config.appId, 'alias-app-789');

      process.env.FIX11Y_APP_ID = savedAppId;
      process.env.FIX11Y_APP_PRIVATE_KEY = savedKey;
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;
    });

    it('throws 500 configuration error if required variables are missing', () => {
      const savedUrl = process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_URL;

      assert.throws(() => validateVercelEnv(), (err) => {
        return err.status === 500 && err.message.includes('UPSTASH_REDIS_REST_URL');
      });

      process.env.UPSTASH_REDIS_REST_URL = savedUrl;
    });
  });

  describe('Upstash Redis REST Client & Sliding-Window Rate Limiter', () => {
    it('gracefully handles unconfigured environment', async () => {
      const unconfigured = new UpstashClient({ url: '', token: '' });
      assert.equal(unconfigured.isConfigured, false);

      const rateCheck = await unconfigured.checkRateLimit({ key: 'test' });
      assert.equal(rateCheck.allowed, true);

      const progress = await unconfigured.getRunProgress('any-id');
      assert.equal(progress, null);
    });

    it('executes REST commands and parses response', async () => {
      const mockFetch = async (url, options) => {
        assert.equal(options.headers.Authorization, 'Bearer mock-token-xyz');
        const [cmd] = JSON.parse(options.body);
        if (cmd === 'INCR') {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (cmd === 'EXPIRE') {
          return { ok: true, json: async () => ({ result: 1 }) };
        }
        if (cmd === 'SETEX') {
          return { ok: true, json: async () => ({ result: 'OK' }) };
        }
        if (cmd === 'GET') {
          return {
            ok: true,
            json: async () => ({
              result: JSON.stringify({
                status: 'running',
                step: 'provisioning_runner',
                repo: 'acme/accessible-app',
              }),
            }),
          };
        }
        return { ok: true, json: async () => ({ result: null }) };
      };

      const client = new UpstashClient({
        url: 'https://mock-redis.upstash.io',
        token: 'mock-token-xyz',
        fetchFn: mockFetch,
      });

      // Rate limit check
      const rateRes = await client.checkRateLimit({ key: 'ip-1', limit: 10 });
      assert.equal(rateRes.allowed, true);
      assert.equal(rateRes.remaining, 9);

      // Seed progress
      await client.seedRunProgress({
        runId: '12345678-1234-4234-8234-123456789abc',
        repo: 'acme/accessible-app',
        sha: 'abc1234',
        targetVisibility: 'public',
      });

      // Get progress
      const progress = await client.getRunProgress('12345678-1234-4234-8234-123456789abc');
      assert.equal(progress.status, 'running');
      assert.equal(progress.step, 'provisioning_runner');
      assert.equal(progress.repo, 'acme/accessible-app');
    });

    it('blocks request when sliding-window rate limit is exceeded', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({ result: 61 }), // Exceeded limit of 60
      });

      const client = new UpstashClient({
        url: 'https://mock-redis.upstash.io',
        token: 'mock-token-xyz',
        fetchFn: mockFetch,
      });

      const rateRes = await client.checkRateLimit({ key: 'ip-spammer', limit: 60 });
      assert.equal(rateRes.allowed, false);
      assert.equal(rateRes.remaining, 0);
    });
  });

  describe('GitHub App Service & Invariants', () => {
    it('mints structurally valid RS256 JWT with 10-minute expiration', () => {
      const jwt = generateAppJwt(testAppId, rsaPrivateKeyPem);
      const parts = jwt.split('.');
      assert.equal(parts.length, 3, 'JWT must contain 3 dot-separated base64url segments');

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      assert.equal(header.alg, 'RS256');
      assert.equal(header.typ, 'JWT');

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      assert.equal(payload.iss, testAppId);
      assert.ok(payload.exp > payload.iat);
      assert.equal(payload.exp - payload.iat, 600); // 10 minutes (60s prior + 540s ahead)
    });

    it('validates HMAC signatures in constant time', () => {
      const payload = JSON.stringify({ hello: 'world' });
      const validSig = computeHmac(payload, webhookSecret);
      assert.equal(verifyGitHubSignature(payload, validSig, webhookSecret), true);

      // Tampered payload
      assert.equal(verifyGitHubSignature(payload + 'x', validSig, webhookSecret), false);
      // Wrong secret
      assert.equal(verifyGitHubSignature(payload, validSig, 'wrong-secret'), false);
      // Missing signature
      assert.equal(verifyGitHubSignature(payload, null, webhookSecret), false);
    });

    it('verifyInstallation checks App presence via GET /repos/{owner}/{repo}/installation', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/installed-org/installed-repo/installation')) {
          return { ok: true, status: 200, json: async () => ({ id: 987654 }) };
        }
        if (url.includes('/uninstalled-org/uninstalled-repo/installation')) {
          return { ok: false, status: 404, text: async () => 'Not Found' };
        }
        return { ok: false, status: 500, text: async () => 'Server error' };
      };

      const service = new GitHubAppService({
        appId: testAppId,
        privateKey: rsaPrivateKeyPem,
        fetchFn: mockFetch,
      });

      const installed = await service.verifyInstallation('installed-org', 'installed-repo');
      assert.equal(installed.installed, true);
      assert.equal(installed.installationId, 987654);

      const uninstalled = await service.verifyInstallation('uninstalled-org', 'uninstalled-repo');
      assert.equal(uninstalled.installed, false);
    });

    it('handlePrivateSetupPr opens setup PR pinned to commit SHA if workflow does not exist', async () => {
      const calls = [];
      const mockFetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET', body: options.body });
        // 1. Check workflow existence -> 404 (does not exist)
        if (url.includes('/contents/.github/workflows/fix11y.yml')) {
          if (options.method === 'PUT') {
            return { ok: true, status: 201, json: async () => ({ content: {} }) };
          }
          return { ok: false, status: 404 };
        }
        // 2. Branch ref
        if (url.includes('/git/ref/heads/main')) {
          return { ok: true, status: 200, json: async () => ({ object: { sha: 'base-sha-123' } }) };
        }
        // 3. Create branch
        if (url.includes('/git/refs')) {
          return { ok: true, status: 201, json: async () => ({ ref: 'refs/heads/fix11y/setup-workflow' }) };
        }
        // 4. Create PR
        if (url.includes('/pulls')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ html_url: 'https://github.com/private-org/repo/pull/1' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };

      const service = new GitHubAppService({
        appId: testAppId,
        privateKey: rsaPrivateKeyPem,
        fetchFn: mockFetch,
      });

      const res = await service.handlePrivateSetupPr({
        owner: 'private-org',
        repo: 'repo',
        token: 'mock-gh-token',
        defaultBranch: 'main',
        actionRef: '5144ef5',
      });

      assert.equal(res.workflowExists, false);
      assert.equal(res.prCreated, true);
      assert.equal(res.prUrl, 'https://github.com/private-org/repo/pull/1');

      // Verify workflow file put in request body references commit SHA 5144ef5
      const putCall = calls.find((c) => c.method === 'PUT');
      assert.ok(putCall, 'Must make PUT call to create workflow file');
      const putBody = JSON.parse(putCall.body);
      const decodedWorkflow = Buffer.from(putBody.content, 'base64').toString('utf8');
      assert.match(decodedWorkflow, /13Dav-arc\/fix11y-action@5144ef5/);
      assert.doesNotMatch(decodedWorkflow, /FIX11Y_APP_PRIVATE_KEY/);
    });
  });

  describe('Webhook Endpoint Routing (POST /api/webhooks/github)', () => {
    it('routes PUBLIC repo push: creates Check Run, seeds Upstash, dispatches runner DAG (202)', async () => {
      const payload = JSON.stringify({
        repository: {
          full_name: 'acme/public-webapp',
          private: false,
          default_branch: 'main',
        },
        after: 'c0ffee1234567890abcdef',
        installation: { id: 112233 },
      });

      const signature = computeHmac(payload, webhookSecret);

      // Mock global fetch for API calls
      const calls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        const urlStr = String(url);

        // Installation token
        if (urlStr.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'mock-install-token', expires_at: new Date(Date.now() + 3600000).toISOString() }), { status: 201 });
        }
        // Check runs
        if (urlStr.includes('/check-runs')) {
          return new Response(JSON.stringify({ id: 888123 }), { status: 201 });
        }
        // Dispatches
        if (urlStr.includes('/dispatches')) {
          return new Response(null, { status: 204 });
        }
        // Runner repo installation check
        if (urlStr.includes('/installation')) {
          return new Response(JSON.stringify({ id: 112233 }), { status: 200 });
        }
        // Upstash REST
        if (urlStr.includes('upstash.io')) {
          return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      };

      try {
        const req = {
          text: async () => payload,
          headers: new Headers({
            'x-hub-signature-256': signature,
            'x-github-event': 'push',
            'x-forwarded-for': '10.0.0.1',
          }),
        };

        const res = await postWebhook(req);
        assert.equal(res.status, 202);
        const data = await res.json();

        assert.equal(data.message, 'Scan dispatched to fix11y-runner');
        assert.equal(data.status, 'provisioning_runner');
        assert.equal(data.checkRunId, 888123);
        assert.ok(data.runId, 'Must return minted runId');

        // Confirm Check Run creation was requested
        const checkRunCall = calls.find((c) => c.url.includes('/check-runs'));
        assert.ok(checkRunCall);
        const checkBody = JSON.parse(checkRunCall.options.body);
        assert.equal(checkBody.head_sha, 'c0ffee1234567890abcdef');
        assert.match(checkBody.details_url, new RegExp(data.runId));

        // Confirm repository_dispatch was fired to fix11y-runner
        const dispatchCall = calls.find((c) => c.url.includes('/repos/13Dav-arc/fix11y-runner/dispatches'));
        assert.ok(dispatchCall);
        const dispatchBody = JSON.parse(dispatchCall.options.body);
        assert.equal(dispatchBody.event_type, 'fix11y-scan');
        assert.equal(dispatchBody.client_payload.runId, data.runId);
        assert.equal(dispatchBody.client_payload.sha, 'c0ffee1234567890abcdef');
        assert.equal(dispatchBody.client_payload.targetVisibility, 'public');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('routes PRIVATE repo push: runs setup PR check with zero Upstash writes and no runner dispatch (200)', async () => {
      const payload = JSON.stringify({
        repository: {
          full_name: 'acme/private-secret-repo',
          private: true,
          default_branch: 'main',
        },
        after: 'deadbeef1234567890abcdef',
        installation: { id: 445566 },
      });

      const signature = computeHmac(payload, webhookSecret);

      const calls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        const urlStr = String(url);

        if (urlStr.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'mock-target-token', expires_at: new Date(Date.now() + 3600000).toISOString() }), { status: 201 });
        }
        // Workflow exists already in this test
        if (urlStr.includes('/contents/.github/workflows/fix11y.yml')) {
          return new Response(JSON.stringify({ name: 'fix11y.yml' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      };

      try {
        const req = {
          text: async () => payload,
          headers: new Headers({
            'x-hub-signature-256': signature,
            'x-github-event': 'push',
            'x-forwarded-for': '10.0.0.2',
          }),
        };

        const res = await postWebhook(req);
        assert.equal(res.status, 200);
        const data = await res.json();

        assert.equal(data.targetVisibility, 'private');
        assert.equal(data.workflowExists, true);
        assert.equal(data.prCreated, false);
        assert.equal(data.runId, undefined, 'Private repos must NEVER mint a runId');

        // Verify that NO run progress was seeded in Upstash and NO dispatches occurred
        assert.ok(!calls.some((c) => c.options?.body?.includes('SETEX') || c.options?.body?.includes('fix11y:run:')));
        assert.ok(!calls.some((c) => c.url.includes('/dispatches')));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Agent Status Polling Endpoint (GET /api/agent/status)', () => {
    it('returns 400 Bad Request when runId parameter is missing', async () => {
      const req = new Request('http://localhost:3000/api/agent/status');
      const res = await getStatus(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Missing required query parameter/);
    });

    it('returns 400 Bad Request when runId is not a valid UUID', async () => {
      const req = new Request('http://localhost:3000/api/agent/status?runId=invalid-uuid-123');
      const res = await getStatus(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Invalid runId format/);
    });

    it('returns 200 with found=false and status=idle when runId is unknown', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify({ result: null }), { status: 200 });

      try {
        const req = new Request(
          'http://localhost:3000/api/agent/status?runId=11111111-2222-3333-4444-555555555555'
        );
        const res = await getStatus(req);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.found, false);
        assert.equal(data.status, 'idle');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns 200 with live progress state when runId is found in Upstash', async () => {
      const originalFetch = globalThis.fetch;
      const progressRecord = {
        status: 'running',
        step: 'atomic_file_fix',
        repo: 'acme/public-repo',
        sha: 'abc1234',
        file: 'index.html',
        filesDone: 2,
        filesTotal: 5,
        prUrl: null,
      };

      globalThis.fetch = async (url, options) => {
        const [cmd] = JSON.parse(options.body);
        if (cmd === 'INCR') return new Response(JSON.stringify({ result: 1 }), { status: 200 });
        if (cmd === 'EXPIRE') return new Response(JSON.stringify({ result: 1 }), { status: 200 });
        if (cmd === 'GET') {
          return new Response(JSON.stringify({ result: JSON.stringify(progressRecord) }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      };

      try {
        const req = new Request(
          'http://localhost:3000/api/agent/status?runId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        );
        const res = await getStatus(req);
        assert.equal(res.status, 200);
        const data = await res.json();

        assert.equal(data.found, true);
        assert.equal(data.runId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
        assert.equal(data.status, 'running');
        assert.equal(data.step, 'atomic_file_fix');
        assert.equal(data.file, 'index.html');
        assert.equal(data.filesDone, 2);
        assert.equal(data.filesTotal, 5);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('On-Demand Trigger Endpoint (POST /api/agent/trigger)', () => {
    it('returns 400 when owner or repo is missing', async () => {
      const req = new Request('http://localhost:3000/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await postTrigger(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Missing required parameter/);
    });

    it('returns 403 Forbidden when GitHub App is not installed on target repo', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/installation')) {
          return new Response('Not Found', { status: 404 });
        }
        return new Response('{}', { status: 200 });
      };

      try {
        const req = new Request('http://localhost:3000/api/agent/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo: 'unauthorized-org/unauthorized-repo' }),
        });

        const res = await postTrigger(req);
        assert.equal(res.status, 403);
        const data = await res.json();
        assert.match(data.error, /fix11y GitHub App is not installed/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns 400 for private repo explaining native GitHub Actions execution', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/installation')) {
          return new Response(JSON.stringify({ id: 555444 }), { status: 200 });
        }
        if (urlStr.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'mock-token', expires_at: new Date(Date.now() + 3600000).toISOString() }), { status: 201 });
        }
        if (urlStr.includes('/repos/private-org/secret-repo')) {
          return new Response(JSON.stringify({ private: true, default_branch: 'main' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      };

      try {
        const req = new Request('http://localhost:3000/api/agent/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: 'private-org', repo: 'secret-repo' }),
        });

        const res = await postTrigger(req);
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.isPrivate, true);
        assert.match(data.error, /Private repositories run remediation inside native GitHub Actions/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('triggers runner DAG for authorized public repository (202 Accepted)', async () => {
      const originalFetch = globalThis.fetch;
      const calls = [];

      globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        const urlStr = String(url);

        if (urlStr.includes('/installation')) {
          return new Response(JSON.stringify({ id: 998877 }), { status: 200 });
        }
        if (urlStr.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'mock-trigger-token', expires_at: new Date(Date.now() + 3600000).toISOString() }), { status: 201 });
        }
        if (urlStr.includes('/repos/public-org/web-app') && !urlStr.includes('/commits') && !urlStr.includes('/check-runs')) {
          return new Response(JSON.stringify({ private: false, default_branch: 'main' }), { status: 200 });
        }
        if (urlStr.includes('/commits/main')) {
          return new Response(JSON.stringify({ sha: 'fedcba0987654321' }), { status: 200 });
        }
        if (urlStr.includes('/check-runs')) {
          return new Response(JSON.stringify({ id: 777666 }), { status: 201 });
        }
        if (urlStr.includes('/dispatches')) {
          return new Response(null, { status: 204 });
        }
        if (urlStr.includes('upstash.io')) {
          return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      };

      try {
        const req = new Request('http://localhost:3000/api/agent/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: 'public-org', repo: 'web-app' }),
        });

        const res = await postTrigger(req);
        assert.equal(res.status, 202);
        const data = await res.json();

        assert.equal(data.status, 'provisioning_runner');
        assert.equal(data.checkRunId, 777666);
        assert.equal(data.sha, 'fedcba0987654321');
        assert.ok(data.runId);

        // Verify Check Run created
        const checkCall = calls.find((c) => c.url.includes('/check-runs'));
        assert.ok(checkCall);
        const checkBody = JSON.parse(checkCall.options.body);
        assert.equal(checkBody.head_sha, 'fedcba0987654321');

        // Verify runner dispatched
        const dispatchCall = calls.find((c) => c.url.includes('/repos/13Dav-arc/fix11y-runner/dispatches'));
        assert.ok(dispatchCall);
        const dispatchBody = JSON.parse(dispatchCall.options.body);
        assert.equal(dispatchBody.client_payload.runId, data.runId);
        assert.equal(dispatchBody.client_payload.targetVisibility, 'public');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
