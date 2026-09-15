/**
 * Comprehensive End-to-End Integration Test Suite for fix11y.
 *
 * Validates the full remediation pipeline across all invariants:
 * - Webhook ingestion and HMAC verification contract
 * - Monorepo pathing and disk-backed sandbox isolation (Invariant 8)
 * - Atomic single-step LangGraph orchestration with durable SQLite checkpoints (Invariant 7)
 * - Surgical CST patching with 100% preservation of untouched code (Invariants 2, 3, 6)
 * - Dynamic in-memory re-auditing eliminating offset drift (Invariant 7)
 * - Retry limiting and issue quarantining logic
 * - Budget cap circuit breaker
 * - Sandbox build verification failure handling
 * - Accessible PR generation with TL;DR and collapsible diffs
 * - Studio state rehydration retrieval interface
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { parse, evaluateRules } from '@fix11y/core';

import { buildAgentWorkflow } from '../src/graph/graph.js';
import { createInitialAgentState, AgentState } from '../src/graph/types.js';
import { SqliteSaver } from '../src/graph/checkpointer.js';
import { handleGitHubWebhook } from '../src/webhook/github-webhook-route.js';
import { generateAccessiblePrBody } from '../src/github/pr-template.js';

import {
  createEphemeralWorkspace,
  seedWorkspaceFixtures,
  FIXTURES,
  EphemeralWorkspace,
} from './harness/ephemeral-env.js';
import { LocalTestSandbox } from './harness/local-test-sandbox.js';
import { ProgrammableModel } from './harness/programmable-model.js';

// ============================================================================
// E2E Test Suite
// ============================================================================

test('E2E Integration - Scenario 1: Golden Pipeline (Webhook to Surgical PR to State Rehydration)', async () => {
  const env: EphemeralWorkspace = createEphemeralWorkspace('e2e-golden-');
  const threadId = `e2e-golden-${Date.now()}`;

  try {
    // 1. Webhook Contract Ingestion
    const secret = 'e2e-test-webhook-secret';
    const payload = {
      after: '9f8e7d6c5b4a32109876543210abcdef01234567',
      ref: 'refs/heads/main',
      repository: {
        name: 'storefront',
        full_name: 'acme/storefront',
        clone_url: 'https://github.com/acme/storefront.git',
        default_branch: 'main',
      },
      head_commit: {
        id: '9f8e7d6c5b4a32109876543210abcdef01234567',
      },
    };
    const bodyStr = JSON.stringify(payload);
    const signature = 'sha256=' + createHmac('sha256', secret).update(bodyStr).digest('hex');

    const enqueuedJobs: any[] = [];
    const mockQueue: any = {
      add: async (name: string, data: any, opts: any) => {
        enqueuedJobs.push({ name, data, opts });
        return { id: opts.jobId };
      },
    };

    const webhookRes = await handleGitHubWebhook(
      bodyStr,
      {
        signature,
        event: 'push',
        delivery: 'delivery-golden-1',
      },
      mockQueue,
      secret
    );

    assert.equal(webhookRes.status, 202);
    assert.equal(enqueuedJobs.length, 1);
    assert.equal(enqueuedJobs[0].data.repoFullName, 'acme/storefront');
    assert.equal(enqueuedJobs[0].data.commitSha, '9f8e7d6c5b4a32109876543210abcdef01234567');

    // 2. Setup Local Disk Sandbox & Fixtures
    seedWorkspaceFixtures(
      env.workspaceDir,
      {
        'index.html': FIXTURES.MESSY_TEMPLATE,
      },
      'src'
    );

    const sandbox = new LocalTestSandbox({ workspaceDir: env.workspaceDir });
    await sandbox.initialize({
      repoUrl: 'https://github.com/acme/storefront.git',
      githubToken: 'mock-token',
      targetDirectory: 'src',
    });

    const model = new ProgrammableModel();
    const saver = new SqliteSaver(env.dbPath);

    // Track PR Creator calls
    let createdPrTitle = '';
    let createdPrBody = '';
    const prCreator = async (title: string, body: string) => {
      createdPrTitle = title;
      createdPrBody = body;
      return 'https://github.com/acme/storefront/pull/42';
    };

    // 3. Build & Compile LangGraph State Machine
    const workflow = buildAgentWorkflow({
      checkpointer: saver,
      modelInvoker: model.invoker,
      initialFiles: {
        'index.html': FIXTURES.MESSY_TEMPLATE,
      },
      prCreator,
    });

    // 4. Execute Autonomous Remediation Loop
    const initialState = createInitialAgentState({
      repoUrl: 'https://github.com/acme/storefront.git',
      targetDirectory: 'src',
      sandbox,
      budgetCap: 10,
    });

    const result = await workflow.invoke(initialState, {
      configurable: {
        thread_id: threadId,
      },
    });

    // 5. Assertions on Terminal Graph State
    assert.equal(result.phase, 'complete');
    assert.equal(result.verificationPassed, true);
    assert.equal(result.budgetCapReached, false);
    assert.equal(result.prUrl, 'https://github.com/acme/storefront/pull/42');
    assert.equal(result.appliedPatches.length, 3);
    assert.equal(result.quarantinedIssues.length, 0);

    // 6. Real Disk Verification: Surgical CST Preservation (Invariants 2, 3, 6)
    const diskContent = await sandbox.readFile('index.html');

    // Check that surgical remediations exist
    assert.match(diskContent, /<button class="menu-cta" onclick="toggleMenu\(\)" type="button">/);
    assert.match(diskContent, /<button class="checkout-cta" onclick="handleCheckout\(\)" type="button">/);
    assert.match(diskContent, /aria-label="Subscribe to email newsletter"/);

    // Verify 100% preservation of untouched template directives & comments
    assert.match(diskContent, /{{#if user\.isLoggedIn}}/);
    assert.match(diskContent, /Welcome back, {{user\.name}}!/);
    assert.match(diskContent, /<!-- Header Landmark -->/);
    assert.match(diskContent, /<!-- Main Content Area -->/);

    // Re-audit patched file from disk: must have 0 violations
    const finalCst = parse(diskContent);
    const finalDiagnostics = evaluateRules(finalCst);
    assert.equal(finalDiagnostics.length, 0, 'Surgically remediated file must be 100% WCAG compliant');

    // 7. Checkpoint Granularity Verification (Invariant 7)
    const checkpoints: any[] = [];
    for await (const cp of saver.list({ configurable: { thread_id: threadId } })) {
      checkpoints.push(cp);
    }
    // Expected transitions: init_sandbox -> initial_audit -> atomic_file_fix (x3) -> verify_build -> open_pr
    assert.ok(
      checkpoints.length >= 5,
      `Expected at least 5 discrete checkpoints, found ${checkpoints.length}`
    );

    // 8. State Rehydration Interface Verification
    const latestTuple = await saver.getTuple({ configurable: { thread_id: threadId } });
    assert.ok(latestTuple);
    const channelValues = (latestTuple.checkpoint as any).channel_values;
    assert.equal(channelValues.phase, 'complete');
    assert.equal(channelValues.verificationPassed, true);
    assert.equal(channelValues.appliedPatches.length, 3);
    assert.equal(channelValues.prUrl, 'https://github.com/acme/storefront/pull/42');

    // 9. PR Generator Formatting Verification
    assert.match(createdPrTitle, /fix\(a11y\):/);
    assert.ok(createdPrBody.includes('Applied **3** surgical CST patch(es)'));
    assert.ok(createdPrBody.includes('Verification build passed cleanly.'));

    saver.close();
  } finally {
    env.cleanup();
  }
});

test('E2E Integration - Scenario 2: Multi-Violation Sequential Fixing & Zero Offset Drift', async () => {
  const env: EphemeralWorkspace = createEphemeralWorkspace('e2e-drift-');
  const threadId = `e2e-drift-${Date.now()}`;

  try {
    seedWorkspaceFixtures(
      env.workspaceDir,
      {
        'template.html': FIXTURES.MESSY_TEMPLATE,
      },
      'src'
    );

    const sandbox = new LocalTestSandbox({ workspaceDir: env.workspaceDir });
    await sandbox.initialize({
      repoUrl: 'https://github.com/acme/storefront.git',
      githubToken: 'mock-token',
      targetDirectory: 'src',
    });

    const model = new ProgrammableModel();
    const saver = new SqliteSaver(env.dbPath);

    const workflow = buildAgentWorkflow({
      checkpointer: saver,
      modelInvoker: model.invoker,
      initialFiles: {
        'template.html': FIXTURES.MESSY_TEMPLATE,
      },
    });

    const initialState = createInitialAgentState({
      repoUrl: 'https://github.com/acme/storefront.git',
      targetDirectory: 'src',
      sandbox,
    });

    const result = await workflow.invoke(initialState, {
      configurable: {
        thread_id: threadId,
      },
    });

    assert.equal(result.phase, 'complete');
    assert.equal(result.appliedPatches.length, 3);

    // Assert that exactly 3 distinct model invocations occurred
    assert.equal(model.callCount, 3);

    // Verify sequential diffs on disk did not corrupt offsets
    const finalDiskContent = await sandbox.readFile('template.html');
    const finalDiagnostics = evaluateRules(parse(finalDiskContent));
    assert.equal(finalDiagnostics.length, 0);

    saver.close();
  } finally {
    env.cleanup();
  }
});

test('E2E Integration - Scenario 3: Retry Limit and Issue Quarantining Invariant', async () => {
  const env: EphemeralWorkspace = createEphemeralWorkspace('e2e-quarantine-');
  const threadId = `e2e-quarantine-${Date.now()}`;

  try {
    const unlabelledInputHtml = '<form id="contact-form"><input type="text" id="unlabelled-input"></form>';

    seedWorkspaceFixtures(
      env.workspaceDir,
      {
        'form.html': unlabelledInputHtml,
      },
      'src'
    );

    const sandbox = new LocalTestSandbox({ workspaceDir: env.workspaceDir });
    await sandbox.initialize({
      repoUrl: 'https://github.com/acme/storefront.git',
      githubToken: 'mock-token',
      targetDirectory: 'src',
    });

    // Configure model to repeatedly return an ineffective fix for form-label
    // Adding type="text" does not resolve the missing label/aria-label violation!
    const model = new ProgrammableModel();
    model.failRule('form-label', 3, {
      newTagName: 'input',
      attributesToAdd: { type: 'text' },
      wcagRationale: 'Ineffective fix leaving input without accessible label',
    });

    const saver = new SqliteSaver(env.dbPath);

    const workflow = buildAgentWorkflow({
      checkpointer: saver,
      modelInvoker: model.invoker,
      initialFiles: {
        'form.html': unlabelledInputHtml,
      },
    });

    const initialState = createInitialAgentState({
      repoUrl: 'https://github.com/acme/storefront.git',
      targetDirectory: 'src',
      sandbox,
    });

    const result = await workflow.invoke(initialState, {
      configurable: {
        thread_id: threadId,
      },
    });

    // The workflow must gracefully advance and quarantine the stubborn issue
    assert.equal(result.phase, 'complete');
    assert.equal(result.quarantinedIssues.length, 1);
    assert.equal(result.quarantinedIssues[0].filePath, 'form.html');
    assert.equal(result.quarantinedIssues[0].reason, 'Exceeded max retry attempts (2)');

    // Model was attempted up to retry limit
    assert.ok(model.callCount >= 2);

    // Verify PR body contains quarantined issue alert
    const prBody = generateAccessiblePrBody({
      repoFullName: 'acme/storefront',
      appliedPatches: result.appliedPatches,
      quarantinedCount: result.quarantinedIssues.length,
      budgetCapReached: result.budgetCapReached,
      verificationPassed: result.verificationPassed,
    });
    assert.match(prBody, /Quarantined Issues/);
    assert.match(prBody, /1 issue/);

    saver.close();
  } finally {
    env.cleanup();
  }
});

test('E2E Integration - Scenario 4: Circuit Breaker and Budget Capping', async () => {
  const env: EphemeralWorkspace = createEphemeralWorkspace('e2e-budget-');
  const threadId = `e2e-budget-${Date.now()}`;

  try {
    seedWorkspaceFixtures(
      env.workspaceDir,
      {
        'budget.html': FIXTURES.MULTI_ISSUE_BUDGET,
      },
      'src'
    );

    const sandbox = new LocalTestSandbox({ workspaceDir: env.workspaceDir });
    await sandbox.initialize({
      repoUrl: 'https://github.com/acme/storefront.git',
      githubToken: 'mock-token',
      targetDirectory: 'src',
    });

    const model = new ProgrammableModel();
    const saver = new SqliteSaver(env.dbPath);

    const workflow = buildAgentWorkflow({
      checkpointer: saver,
      modelInvoker: model.invoker,
      initialFiles: {
        'budget.html': FIXTURES.MULTI_ISSUE_BUDGET,
      },
    });

    // Enforce strict budget of 2 LLM calls on a 4-violation file
    const initialState = createInitialAgentState({
      repoUrl: 'https://github.com/acme/storefront.git',
      targetDirectory: 'src',
      sandbox,
      budgetCap: 2,
    });

    const result = await workflow.invoke(initialState, {
      configurable: {
        thread_id: threadId,
      },
    });

    // Circuit breaker must fire
    assert.equal(result.budgetCapReached, true);
    assert.equal(result.llmCallCount, 2);
    assert.equal(model.callCount, 2);

    // Remaining un-remediated violations must be quarantined with circuit breaker reason
    assert.ok(result.quarantinedIssues.length >= 1);
    assert.ok(
      result.quarantinedIssues.some((q: any) =>
        q.reason.includes('Circuit breaker triggered: Budget cap reached')
      )
    );

    // PR body must include budget cap banner
    const prBody = generateAccessiblePrBody({
      repoFullName: 'acme/storefront',
      appliedPatches: result.appliedPatches,
      quarantinedCount: result.quarantinedIssues.length,
      budgetCapReached: result.budgetCapReached,
      budgetCap: 2,
      verificationPassed: result.verificationPassed,
    });
    assert.match(prBody, /Circuit Breaker Notice/);
    assert.match(prBody, /Budget Cap Reached/);

    saver.close();
  } finally {
    env.cleanup();
  }
});

test('E2E Integration - Scenario 5: Sandbox Build Verification Failure Handling', async () => {
  const env: EphemeralWorkspace = createEphemeralWorkspace('e2e-build-fail-');
  const threadId = `e2e-build-fail-${Date.now()}`;

  try {
    seedWorkspaceFixtures(
      env.workspaceDir,
      {
        'index.html': FIXTURES.SINGLE_ISSUE,
      },
      'src'
    );

    // Configure sandbox to simulate a failing build
    const sandbox = new LocalTestSandbox({
      workspaceDir: env.workspaceDir,
      simulateBuildFailure: true,
      buildFailureMessage: 'TypeScript build error: syntax error in index.html',
    });
    await sandbox.initialize({
      repoUrl: 'https://github.com/acme/storefront.git',
      githubToken: 'mock-token',
      targetDirectory: 'src',
    });

    const model = new ProgrammableModel();
    const saver = new SqliteSaver(env.dbPath);

    let prCreatorCalled = false;
    const prCreator = async () => {
      prCreatorCalled = true;
      return 'https://github.com/acme/storefront/pull/1';
    };

    const workflow = buildAgentWorkflow({
      checkpointer: saver,
      modelInvoker: model.invoker,
      initialFiles: {
        'index.html': FIXTURES.SINGLE_ISSUE,
      },
      prCreator,
    });

    const initialState = createInitialAgentState({
      repoUrl: 'https://github.com/acme/storefront.git',
      targetDirectory: 'src',
      sandbox,
    });

    const result = await workflow.invoke(initialState, {
      configurable: {
        thread_id: threadId,
      },
    });

    // Verification must fail and workflow enters terminal 'failed' state
    assert.equal(result.verificationPassed, false);
    assert.match(result.buildErrors, /TypeScript build error/);
    assert.equal(result.phase, 'failed');

    // PR must NOT be opened when build fails
    assert.equal(prCreatorCalled, false);
    assert.equal(result.prUrl, null);

    saver.close();
  } finally {
    env.cleanup();
  }
});

test('E2E Integration - Scenario 6: Monorepo Target Directory Scoping', async () => {
  const env: EphemeralWorkspace = createEphemeralWorkspace('e2e-monorepo-');
  const threadId = `e2e-monorepo-${Date.now()}`;

  try {
    // Seed files in targetDirectory and outside targetDirectory
    seedWorkspaceFixtures(
      env.workspaceDir,
      {
        'card.html': FIXTURES.SINGLE_ISSUE,
      },
      'apps/storefront/src'
    );

    // Root file outside targetDirectory
    const rootUnscopedFile = path.join(env.workspaceDir, 'root-ignore.html');
    fs.writeFileSync(rootUnscopedFile, FIXTURES.SINGLE_ISSUE, 'utf8');

    const sandbox = new LocalTestSandbox({ workspaceDir: env.workspaceDir });
    await sandbox.initialize({
      repoUrl: 'https://github.com/acme/monorepo.git',
      githubToken: 'mock-token',
      targetDirectory: 'apps/storefront/src',
    });

    const model = new ProgrammableModel();
    const saver = new SqliteSaver(env.dbPath);

    const workflow = buildAgentWorkflow({
      checkpointer: saver,
      modelInvoker: model.invoker,
      initialFiles: {
        'card.html': FIXTURES.SINGLE_ISSUE,
      },
    });

    const initialState = createInitialAgentState({
      repoUrl: 'https://github.com/acme/monorepo.git',
      targetDirectory: 'apps/storefront/src',
      sandbox,
    });

    const result = await workflow.invoke(initialState, {
      configurable: {
        thread_id: threadId,
      },
    });

    assert.equal(result.phase, 'complete');

    // Scoped file inside targetDirectory was remediated
    const scopedContent = await sandbox.readFile('card.html');
    assert.match(scopedContent, /<button class="hero-action" onclick="claimOffer\(\)" type="button">/);

    // Unscoped root file remained completely untouched
    const rootContent = fs.readFileSync(rootUnscopedFile, 'utf8');
    assert.equal(rootContent, FIXTURES.SINGLE_ISSUE);

    saver.close();
  } finally {
    env.cleanup();
  }
});
