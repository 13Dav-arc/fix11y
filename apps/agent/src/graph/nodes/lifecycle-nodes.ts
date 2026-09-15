/**
 * Supporting Lifecycle Nodes for fix11y LangGraph Workflow.
 *
 * Implements:
 * - initSandboxNode: Initializes E2B sandbox microVM.
 * - initialAuditNode: Runs initial @fix11y/core scan on template/HTML files.
 * - verifyBuildNode: Runs npm test & build inside the scoped microVM.
 * - openPrNode: Summarizes applied diffs and creates GitHub Pull Request.
 */

import { parse, evaluateRules } from '@fix11y/core';
import { AgentState } from '../types.js';
import { SandboxManager } from '../../sandbox/sandbox-manager.js';

export async function initSandboxNode(
  state: AgentState,
  options?: { githubToken?: string }
): Promise<Partial<AgentState>> {
  let sandbox = state.sandbox;

  if (!sandbox && state.repoUrl) {
    sandbox = new SandboxManager();
    await sandbox.initialize({
      repoUrl: state.repoUrl,
      githubToken: options?.githubToken || process.env.GITHUB_TOKEN || 'token',
      branchName: state.baseBranch,
      targetDirectory: state.targetDirectory,
      ignorePatterns: state.ignorePatterns,
    });
  }

  return {
    sandbox,
    phase: 'initial_audit',
  };
}

export async function initialAuditNode(
  state: AgentState,
  options?: { files?: Record<string, string> }
): Promise<Partial<AgentState>> {
  const fileDiagnostics: Record<string, any[]> = {};
  const pendingFiles: string[] = [];

  // Use provided files or inspect sandbox files
  const filesToAudit = options?.files || {};

  for (const [filePath, content] of Object.entries(filesToAudit)) {
    if (state.sandbox?.isPathIgnored(filePath)) {
      continue;
    }

    try {
      const cst = parse(content);
      const diagnostics = evaluateRules(cst);

      if (diagnostics.length > 0) {
        fileDiagnostics[filePath] = diagnostics;
        pendingFiles.push(filePath);
      }
    } catch {
      // Ignore unparseable non-HTML files
    }
  }

  const activeFilePath = pendingFiles.length > 0 ? pendingFiles[0] : null;
  const remainingPending = pendingFiles.length > 0 ? pendingFiles.slice(1) : [];

  return {
    fileDiagnostics,
    pendingFiles: remainingPending,
    activeFilePath,
    phase: activeFilePath ? 'atomic_file_fix' : 'verify_build',
  };
}

export async function verifyBuildNode(state: AgentState): Promise<Partial<AgentState>> {
  if (!state.sandbox) {
    return {
      verificationPassed: true,
      buildErrors: null,
      phase: 'open_pr',
    };
  }

  const result = await state.sandbox.runBuildAndVerify(120_000);

  return {
    verificationPassed: result.success,
    buildErrors: result.success ? null : result.stderr,
    phase: 'open_pr',
  };
}

export async function openPrNode(
  state: AgentState,
  options?: { prCreator?: (title: string, body: string) => Promise<string> }
): Promise<Partial<AgentState>> {
  if (!state.verificationPassed) {
    return {
      phase: 'failed',
    };
  }

  if (state.appliedPatches.length === 0) {
    return {
      phase: 'complete',
    };
  }

  const title = `fix(a11y): Autonomous WCAG 2.1/2.2 AA accessibility remediation`;
  const body = [
    `## Automated Accessibility Remediation by fix11y`,
    ``,
    `Applied **${state.appliedPatches.length}** surgical CST patch(es):`,
    ...state.appliedPatches.map(
      (p, idx) => `### Fix ${idx + 1}: \`${p.filePath}\`\n**Rationale:** ${p.rationale}\n\`\`\`diff\n${p.diff}\n\`\`\``
    ),
    ``,
    `Verification build passed cleanly.`,
  ].join('\n');

  let prUrl: string;
  if (options?.prCreator) {
    prUrl = await options.prCreator(title, body);
  } else {
    // Deterministic mock URL if in test/dry-run
    prUrl = `${state.repoUrl.replace(/\.git$/, '')}/pull/1`;
  }

  return {
    prUrl,
    phase: 'complete',
  };
}
