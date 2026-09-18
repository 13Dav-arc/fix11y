import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { POST as triggerScan } from '../src/app/api/agent/trigger/route.js';

describe('Phase 5 — Milestone 5.4: Studio On-Demand Trigger & Degraded Rate-Limit E2E', () => {
  const testAppId = '123456';
  let rsaPrivateKeyPem;
  let originalEnv;

  before(() => {
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    rsaPrivateKeyPem = keyPair.privateKey;

    originalEnv = { ...process.env };
    process.env.GITHUB_WEBHOOK_SECRET = 'mock-webhook-secret';
    process.env.FIX11Y_APP_ID = testAppId;
    process.env.FIX11Y_APP_PRIVATE_KEY = rsaPrivateKeyPem;
    process.env.UPSTASH_REDIS_REST_URL = 'https://mock-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mock-token-xyz';
    process.env.FIX11Y_RUNNER_REPO = '13Dav-arc/fix11y-runner';
  });

  after(() => {
    process.env = originalEnv;
  });

  it('triggers public repository scan: verifies install, seeds Upstash, creates Check Run, dispatches runner (202)', async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      calls.push({ url: urlStr, options });

      // App JWT token request for installation check
      if (urlStr.includes('/app/installations/acme')) {
        return new Response(JSON.stringify({ id: 98765 }), { status: 200 });
      }
      // Installation access token minting
      if (urlStr.includes('/installations/98765/access_tokens')) {
        return new Response(JSON.stringify({ token: 'mock-inst-token-acme' }), { status: 201 });
      }
      // Repository details check (public)
      if (urlStr.includes('/repos/acme/web-app') && !urlStr.includes('/check-runs') && !urlStr.includes('/commits')) {
        return new Response(
          JSON.stringify({
            name: 'web-app',
            full_name: 'acme/web-app',
            private: false, // PUBLIC REPOSITORY
            default_branch: 'main',
          }),
          { status: 200 }
        );
      }
      // Latest commit on default branch
      if (urlStr.includes('/repos/acme/web-app/commits/main')) {
        return new Response(
          JSON.stringify({ sha: '112233445566778899aabbccddeeff0011223344' }),
          { status: 200 }
        );
      }
      // Check Run creation
      if (urlStr.includes('/repos/acme/web-app/check-runs')) {
        return new Response(
          JSON.stringify({ id: 554433, html_url: 'https://github.com/acme/web-app/runs/554433' }),
          { status: 201 }
        );
      }
      // Runner installation check & dispatch
      if (urlStr.includes('/app/installations/13Dav-arc')) {
        return new Response(JSON.stringify({ id: 98765 }), { status: 200 });
      }
      if (urlStr.includes('/repos/13Dav-arc/fix11y-runner/dispatches')) {
        return new Response(null, { status: 204 });
      }
      // Upstash Redis commands (rate limiting INCR and progress SETEX)
      if (urlStr.includes('upstash.io')) {
        let body = [];
        try {
          body = JSON.parse(options.body || '[]');
        } catch {}
        if (Array.isArray(body) && body[0] === 'INCR') {
          return new Response(JSON.stringify({ result: 1 }), { status: 200 });
        }
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }

      return new Response('{}', { status: 200 });
    };

    try {
      const req = new Request('http://localhost:3000/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'acme',
          repo: 'web-app',
        }),
      });

      const res = await triggerScan(req);
      assert.equal(res.status, 202);

      const data = await res.json();
      assert.equal(data.status, 'provisioning_runner');
      assert.equal(data.repo, 'acme/web-app');
      assert.equal(data.sha, '112233445566778899aabbccddeeff0011223344');
      assert.match(
        data.runId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'Must return valid UUID runId'
      );
      assert.equal(data.checkRunId, 554433);

      // Verify repository_dispatch was sent to fix11y-runner
      const dispatchCall = calls.find((c) => c.url.includes('/repos/13Dav-arc/fix11y-runner/dispatches'));
      assert.ok(dispatchCall, 'Must dispatch runner workflow');
      const dispatchPayload = JSON.parse(dispatchCall.options.body);
      assert.equal(dispatchPayload.event_type, 'fix11y-scan');
      assert.equal(dispatchPayload.client_payload.runId, data.runId);
      assert.equal(dispatchPayload.client_payload.owner, 'acme');
      assert.equal(dispatchPayload.client_payload.targetVisibility, 'public');

      // Verify Check Run was created
      const checkRunCall = calls.find((c) => c.url.includes('/check-runs'));
      assert.ok(checkRunCall, 'Must create GitHub Check Run');
      const checkRunPayload = JSON.parse(checkRunCall.options.body);
      assert.equal(checkRunPayload.head_sha, '112233445566778899aabbccddeeff0011223344');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects private repository trigger with 400 and provides deep-link CTA to native Actions workflow', async () => {
    const originalFetch = globalThis.fetch;
    let runnerDispatchAttempted = false;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/app/installations/corp')) {
        return new Response(JSON.stringify({ id: 11223 }), { status: 200 });
      }
      if (urlStr.includes('/installations/11223/access_tokens')) {
        return new Response(JSON.stringify({ token: 'mock-corp-token' }), { status: 201 });
      }
      if (urlStr.includes('/repos/corp/secret-fintech')) {
        return new Response(
          JSON.stringify({
            name: 'secret-fintech',
            full_name: 'corp/secret-fintech',
            private: true, // PRIVATE REPOSITORY
            default_branch: 'main',
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes('/dispatches')) {
        runnerDispatchAttempted = true;
        return new Response(null, { status: 204 });
      }
      if (urlStr.includes('upstash.io')) {
        return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    try {
      const req = new Request('http://localhost:3000/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'corp',
          repo: 'secret-fintech',
        }),
      });

      const res = await triggerScan(req);
      assert.equal(res.status, 400);

      const data = await res.json();
      assert.equal(data.isPrivate, true);
      assert.match(
        data.workflowUrl,
        /https:\/\/github\.com\/corp\/secret-fintech\/actions\/workflows\/fix11y-remediate\.yml/
      );
      assert.match(data.actionsUrl, /https:\/\/github\.com\/corp\/secret-fintech\/actions/);
      assert.match(data.error, /Private repositories run remediation inside native GitHub Actions/i);

      // Invariant: zero runner dispatches for private repositories
      assert.equal(runnerDispatchAttempted, false, 'Private repos must NEVER dispatch to shared runner');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects trigger for uninstalled GitHub App with 403 Forbidden', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/repos/uninstalled-org/uninstalled-repo/installation')) {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }
      if (urlStr.includes('upstash.io')) {
        return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    try {
      const req = new Request('http://localhost:3000/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: 'uninstalled-org',
          repo: 'uninstalled-repo',
        }),
      });

      const res = await triggerScan(req);
      assert.equal(res.status, 403);

      const data = await res.json();
      assert.match(data.error, /fix11y GitHub App is not installed on uninstalled-org\/uninstalled-repo/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  describe('Degraded Rate Limit Telemetry (X-RateLimit-Degraded & ALERT_WEBHOOK_URL)', () => {
    it('fails open with X-RateLimit-Degraded: true and dispatches alert when ALERT_WEBHOOK_URL is set', async () => {
      const originalFetch = globalThis.fetch;
      const alertWebhookUrl = 'https://discord.com/api/webhooks/mock-alerts/token123';
      process.env.ALERT_WEBHOOK_URL = alertWebhookUrl;

      const alertCalls = [];

      globalThis.fetch = async (url, options = {}) => {
        const urlStr = String(url);

        // Alert webhook call
        if (urlStr === alertWebhookUrl) {
          alertCalls.push({ url: urlStr, body: JSON.parse(options.body) });
          return new Response(null, { status: 204 });
        }

        // Upstash Redis simulated 500 error / quota exhaustion
        if (urlStr.includes('upstash.io')) {
          return new Response('Daily command limit exceeded', { status: 500 });
        }

        // GitHub App verification mocking
        if (urlStr.includes('/app/installations/acme')) {
          return new Response(JSON.stringify({ id: 98765 }), { status: 200 });
        }
        if (urlStr.includes('/installations/98765/access_tokens')) {
          return new Response(JSON.stringify({ token: 'mock-token' }), { status: 201 });
        }
        if (urlStr.includes('/repos/acme/web-app') && !urlStr.includes('/check-runs') && !urlStr.includes('/commits')) {
          return new Response(JSON.stringify({ private: false, default_branch: 'main' }), { status: 200 });
        }
        if (urlStr.includes('/commits/main')) {
          return new Response(JSON.stringify({ sha: 'abcdef123456' }), { status: 200 });
        }
        if (urlStr.includes('/check-runs')) {
          return new Response(JSON.stringify({ id: 12345 }), { status: 201 });
        }
        if (urlStr.includes('/dispatches')) {
          return new Response(null, { status: 204 });
        }

        return new Response('{}', { status: 200 });
      };

      try {
        const req = new Request('http://localhost:3000/api/agent/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: 'acme', repo: 'web-app' }),
        });

        const res = await triggerScan(req);
        // Rate limiter must fail open (202 Accepted, NOT 500 or 429)
        assert.equal(res.status, 202);

        // Header must be present
        assert.equal(res.headers.get('X-RateLimit-Degraded'), 'true');

        // Alert webhook must be dispatched
        assert.equal(alertCalls.length, 1);
        assert.equal(alertCalls[0].body.event, 'UPSTASH_RATE_LIMIT_DEGRADED');
        assert.equal(alertCalls[0].body.severity, 'high');
        assert.match(alertCalls[0].body.impact, /Rate limiting failed open/i);
      } finally {
        delete process.env.ALERT_WEBHOOK_URL;
        globalThis.fetch = originalFetch;
      }
    });

    it('safely no-ops with 0 alert fetches when ALERT_WEBHOOK_URL is unset', async () => {
      const originalFetch = globalThis.fetch;
      delete process.env.ALERT_WEBHOOK_URL;

      let alertFetchAttempted = false;

      globalThis.fetch = async (url) => {
        const urlStr = String(url);

        // If fetch is called with undefined or empty url, track it
        if (urlStr === 'undefined' || urlStr.includes('discord') || urlStr.includes('slack')) {
          alertFetchAttempted = true;
        }

        // Upstash failure
        if (urlStr.includes('upstash.io')) {
          return new Response('Network error', { status: 500 });
        }

        // GitHub App verification mocking
        if (urlStr.includes('/app/installations/acme')) {
          return new Response(JSON.stringify({ id: 98765 }), { status: 200 });
        }
        if (urlStr.includes('/installations/98765/access_tokens')) {
          return new Response(JSON.stringify({ token: 'mock-token' }), { status: 201 });
        }
        if (urlStr.includes('/repos/acme/web-app') && !urlStr.includes('/check-runs') && !urlStr.includes('/commits')) {
          return new Response(JSON.stringify({ private: false, default_branch: 'main' }), { status: 200 });
        }
        if (urlStr.includes('/commits/main')) {
          return new Response(JSON.stringify({ sha: 'abcdef123456' }), { status: 200 });
        }
        if (urlStr.includes('/check-runs')) {
          return new Response(JSON.stringify({ id: 12345 }), { status: 201 });
        }
        if (urlStr.includes('/dispatches')) {
          return new Response(null, { status: 204 });
        }

        return new Response('{}', { status: 200 });
      };

      try {
        const req = new Request('http://localhost:3000/api/agent/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: 'acme', repo: 'web-app' }),
        });

        const res = await triggerScan(req);
        assert.equal(res.status, 202);
        assert.equal(res.headers.get('X-RateLimit-Degraded'), 'true');
        assert.equal(alertFetchAttempted, false, 'Must NOT attempt fetch when ALERT_WEBHOOK_URL is unset');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
