/**
 * Pull Request Idempotency Manager.
 *
 * Manages deterministic PR lifecycles:
 * - Deterministic branch: fix11y/auto-remediation
 * - Queries for active open PRs matching the head branch before creating new ones.
 * - Idempotently updates the existing PR title and accessible body if one already exists.
 * - Creates a new PR only when none is currently open.
 */

import { Octokit } from '@octokit/rest';
import {
  generateAccessiblePrBody,
  PrRemediationSummary,
} from './pr-template.js';

export const DEFAULT_REMEDIATION_BRANCH = 'fix11y/auto-remediation';

export interface OpenOrUpdatePrOptions {
  octokit: Octokit;
  repoFullName: string;
  baseBranch?: string;
  branchName?: string;
  summary: PrRemediationSummary;
  pushBranch?: () => Promise<void>;
}

export interface PrResult {
  prNumber: number;
  prUrl: string;
  isUpdate: boolean;
  title: string;
  body: string;
}

/**
 * Idempotently opens or updates a Pull Request with the latest surgical remediations.
 */
export async function openOrUpdateRemediationPr(
  options: OpenOrUpdatePrOptions
): Promise<PrResult> {
  const parts = options.repoFullName.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid repoFullName: "${options.repoFullName}". Expected "owner/repo" format.`);
  }
  const [owner, repo] = parts;

  const base = options.baseBranch || 'main';
  const branchName = options.branchName || DEFAULT_REMEDIATION_BRANCH;

  // 1. Push branch to origin if a git push callback is provided
  if (options.pushBranch) {
    await options.pushBranch();
  }

  // 2. Generate accessible PR title and body
  const patchCount = options.summary.appliedPatches.length;
  const title = `fix(a11y): Autonomous WCAG AA remediation (${patchCount} fix${patchCount === 1 ? '' : 'es'})`;
  const body = generateAccessiblePrBody({
    ...options.summary,
    repoFullName: options.repoFullName,
    baseBranch: base,
    branchName,
  });

  // 3. Query existing open PRs
  const existingPrs = await options.octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${branchName}`,
    base,
  });

  if (existingPrs.data && existingPrs.data.length > 0) {
    // 4a. Update existing PR
    const existing = existingPrs.data[0];
    const updateResponse = await options.octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: existing.number,
      title,
      body,
    });

    return {
      prNumber: existing.number,
      prUrl: updateResponse.data.html_url,
      isUpdate: true,
      title,
      body,
    };
  } else {
    // 4b. Create brand new PR
    const createResponse = await options.octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head: branchName,
      base,
    });

    return {
      prNumber: createResponse.data.number,
      prUrl: createResponse.data.html_url,
      isUpdate: false,
      title,
      body,
    };
  }
}
