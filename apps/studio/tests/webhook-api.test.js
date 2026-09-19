import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { POST as postWebhook } from '../src/app/api/webhooks/github/route.js';
import { resolveRunnerToken } from '../src/app/api/lib/github-app.js';

function computeSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  return `sha256=${hmac.update(payload).digest('hex')}`;
}

describe('GitHub Webhook Route Handler (POST /api/webhooks/github)', () => {
  const secret = 'test-webhook-secret';
  const originalSecret = process.env.GITHUB_WEBHOOK_SECRET;

  process.env.GITHUB_WEBHOOK_SECRET = secret;

  it('rejects request with 401 when signature is invalid or missing', async () => {
    const req = {
      text: async () => JSON.stringify({ action: 'ping' }),
      headers: new Headers({
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'push',
        'x-github-delivery': 'del-123',
      }),
    };

    const res = await postWebhook(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Invalid HMAC signature');
  });

  it('returns 200 on ping event with valid signature', async () => {
    const rawPayload = JSON.stringify({ zen: 'Keep it logically awesome.' });
    const signature = computeSignature(rawPayload, secret);

    const req = {
      text: async () => rawPayload,
      headers: new Headers({
        'x-hub-signature-256': signature,
        'x-github-event': 'ping',
        'x-github-delivery': 'del-456',
      }),
    };

    const res = await postWebhook(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.message && body.message.includes('Ignored event: ping'));
  });

  it('returns 400 on malformed JSON payload with valid signature', async () => {
    const rawPayload = 'invalid json {';
    const signature = computeSignature(rawPayload, secret);

    const req = {
      text: async () => rawPayload,
      headers: new Headers({
        'x-hub-signature-256': signature,
        'x-github-event': 'push',
        'x-github-delivery': 'del-789',
      }),
    };

    const res = await postWebhook(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Malformed JSON payload');
  });

  it('returns 500 when request.text() throws an internal error', async () => {
    const req = {
      text: async () => {
        throw new Error('Stream read failure');
      },
      headers: new Headers(),
    };

    const res = await postWebhook(req);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Internal server error while processing webhook');
  });

  it('returns 200 and ignores push events on fix11y remediation branches', async () => {
    const rawPayload = JSON.stringify({
      ref: 'refs/heads/fix11y/remediation-abc1234',
      repository: { full_name: 'owner/repo' },
      after: 'abcdef1234567890',
    });
    const signature = computeSignature(rawPayload, secret);

    const req = {
      text: async () => rawPayload,
      headers: new Headers({
        'x-hub-signature-256': signature,
        'x-github-event': 'push',
        'x-github-delivery': 'del-remediation-branch',
      }),
    };

    const res = await postWebhook(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.message.includes('Ignored fix11y remediation branch push'));
  });

  it('returns 200 and ignores push events authored by fix11y[bot]', async () => {
    const rawPayload = JSON.stringify({
      ref: 'refs/heads/custom-feature',
      repository: { full_name: 'owner/repo' },
      sender: { login: 'fix11y[bot]' },
      after: 'abcdef1234567890',
    });
    const signature = computeSignature(rawPayload, secret);

    const req = {
      text: async () => rawPayload,
      headers: new Headers({
        'x-hub-signature-256': signature,
        'x-github-event': 'push',
        'x-github-delivery': 'del-bot-push',
      }),
    };

    const res = await postWebhook(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.message.includes('Ignored fix11y remediation branch push'));
  });

  describe('Runner Token Precedence (resolveRunnerToken)', () => {
    it('App-token-wins-when-both-available: mints dynamic App token even when static PAT is set', async () => {
      const mockAppService = {
        verifyInstallation: async (owner, repo) => {
          assert.equal(owner, '13Dav-arc');
          assert.equal(repo, 'fix11y-runner');
          return { installed: true, installationId: 161624851 };
        },
        getInstallationToken: async (installId) => {
          assert.equal(installId, 161624851);
          return 'ghs_mockAppInstallationToken123';
        },
      };

      const token = await resolveRunnerToken({
        appService: mockAppService,
        runnerRepo: '13Dav-arc/fix11y-runner',
        staticRunnerToken: 'ghp_staticPatOverride456',
        targetToken: 'ghs_targetRepoToken789',
      });

      assert.equal(token, 'ghs_mockAppInstallationToken123');
    });

    it('PAT-fallback-when-App-not-installed: falls back to static PAT when App lacks runner access', async () => {
      const mockAppService = {
        verifyInstallation: async () => ({ installed: false }),
      };

      const token = await resolveRunnerToken({
        appService: mockAppService,
        runnerRepo: '13Dav-arc/fix11y-runner',
        staticRunnerToken: 'ghp_staticPatOverride456',
        targetToken: 'ghs_targetRepoToken789',
      });

      assert.equal(token, 'ghp_staticPatOverride456');
    });

    it('target-token-as-last-resort: uses targetToken when neither App nor static PAT are available', async () => {
      const mockAppService = {
        verifyInstallation: async () => ({ installed: false }),
      };

      const token = await resolveRunnerToken({
        appService: mockAppService,
        runnerRepo: '13Dav-arc/fix11y-runner',
        staticRunnerToken: null,
        targetToken: 'ghs_targetRepoToken789',
      });

      assert.equal(token, 'ghs_targetRepoToken789');
    });
  });
});

