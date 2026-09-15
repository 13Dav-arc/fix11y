/**
 * Asynchronous Remediation Worker for fix11y Autonomous Agent.
 *
 * Consumes background remediation jobs from the BullMQ queue (`a11y-remediation-jobs`),
 * executes the autonomous remediation pipeline, and provides clean shutdown handling.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import dotenv from 'dotenv';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME, createRedisConnection, WebhookJobData } from './webhook/github-webhook-route.js';
import { AccessibleLogger } from './cli/accessible-logger.js';

// Load .env from process.cwd() or monorepo root
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
];
for (const cand of envCandidates) {
  if (fs.existsSync(cand)) {
    dotenv.config({ path: cand });
    break;
  }
}

export interface WorkerOptions {
  connection?: Redis;
  concurrency?: number;
  logger?: AccessibleLogger;
}

export type JobProcessor = (job: Job<WebhookJobData>) => Promise<{
  success: boolean;
  repoFullName: string;
  commitSha: string;
  details?: Record<string, unknown>;
}>;

/**
 * Default Phase 1 job processor skeleton.
 * In Phase 4, this integrates with the LangGraph state machine.
 */
export async function defaultJobProcessor(
  job: Job<WebhookJobData>,
  logger: AccessibleLogger = new AccessibleLogger()
) {
  const { repoFullName, commitSha, cloneUrl, defaultBranch, targetDirectory } = job.data;

  logger.log('start', `Processing remediation job for ${repoFullName}`, {
    jobId: job.id,
    commitSha: commitSha.substring(0, 7),
    branch: defaultBranch,
    targetDirectory: targetDirectory || '.',
  });

  // Placeholder for Phase 2 (E2B sandbox) & Phase 4 (LangGraph workflow)
  logger.log('info', `Simulating remediation pipeline execution on ${repoFullName}`);

  logger.log('success', `Completed remediation job for ${repoFullName}`, {
    jobId: job.id,
    commitSha: commitSha.substring(0, 7),
  });

  return {
    success: true,
    repoFullName,
    commitSha,
  };
}

/**
 * Creates and starts a BullMQ worker for accessibility remediation jobs.
 */
export function createRemediationWorker(
  options: WorkerOptions = {},
  customProcessor?: JobProcessor
): Worker<WebhookJobData> {
  const connection = options.connection || createRedisConnection();
  const logger = options.logger || new AccessibleLogger();
  const concurrency = options.concurrency || 2;

  const processor: JobProcessor = customProcessor || ((job) => defaultJobProcessor(job, logger));

  const worker = new Worker<WebhookJobData>(
    QUEUE_NAME,
    async (job) => {
      return await processor(job);
    },
    {
      connection,
      concurrency,
    }
  );

  worker.on('ready', () => {
    logger.log('info', `Remediation worker connected and listening on queue "${QUEUE_NAME}"`);
  });

  worker.on('failed', (job, err) => {
    logger.log('error', `Job ${job?.id} failed: ${err.message}`, {
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.log('error', `Worker encountered an internal error: ${err.message}`);
  });

  return worker;
}

/**
 * Creates and starts a lightweight HTTP health check server for Render Web Service port binding.
 */
export function createHealthCheckServer(
  port: number = Number(process.env.PORT) || 10000,
  logger: AccessibleLogger = new AccessibleLogger()
): http.Server {
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (req.method === 'GET' && (url === '/' || url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    logger.log('info', `Health check server listening on port ${port}`);
  });

  return server;
}

/**
 * Sets up a non-blocking keep-alive ping to prevent idle spin-down on Render free tier.
 */
export function setupKeepAlive(
  externalUrl?: string,
  logger: AccessibleLogger = new AccessibleLogger(),
  intervalMs: number = 13 * 60 * 1000 // 13 minutes (780,000 ms)
): NodeJS.Timeout | undefined {
  const targetUrl = externalUrl || process.env.RENDER_EXTERNAL_URL;
  if (!targetUrl) return undefined;

  const pingUrl = `${targetUrl.replace(/\/$/, '')}/health`;
  logger.log('info', `Configuring keep-alive self-ping for ${pingUrl} every ${intervalMs / 60000} minutes`);

  const timer = setInterval(async () => {
    try {
      const res = await fetch(pingUrl, {
        headers: { 'User-Agent': 'fix11y-worker-keepalive' },
      });
      if (res.ok) {
        logger.log('info', `Keep-alive ping to ${pingUrl} succeeded (status ${res.status})`);
      } else {
        logger.log('warn', `Keep-alive ping to ${pingUrl} returned status ${res.status}`);
      }
    } catch (err: any) {
      logger.log('warn', `Keep-alive ping to ${pingUrl} failed: ${err.message}`);
    }
  }, intervalMs);

  timer.unref();
  return timer;
}

/**
 * Standalone worker execution runner with graceful shutdown.
 */
export async function runStandaloneWorker(): Promise<void> {
  const logger = new AccessibleLogger();
  logger.log('info', 'Starting fix11y remediation worker process...');

  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const hasE2B = Boolean(process.env.E2B_API_KEY);
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const sanitizedRedis = redisUrl.replace(/:([^@]+)@/, ':***@');

  logger.log('info', `Configuration loaded: GEMINI_API_KEY=${hasGemini ? '[Configured]' : '[Missing]'}, E2B Sandbox=${hasE2B ? '[Configured]' : '[Missing]'}, Redis=${sanitizedRedis}`);

  // 1. Start lightweight HTTP health check server for Render port detection
  const port = Number(process.env.PORT) || 10000;
  const httpServer = createHealthCheckServer(port, logger);

  // 2. Setup Render keep-alive self-ping
  const keepAliveTimer = setupKeepAlive(process.env.RENDER_EXTERNAL_URL, logger);

  // 3. Connect to Redis and BullMQ
  const connection = createRedisConnection();
  const worker = createRemediationWorker({ connection, logger });

  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.log('warn', `Received ${signal}, initiating graceful worker shutdown...`);
    if (keepAliveTimer) clearInterval(keepAliveTimer);

    try {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await worker.close();
      await connection.quit();
      logger.log('success', 'Health check server, worker, and Redis connection closed cleanly.');
      process.exit(0);
    } catch (err: any) {
      logger.log('error', `Error during worker shutdown: ${err?.message || err}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Auto-run if executed directly as script
if (process.argv[1] && process.argv[1].endsWith('worker.js')) {
  runStandaloneWorker().catch((err) => {
    console.error('Fatal worker startup error:', err);
    process.exit(1);
  });
}
