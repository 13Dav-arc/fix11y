import crypto from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { validateVercelEnv } from '../../lib/env-check.js';
import { UpstashClient } from '../../lib/upstash.js';
import { GitHubAppService, verifyGitHubSignature } from '../../lib/github-app.js';

export const dynamic = 'force-dynamic';

/**
 * GitHub Webhook Ingestion API Route Handler (Architecture v2.2).
 *
 * Receives GitHub App push events at POST /api/webhooks/github.
 * Routes execution based on target repository visibility:
 * - Public: Dispatches fix11y-runner workflow DAG via repository_dispatch and seeds Upstash.
 * - Private: Air-gapped isolation via native fix11y-action workflow (or setup PR).
 */
export async function POST(req) {
  try {
    // 1. Raw body read first to preserve HMAC-SHA256 byte exactness
    const rawPayload = await req.text();

    // 2. Rate limiting check (100 req/min per IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               req.headers.get('x-real-ip') ||
               '127.0.0.1';

    const upstash = new UpstashClient();
    const rateLimit = await upstash.checkRateLimit({
      key: `webhook:${ip}`,
      limit: 100,
      windowSec: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // 3. Webhook Secret & HMAC-SHA256 signature verification
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    const signature = req.headers.get('x-hub-signature-256');

    if (!verifyGitHubSignature(rawPayload, signature, webhookSecret)) {
      return NextResponse.json(
        { error: 'Invalid HMAC signature' },
        { status: 401 }
      );
    }

    // 4. Handle GitHub event types
    const event = req.headers.get('x-github-event');
    if (event === 'ping') {
      return NextResponse.json(
        { message: 'Ignored event: ping' },
        { status: 200 }
      );
    }

    if (event !== 'push') {
      return NextResponse.json(
        { message: `Ignored event: ${event}` },
        { status: 200 }
      );
    }

    // 5. Parse push event payload
    let payload;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      return NextResponse.json(
        { error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    // Ignore branch deletion events
    if (payload.deleted || payload.after === '0000000000000000000000000000000000000000') {
      return NextResponse.json(
        { message: 'Ignored branch deletion event' },
        { status: 200 }
      );
    }

    // Ignore fix11y remediation branches and bot pushes to prevent recursive loops
    if (
      payload.ref?.startsWith('refs/heads/fix11y/') ||
      payload.head_commit?.committer?.name === 'fix11y[bot]' ||
      payload.sender?.login?.includes('fix11y')
    ) {
      return NextResponse.json(
        { message: `Ignored fix11y remediation branch push: ${payload.ref}` },
        { status: 200 }
      );
    }

    const repoFullName = payload.repository?.full_name;
    const headSha = payload.after || payload.head_commit?.id;
    const installationId = payload.installation?.id;

    if (!repoFullName || !headSha) {
      return NextResponse.json(
        { error: 'Missing repository or commit SHA in payload' },
        { status: 400 }
      );
    }

    // 6. Pre-flight environment configuration validation for push execution
    const config = validateVercelEnv();

    const [owner, repo] = repoFullName.split('/');
    const isPrivate = Boolean(payload.repository?.private);
    const defaultBranch = payload.repository?.default_branch || 'main';

    const appService = new GitHubAppService({
      appId: config.appId,
      privateKey: config.privateKey,
    });

    // 7. Route based on visibility
    if (isPrivate) {
      // Private Repository Path:
      // Verify or install .github/workflows/fix11y.yml pinned to immutable commit SHA
      const targetToken = await appService.getInstallationToken(installationId);
      const setupResult = await appService.handlePrivateSetupPr({
        owner,
        repo,
        token: targetToken,
        defaultBranch,
        actionRef: config.actionRef,
      });

      return NextResponse.json(
        {
          message: setupResult.prCreated
            ? 'Setup PR created to install fix11y-action'
            : 'fix11y-action is configured. Private scan runs inside native GitHub Actions.',
          status: setupResult.prCreated ? 'setup_pr_opened' : 'workflow_present',
          targetVisibility: 'private',
          workflowExists: setupResult.workflowExists,
          prCreated: setupResult.prCreated,
          prUrl: setupResult.prUrl || null,
        },
        { status: 200 }
      );
    }

    // Public Repository Path:
    // Shared runner execution with Upstash progress tracking and Check Run
    const runId = crypto.randomUUID();

    // Seed initial progress in Upstash (1-hour TTL)
    await upstash.seedRunProgress({
      runId,
      repo: repoFullName,
      sha: headSha,
      targetVisibility: 'public',
      step: 'provisioning_runner',
    });

    // Mint target repository installation token & create initial Check Run
    const targetToken = await appService.getInstallationToken(installationId);
    const checkRunId = await appService.createCheckRun({
      owner,
      repo,
      token: targetToken,
      headSha,
      runId,
    });

    // Obtain runner repo token (explicit FIX11Y_RUNNER_TOKEN, or via App installation on runner repo)
    const [runnerOwner, runnerRepo] = config.runnerRepo.split('/');
    let runnerToken = config.runnerToken || null;
    if (!runnerToken) {
      try {
        const runnerInstall = await appService.verifyInstallation(runnerOwner, runnerRepo);
        if (runnerInstall.installed && runnerInstall.installationId) {
          runnerToken = await appService.getInstallationToken(runnerInstall.installationId);
        }
      } catch (err) {
        console.warn(`[WARNING] Could not obtain installation token for runner repo ${config.runnerRepo}: ${err.message}`);
      }
    }

    if (!runnerToken) {
      runnerToken = targetToken;
    }

    // Dispatch fix11y-runner workflow DAG via repository_dispatch
    await appService.dispatchRunner({
      runnerRepo: config.runnerRepo,
      token: runnerToken,
      clientPayload: {
        runId,
        owner,
        repo,
        sha: headSha,
        checkRunId,
        installationId,
        targetVisibility: 'public',
      },
    });

    return NextResponse.json(
      {
        message: 'Scan dispatched to fix11y-runner',
        runId,
        checkRunId,
        status: 'provisioning_runner',
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[ERROR] GitHub Webhook processing error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error while processing webhook',
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
