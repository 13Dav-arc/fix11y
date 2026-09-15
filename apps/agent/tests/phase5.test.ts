import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAccessiblePrBody,
  PrRemediationSummary,
} from '../src/github/pr-template.js';
import {
  openOrUpdateRemediationPr,
  DEFAULT_REMEDIATION_BRANCH,
} from '../src/github/pr-manager.js';
import { GitHubAppClient } from '../src/github/github-app-client.js';

// ============================================================================
// 1. Accessible PR Template Tests
// ============================================================================

test('generateAccessiblePrBody - produces WCAG-compliant Markdown with TL;DR table and collapsible diffs', () => {
  const summary: PrRemediationSummary = {
    repoFullName: 'acme-corp/accessible-storefront',
    baseBranch: 'main',
    branchName: 'fix11y/auto-remediation',
    appliedPatches: [
      {
        filePath: 'src/components/Navigation.html',
        ruleId: 'button-semantics',
        rationale: 'Converted clickable div with onclick to native <button type="button"> for keyboard operability.',
        diff: '--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n-<div onclick="menu()">Menu</div>\n+<button onclick="menu()" type="button">Menu</button>',
      },
      {
        filePath: 'src/components/Footer.html',
        ruleId: 'img-alt',
        rationale: 'Injected contextual alt="" attribute to decorative footer logo.',
        diff: '--- a/file\n+++ b/file\n@@ -1,1 +1,1 @@\n-<img src="logo.png">\n+<img src="logo.png" alt="">',
      },
    ],
    quarantinedCount: 0,
    budgetCapReached: false,
    verificationPassed: true,
  };

  const body = generateAccessiblePrBody(summary);

  // 1. Starts with TL;DR Summary Table
  assert.ok(body.includes('## 📋 Summary (TL;DR)'));
  assert.ok(body.includes('| **Files Remediated** | **2** files |'));
  assert.ok(body.includes('| **WCAG Fixes Applied** | **2** surgical patches |'));
  assert.ok(body.includes('| **Sandbox Build Verification** | ✅ Passed |'));

  // 2. Strict Heading Hierarchy (## -> ### without skips)
  assert.ok(body.includes('## 🛠️ Remediations Applied'));
  assert.ok(body.includes('### 1. `src/components/Navigation.html` (`button-semantics`)'));
  assert.ok(body.includes('### 2. `src/components/Footer.html` (`img-alt`)'));
  assert.ok(body.includes('## 🛡️ WCAG Criteria Satisfied'));

  // 3. Collapsible Diffs with <details> and <summary>
  assert.ok(body.includes('<details>'));
  assert.ok(body.includes('<summary><code>src/components/Navigation.html</code> — View Surgical Unified Diff</summary>'));
  assert.ok(body.includes('<pre><code class="language-diff">'));

  // 4. No circuit breaker banner when budgetCapReached is false
  assert.ok(!body.includes('Circuit Breaker Notice'));
});

test('generateAccessiblePrBody - appends prominent warning banner when budgetCapReached is true', () => {
  const summary: PrRemediationSummary = {
    repoFullName: 'acme-corp/accessible-storefront',
    appliedPatches: [
      {
        filePath: 'src/App.html',
        rationale: 'Converted div to button.',
        diff: '+<button>Click</button>',
      },
    ],
    quarantinedCount: 3,
    budgetCapReached: true,
    budgetCap: 50,
  };

  const body = generateAccessiblePrBody(summary);

  // Must contain circuit breaker warning notice
  assert.ok(body.includes('## ⚠️ Circuit Breaker Notice'));
  assert.ok(body.includes('> **Budget Cap Reached:**'));
  assert.ok(body.includes('50 LLM calls'));
  assert.ok(body.includes('remaining violations were safely quarantined'));
});

// ============================================================================
// 2. PR Idempotency Manager Tests
// ============================================================================

