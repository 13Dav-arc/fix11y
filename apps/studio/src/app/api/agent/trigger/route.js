import crypto from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { validateVercelEnv } from '../../lib/env-check.js';
import { UpstashClient } from '../../lib/upstash.js';
import { GitHubAppService } from '../../lib/github-app.js';

export const dynamic = 'force-dynamic';

/**
 * On-Demand Autonomous Remediation Trigger API Route (Architecture v2.2).
 *
 * POST /api/agent/trigger
 * Request body: { owner, repo, sha?, branch? } or { repo: "owner/repo", sha?, branch? }
 *
 * Security Invariant:
 * - Checks App installation via verifyInstallation() before executing.
 * - Rejects unauthorized requests with 403 Forbidden.
 * - Dispatches runner DAG for public repos; directs private repos to native GitHub Actions.
 */
export async function POST(req) {
  try {
    // 1. Rate limiting check (20 triggers/min per IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               req.headers.get('x-real-ip') ||
               '127.0.0.1';

    const upstash = new UpstashClient();
    const rateLimit = await upstash.checkRateLimit({
      key: `trigger:${ip}`,
      limit: 20,
      windowSec: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before triggering another scan.' },
        { status: 429 }
      );
    }

    // 2. Pre-flight environment configuration validation
    let config;
    try {
      config = validateVercelEnv();
    } catch (err) {
      return NextResponse.json(
        { error: err.message },
        { status: 500 }
      );
    }

    // 3. Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Malformed JSON in request body' },
        { status: 400 }
      );
    }

    let { owner, repo, sha, branch } = body;
    if (!owner && repo && repo.includes('/')) {
      [owner, repo] = repo.split('/');
    }

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing required parameter: "owner" and "repo" (or "repo: owner/name")' },
        { status: 400 }
      );
    }

    const appService = new GitHubAppService({
      appId: config.appId,
      privateKey: config.privateKey,
    });

    // 4. Verify GitHub App installation on target repository
    const installCheck = await appService.verifyInstallation(owner, repo);
    if (!installCheck.installed) {
      return NextResponse.json(
        {
          error: `fix11y GitHub App is not installed on ${owner}/${repo}. Please install the App on the target repository first.`,
        },
        { status: 403 }
      );
    }

    const installationId = installCheck.installationId;
    const targetToken = await appService.getInstallationToken(installationId);

    // 5. Fetch repository details to inspect visibility
    const repoDetails = await appService.getRepoDetails(owner, repo, targetToken);

    if (repoDetails.private) {
      return NextResponse.json(
        {
          error: 'Private repositories run remediation inside native GitHub Actions (.github/workflows/fix11y-remediate.yml). On-demand trigger is supported for public repositories.',
          isPrivate: true,
          workflowUrl: `https://github.com/${owner}/${repo}/actions/workflows/fix11y-remediate.yml`,
          actionsUrl: `https://github.com/${owner}/${repo}/actions`,
        },
        { status: 400 }
      );
    }

    // 6. Determine target commit SHA
    let headSha = sha;
    if (!headSha) {
      const targetBranch = branch || repoDetails.default_branch || 'main';
      try {
        const commitRes = await appService.fetch(
          `${appService.baseUrl}/repos/${owner}/${repo}/commits/${targetBranch}`,
          {
            headers: {
              Authorization: `Bearer ${targetToken}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'fix11y-studio/1.0',
            },
          }
        );
        if (commitRes.ok) {
          const commitData = await commitRes.json();
          headSha = commitData.sha;
        } else {
          headSha = 'HEAD';
        }
      } catch {
        headSha = 'HEAD';
      }
    }

    // 7. Seed Upstash progress record
    const runId = crypto.randomUUID();
    const repoFullName = `${owner}/${repo}`;

    await upstash.seedRunProgress({
      runId,
      repo: repoFullName,
      sha: headSha,
      targetVisibility: 'public',
      step: 'provisioning_runner',
    });

    // 8. Create initial Check Run
    const checkRunId = await appService.createCheckRun({
      owner,
      repo,
      token: targetToken,
      headSha,
      runId,
    });

    // 9. Obtain runner repo token and dispatch runner DAG
    const [runnerOwner, runnerRepo] = config.runnerRepo.split('/');
    let runnerToken = targetToken;
    try {
      const runnerInstall = await appService.verifyInstallation(runnerOwner, runnerRepo);
      if (runnerInstall.installed && runnerInstall.installationId) {
        runnerToken = await appService.getInstallationToken(runnerInstall.installationId);
      }
    } catch {
      // Runner in same installation or accessible via targetToken
    }

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

    const res = NextResponse.json(
      {
        message: 'Autonomous remediation scan triggered successfully',
        runId,
        checkRunId,
        status: 'provisioning_runner',
        repo: repoFullName,
        sha: headSha,
      },
      { status: 202 }
    );

    if (rateLimit?.degraded) {
      res.headers.set('X-RateLimit-Degraded', 'true');
    }

    return res;
  } catch (error) {
    console.error('[ERROR] On-demand trigger error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error while triggering scan',
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
