/**
 * GitHub Webhook Ingestion Route for fix11y Autonomous Agent.
 *
 * Implements asynchronous decoupling to protect against GitHub's 10s webhook timeout:
 * 1. Constant-time HMAC-SHA256 signature verification (< 5ms).
 * 2. Deduplication check using repo + commit SHA to prevent race conditions.
 * 3. Enqueues job into BullMQ backed by Redis.
 * 4. Returns HTTP 202 Accepted immediately in < 50ms.
 */

import crypto from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUE_NAME = process.env.QUEUE_NAME || 'fix11y-queue';

// Factory for Redis connection to allow custom URL or mocking
export function createRedisConnection(url?: string): Redis {
  return new Redis(url || process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
}

/**
 * Validates GitHub's HMAC-SHA256 webhook signature in constant time
 * to protect against timing attacks.
 */
export function verifyGitHubSignature(
  rawPayload: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined = process.env.GITHUB_WEBHOOK_SECRET
): boolean {
  if (!secret || !signatureHeader) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(rawPayload).digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export interface WebhookJobData {
  deliveryId: string;
  repoFullName: string;
  cloneUrl: string;
  commitSha: string;
  defaultBranch: string;
  targetDirectory?: string;
  installationId?: number;
  timestamp: number;
}

/**
 * Core Webhook Processing Logic.
 * Compatible with Next.js App Router, Express, and standard HTTP handlers.
 */
export async function handleGitHubWebhook(
  rawBody: string,
  headers: {
    signature?: string | null;
    event?: string | null;
    delivery?: string | null;
  },
  queue?: Queue<WebhookJobData>,
  secret?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  // 1. Constant-Time HMAC Signature Check
  if (!verifyGitHubSignature(rawBody, headers.signature, secret)) {
    return {
      status: 401,
      body: { error: 'Invalid HMAC signature' },
    };
  }

  // 2. Ignore non-actionable webhook events
  const event = headers.event;
  if (event !== 'push' && event !== 'pull_request') {
    return {
      status: 200,
      body: { message: `Ignored event: ${event}` },
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      status: 400,
      body: { error: 'Malformed JSON payload' },
    };
  }

  const repoFullName = payload.repository?.full_name;
  const cloneUrl = payload.repository?.clone_url;
  const commitSha = payload.after || payload.pull_request?.head?.sha;
  const defaultBranch = payload.repository?.default_branch || 'main';

  if (!repoFullName || !cloneUrl || !commitSha) {
    return {
      status: 400,
      body: { error: 'Missing required repository or commit details' },
    };
  }

  // 3. Deduplication Job ID: Prevents duplicate runs for identical commits
  const jobId = `fix11y:${repoFullName}:${commitSha}`;

  // 4. Enqueue into BullMQ Queue
  const targetQueue = queue || new Queue<WebhookJobData>(QUEUE_NAME, {
    connection: createRedisConnection(),
  });

  await targetQueue.add(
    'remediate-repository',
    {
      deliveryId: headers.delivery || `del-${Date.now()}`,
      repoFullName,
      cloneUrl,
      commitSha,
      defaultBranch,
      installationId: payload.installation?.id,
      timestamp: Date.now(),
    },
    {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );

  // 5. Immediate HTTP 202 Accepted Response (< 50ms)
  return {
    status: 202,
    body: {
      status: 'accepted',
      message: 'Remediation task enqueued for asynchronous execution',
      jobId,
    },
  };
}
