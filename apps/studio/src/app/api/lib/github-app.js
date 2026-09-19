import crypto from 'node:crypto';

function base64url(obj) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function generateAppJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,
    exp: now + 540,
    iss: appId,
  };

  const encodedHeader = base64url(header);
  const encodedPayload = base64url(payload);
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const signature = signer.sign(privateKeyPem, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signInput}.${signature}`;
}

/**
 * Validates GitHub's HMAC-SHA256 webhook signature in constant time.
 */
export function verifyGitHubSignature(
  rawPayload,
  signatureHeader,
  secret = process.env.GITHUB_WEBHOOK_SECRET
) {
  if (!secret || !signatureHeader) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(rawPayload).digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export class GitHubAppService {
  constructor({ appId, privateKey, baseUrl = 'https://api.github.com', fetchFn = globalThis.fetch } = {}) {
    this.appId = appId;
    this.privateKey = privateKey;
    this.baseUrl = baseUrl;
    this.fetch = fetchFn;
    this.tokenCache = new Map();
  }

  getJwt() {
    if (!this.appId || !this.privateKey) {
      throw new Error('Missing FIX11Y_APP_ID or FIX11Y_APP_PRIVATE_KEY for JWT generation');
    }
    return generateAppJwt(this.appId, this.privateKey);
  }

  async getInstallationToken(installationId) {
    const cached = this.tokenCache.get(installationId);
    if (cached && cached.expiresAt > Date.now() + 60000) {
      return cached.token;
    }

    const jwt = this.getJwt();
    const res = await this.fetch(`${this.baseUrl}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to mint App installation token (${res.status}): ${errText}`);
    }

    const data = await res.json();
    this.tokenCache.set(installationId, {
      token: data.token,
      expiresAt: new Date(data.expires_at).getTime(),
    });
    return data.token;
  }

  /**
   * Verifies that the GitHub App is installed on target repository.
   * Required for unauthorized trigger protection.
   */
  async verifyInstallation(owner, repo) {
    const jwt = this.getJwt();
    const res = await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/installation`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
      },
    });

    if (res.status === 404) {
      return { installed: false, error: `fix11y GitHub App is not installed on ${owner}/${repo}` };
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to check repository installation (${res.status}): ${text}`);
    }

    const data = await res.json();
    return { installed: true, installationId: data.id };
  }

  /**
   * Fetches target repository details (visibility, default branch, etc.).
   */
  async getRepoDetails(owner, repo, token) {
    const res = await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch repository details (${res.status}): ${errText}`);
    }

    return await res.json();
  }

  /**
   * Creates initial Check Run on commit SHA.
   */
  async createCheckRun({ owner, repo, token, headSha, runId }) {
    const res = await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/check-runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'fix11y: accessibility scan',
        head_sha: headSha,
        status: 'in_progress',
        details_url: `https://fix11y.vercel.app/agent?runId=${runId}`,
        output: {
          title: 'fix11y: Provisioning GitHub Actions runner VM...',
          summary: 'Runner VM provisioning in progress (30–75s cold-start)...',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[WARNING] Check Run creation returned ${res.status}: ${errText}`);
      return null;
    }

    const data = await res.json();
    return data.id;
  }

  /**
   * Dispatches repository_dispatch to control runner repo.
   */
  async dispatchRunner({ runnerRepo = '13Dav-arc/fix11y-runner', clientPayload, token }) {
    const [owner, repo] = runnerRepo.split('/');
    const res = await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'fix11y-scan',
        client_payload: clientPayload,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to dispatch runner on ${runnerRepo} (${res.status}): ${errText}`);
    }

    return true;
  }

  /**
   * Checks if .github/workflows/fix11y.yml exists in target private repository.
   * If absent, creates branch and opens initial setup PR.
   */
  async handlePrivateSetupPr({ owner, repo, token, defaultBranch = 'main', actionRef = '5144ef5' }) {
    // 1. Check if workflow file exists
    const checkRes = await this.fetch(
      `${this.baseUrl}/repos/${owner}/${repo}/contents/.github/workflows/fix11y.yml?ref=${defaultBranch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'fix11y-studio/1.0',
        },
      }
    );

    if (checkRes.ok) {
      return { workflowExists: true, prCreated: false };
    }

    console.log(`[INFO] Private repo ${owner}/${repo} missing fix11y.yml — opening setup PR pinned to @${actionRef}...`);

    const branchName = 'fix11y/setup-workflow';
    const workflowContent = `name: fix11y Accessibility Remediation

on:
  push:
    branches: [${defaultBranch}, master]
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  checks: write

jobs:
  remediate:
    name: Autonomous Accessibility Remediation
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run fix11y Action
        uses: 13Dav-arc/fix11y-action@${actionRef}
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          gemini-api-key: \${{ secrets.GEMINI_API_KEY }} # Optional
`;

    // Get default branch commit SHA
    const refRes = await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
      },
    });

    if (!refRes.ok) {
      throw new Error(`Failed to fetch ref for branch ${defaultBranch} (${refRes.status})`);
    }

    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // Create branch
    await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });

    // Create file
    await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/.github/workflows/fix11y.yml`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'ci: add automated fix11y accessibility remediation workflow',
        content: Buffer.from(workflowContent).toString('base64'),
        branch: branchName,
      }),
    });

    // Create PR
    const prBody = `## ♿ Automated Accessibility Remediation Setup

This pull request installs the **fix11y** accessibility remediation workflow into your repository:
* **Workflow:** \`.github/workflows/fix11y.yml\`
* **Action:** \`13Dav-arc/fix11y-action@${actionRef}\`

### 🔒 Privacy & Data Confidentiality
* 🛡️ **100% Air-Gapped**: Runs entirely inside your private repository's GitHub Actions runner.
* 🛡️ **Zero External Leaks**: No source code or commit details are ever sent to external cloud infrastructure.
* 🛡️ **Autonomous Pull Requests**: Runs \`npm test\` locally before opening non-destructive PRs for accessibility violations.

Merge this PR to enable automatic WCAG 2.1/2.2 AA fixes on future pushes.`;

    const prRes = await this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fix11y-studio/1.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'fix11y: add automated accessibility remediation workflow',
        body: prBody,
        head: branchName,
        base: defaultBranch,
      }),
    });

    if (!prRes.ok) {
      const errText = await prRes.text();
      console.warn(`[WARNING] PR creation returned (${prRes.status}): ${errText}`);
      return { workflowExists: false, prCreated: false };
    }

    const prData = await prRes.json();
    return { workflowExists: false, prCreated: true, prUrl: prData.html_url };
  }
}

