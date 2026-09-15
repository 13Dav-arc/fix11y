import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  verifyGitHubSignature,
  handleGitHubWebhook,
  WebhookJobData,
} from '../src/webhook/github-webhook-route.js';

function computeSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  return `sha256=${hmac.update(payload).digest('hex')}`;
}

test('verifyGitHubSignature - validates valid HMAC signature', () => {
  const secret = 'super-secret-key-123';
  const payload = JSON.stringify({ test: 'payload' });
  const signature = computeSignature(payload, secret);

  assert.equal(verifyGitHubSignature(payload, signature, secret), true);
});

test('verifyGitHubSignature - rejects invalid or tampered signature', () => {
  const secret = 'super-secret-key-123';
  const payload = JSON.stringify({ test: 'payload' });
  const tamperedPayload = JSON.stringify({ test: 'tampered' });
  const signature = computeSignature(payload, secret);

  assert.equal(verifyGitHubSignature(tamperedPayload, signature, secret), false);
  assert.equal(verifyGitHubSignature(payload, 'sha256=invalidhex', secret), false);
  assert.equal(verifyGitHubSignature(payload, null, secret), false);
  assert.equal(verifyGitHubSignature(payload, signature, ''), false);
});

test('handleGitHubWebhook - returns 401 on invalid signature', async () => {
  const result = await handleGitHubWebhook(
    '{}',
    { signature: 'sha256=bad' },
    undefined,
    'secret'
  );

  assert.equal(result.status, 401);
  assert.equal((result.body as any).error, 'Invalid HMAC signature');
});

test('handleGitHubWebhook - returns 200 on non-actionable events (e.g., ping)', async () => {
  const secret = 'test-secret';
  const payload = JSON.stringify({ zen: 'Keep it logically awesome.' });
  const signature = computeSignature(payload, secret);

  const result = await handleGitHubWebhook(
    payload,
    { signature, event: 'ping' },
    undefined,
    secret
  );

  assert.equal(result.status, 200);
  assert.ok((result.body as any).message.includes('Ignored event: ping'));
});

test('handleGitHubWebhook - returns 400 on malformed JSON payload', async () => {
  const secret = 'test-secret';
  const payload = '{ not valid json: ';
  const signature = computeSignature(payload, secret);

  const result = await handleGitHubWebhook(
    payload,
    { signature, event: 'push' },
    undefined,
    secret
  );

  assert.equal(result.status, 400);
  assert.equal((result.body as any).error, 'Malformed JSON payload');
});

test('handleGitHubWebhook - returns 400 on missing repo or commit information', async () => {
  const secret = 'test-secret';
  const payload = JSON.stringify({ repository: { name: 'missing full name' } });
  const signature = computeSignature(payload, secret);

  const result = await handleGitHubWebhook(
    payload,
    { signature, event: 'push' },
    undefined,
    secret
  );

  assert.equal(result.status, 400);
  assert.equal((result.body as any).error, 'Missing required repository or commit details');
});

test('handleGitHubWebhook - enqueues job with deduplication ID and returns 202 Accepted', async () => {
  const secret = 'test-secret';
  const repoFullName = 'acme-corp/accessible-storefront';
  const commitSha = 'b7d14d2b270a41d7d07d4b45a90d4589d81d24c0';
  const cloneUrl = 'https://github.com/acme-corp/accessible-storefront.git';

  const payload = JSON.stringify({
    repository: {
      full_name: repoFullName,
      clone_url: cloneUrl,
      default_branch: 'main',
    },
    after: commitSha,
    installation: { id: 98765 },
  });

  const signature = computeSignature(payload, secret);
  const delivery = 'del-uuid-12345';

  const queuedJobs: Array<{ name: string; data: WebhookJobData; opts: any }> = [];
  const mockQueue: any = {
    add: async (name: string, data: WebhookJobData, opts: any) => {
      queuedJobs.push({ name, data, opts });
      return { id: opts.jobId };
    },
  };

  const startTime = Date.now();
  const result = await handleGitHubWebhook(
    payload,
    { signature, event: 'push', delivery },
    mockQueue,
    secret
  );
  const duration = Date.now() - startTime;

  // Verify response latency requirement (< 50ms)
  assert.ok(duration < 50, `Webhook response took ${duration}ms, expected < 50ms`);

  // Verify HTTP 202 Accepted
  assert.equal(result.status, 202);
  const expectedJobId = `fix11y:${repoFullName}:${commitSha}`;
  assert.equal((result.body as any).status, 'accepted');
  assert.equal((result.body as any).jobId, expectedJobId);

  // Verify BullMQ enqueue call
  assert.equal(queuedJobs.length, 1);
  const enqueued = queuedJobs[0];
  assert.equal(enqueued.name, 'remediate-repository');
  assert.equal(enqueued.opts.jobId, expectedJobId);
  assert.equal(enqueued.data.repoFullName, repoFullName);
  assert.equal(enqueued.data.commitSha, commitSha);
  assert.equal(enqueued.data.cloneUrl, cloneUrl);
  assert.equal(enqueued.data.installationId, 98765);
  assert.equal(enqueued.data.deliveryId, delivery);
});