test('openOrUpdateRemediationPr - creates new PR when none exists', async () => {
  let createdPayload: any = null;
  let pushed = false;

  const mockOctokit: any = {
    rest: {
      pulls: {
        list: async (params: any) => {
          assert.equal(params.owner, 'acme');
          assert.equal(params.repo, 'web');
          assert.equal(params.head, `acme:${DEFAULT_REMEDIATION_BRANCH}`);
          return { data: [] }; // No existing open PR
        },
        create: async (params: any) => {
          createdPayload = params;
          return {
            data: {
              number: 42,
              html_url: 'https://github.com/acme/web/pull/42',
            },
          };
        },
        update: async () => {
          throw new Error('Update should not be called when no PR exists');
        },
      },
    },
  };

  const summary: PrRemediationSummary = {
    repoFullName: 'acme/web',
    appliedPatches: [
      {
        filePath: 'index.html',
        diff: '+<button>Submit</button>',
        rationale: 'Fix keyboard operability.',
      },
    ],
  };

  const result = await openOrUpdateRemediationPr({
    octokit: mockOctokit,
    repoFullName: 'acme/web',
    baseBranch: 'main',
    summary,
    pushBranch: async () => {
      pushed = true;
    },
  });

  assert.equal(pushed, true, 'Expected pushBranch callback to be executed');
  assert.equal(result.isUpdate, false);
  assert.equal(result.prNumber, 42);
  assert.equal(result.prUrl, 'https://github.com/acme/web/pull/42');
  assert.equal(createdPayload.head, DEFAULT_REMEDIATION_BRANCH);
  assert.equal(createdPayload.base, 'main');
  assert.ok(createdPayload.title.includes('fix(a11y)'));
});

test('openOrUpdateRemediationPr - updates existing open PR idempotently', async () => {
  let updatedPayload: any = null;

  const mockOctokit: any = {
    rest: {
      pulls: {
        list: async () => {
          // Existing open PR found!
          return {
            data: [
              {
                number: 99,
                html_url: 'https://github.com/acme/web/pull/99',
              },
            ],
          };
        },
        create: async () => {
          throw new Error('Create should not be called when open PR already exists');
        },
        update: async (params: any) => {
          updatedPayload = params;
          return {
            data: {
              number: 99,
              html_url: 'https://github.com/acme/web/pull/99',
            },
          };
        },
      },
    },
  };

  const summary: PrRemediationSummary = {
    repoFullName: 'acme/web',
    appliedPatches: [
      {
        filePath: 'index.html',
        diff: '+<button>Updated</button>',
        rationale: 'Updated accessibility remediation.',
      },
    ],
  };

  const result = await openOrUpdateRemediationPr({
    octokit: mockOctokit,
    repoFullName: 'acme/web',
    summary,
  });

  assert.equal(result.isUpdate, true);
  assert.equal(result.prNumber, 99);
  assert.equal(result.prUrl, 'https://github.com/acme/web/pull/99');
  assert.equal(updatedPayload.pull_number, 99);
  assert.ok(updatedPayload.body.includes('## 📋 Summary (TL;DR)'));
});

// ============================================================================
// 3. GitHub App Client Tests
// ============================================================================

test('GitHubAppClient - normalizes PEM private key and validates missing credentials', async () => {
  const client = new GitHubAppClient({
    appId: '123456',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\\nMIIEowIBAAKCAQEA...\\n-----END RSA PRIVATE KEY-----',
    installationId: 78910,
  });

  assert.equal(client.appId, '123456');
  assert.ok(client.privateKey.includes('\n'), 'Expected \\n escape sequences to be normalized to real newlines');
  assert.equal(client.installationId, 78910);

  // Client without installation ID should throw descriptive error
  const emptyClient = new GitHubAppClient({});
  await assert.rejects(
    async () => {
      await emptyClient.getInstallationToken();
    },
    (err: Error) => {
      assert.ok(err.message.includes('Missing installationId'));
      return true;
    }
  );
});