/**
 * Resolves the runner repository token enforcing strict precedence:
 * 1. App-installation token (primary, dynamic RS256)
 * 2. Static PAT fallback (FIX11Y_RUNNER_TOKEN) if App is not installed on runner repo
 * 3. Target repo token (last resort)
 *
 * @param {Object} params
 * @param {GitHubAppService} params.appService
 * @param {string} params.runnerRepo e.g. "13Dav-arc/fix11y-runner"
 * @param {string|null} [params.staticRunnerToken]
 * @param {string} params.targetToken
 * @returns {Promise<string>}
 */
export async function resolveRunnerToken({ appService, runnerRepo, staticRunnerToken = null, targetToken }) {
  const [runnerOwner, runnerRepoName] = runnerRepo.split('/');
  let runnerToken = null;

  try {
    const runnerInstall = await appService.verifyInstallation(runnerOwner, runnerRepoName);
    if (runnerInstall.installed && runnerInstall.installationId) {
      runnerToken = await appService.getInstallationToken(runnerInstall.installationId);
    }
  } catch (err) {
    console.warn(`[WARNING] Could not obtain App token for runner repo ${runnerRepo}: ${err.message}`);
  }

  if (!runnerToken && staticRunnerToken) {
    runnerToken = staticRunnerToken;
  }

  if (!runnerToken) {
    runnerToken = targetToken;
  }

  return runnerToken;
}

