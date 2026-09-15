import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, evaluateRules } from '@fix11y/core';
import { createInitialAgentState, AgentState } from '../src/graph/types.js';
import { SqliteSaver } from '../src/graph/checkpointer.js';
import { atomicFileFixNode } from '../src/graph/nodes/atomic-file-fix.js';
import { routeAfterAtomicFix } from '../src/graph/edges/route-after-atomic-fix.js';
import { buildAgentWorkflow } from '../src/graph/graph.js';
import { SandboxManager } from '../src/sandbox/sandbox-manager.js';
import { SemanticFixOutput } from '../src/validation/semantic-schema.js';

function createMockSandboxManager(initialFiles: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(initialFiles));

  const mockSandbox: any = {
    process: {
      startAndWait: async (_opts: any) => ({ exitCode: 0, stdout: 'Build ok', stderr: '' }),
    },
    filesystem: {
      read: async (path: string) => {
        for (const [k, v] of files.entries()) {
          if (path === k || path.endsWith(k)) return v;
        }
        return '';
      },
      write: async (path: string, content: string) => {
        for (const k of files.keys()) {
          if (path === k || path.endsWith(k)) {
            files.set(k, content);
            return;
          }
        }
        files.set(path, content);
      },
    },
    close: async () => {},
  };

  const manager = new SandboxManager(async () => mockSandbox);
  return {
    manager,
    files,
  };
}

// ============================================================================
// 1. SqliteSaver Checkpointer Tests
// ============================================================================

test('SqliteSaver - saves, retrieves, and lists checkpoint tuples from SQLite', async () => {
  const saver = new SqliteSaver(':memory:');
  const threadId = 'test-session-101';

  const config = {
    configurable: {
      thread_id: threadId,
      checkpoint_id: 'chk-001',
    },
  };

  const checkpoint = {
    id: 'chk-001',
    ts: Date.now(),
    channel_values: {
      phase: 'atomic_file_fix',
      llmCallCount: 3,
    },
    channel_versions: {},
    versions_seen: {},
  };

  const metadata = {
    source: 'loop',
    step: 3,
  };

  // Put checkpoint
  await saver.put(config, checkpoint as any, metadata as any);

  // Retrieve checkpoint
  const retrieved = await saver.getTuple(config);
  assert.ok(retrieved);
  assert.equal(retrieved.checkpoint.id, 'chk-001');
  assert.equal((retrieved.checkpoint as any).channel_values.phase, 'atomic_file_fix');
  assert.equal((retrieved.checkpoint as any).channel_values.llmCallCount, 3);
  assert.equal(retrieved.metadata?.step, 3);

  // Retrieve latest checkpoint without checkpoint_id
  const latest = await saver.getTuple({ configurable: { thread_id: threadId } });
  assert.ok(latest);
  assert.equal(latest.checkpoint.id, 'chk-001');

  // List checkpoints
  const checkpoints: any[] = [];
  for await (const cp of saver.list({ configurable: { thread_id: threadId } })) {
    checkpoints.push(cp);
  }
  assert.equal(checkpoints.length, 1);

  saver.close();
});

// ============================================================================
// 2. Atomic Single-Step Node Tests
// ============================================================================

test('atomicFileFixNode - processes strictly one violation and re-audits in memory', async () => {
  const filePath = 'src/components/Navigation.html';
  const initialHtml = [
    '<nav>',
    '  <div onclick="openMenu()">Menu</div>',
    '  <div onclick="openCart()">Cart</div>',
    '</nav>',
  ].join('\n');

  const { manager, files } = createMockSandboxManager({ [filePath]: initialHtml });
  await manager.initialize({
    repoUrl: 'https://github.com/acme/store.git',
    githubToken: 'dummy',
  });

  const cst = parse(initialHtml);
  const initialDiags = evaluateRules(cst);
  assert.equal(initialDiags.length, 2);

  const state = createInitialAgentState({
    sandbox: manager,
    activeFilePath: filePath,
    fileDiagnostics: {
      [filePath]: initialDiags,
    },
    llmCallCount: 0,
    budgetCap: 10,
  });

  const mockModelInvoker = async (): Promise<SemanticFixOutput> => ({
    newTagName: 'button',
    attributesToAdd: { type: 'button' },
    wcagRationale: 'Replaced non-semantic clickable div with native button element.',
  });

  // Execute single atomic step
  const update = await atomicFileFixNode(state, { modelInvoker: mockModelInvoker });

  // 1. Exactly 1 LLM call counted
  assert.equal(update.llmCallCount, 1);

  // 2. Applied patches recorded
  assert.equal(update.appliedPatches?.length, 1);
  assert.equal(update.appliedPatches![0].filePath, filePath);

  // 3. Exactly 1 remaining violation for this file after in-memory re-audit
  const remaining = update.fileDiagnostics![filePath];
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].ruleId, 'button-semantics');
  assert.equal(remaining[0].node.tagName, 'div');

  // 4. File was written to sandbox with first fix applied
  const currentContent = files.get(filePath)!;
  assert.ok(currentContent.includes('<button onclick="openMenu()" type="button">Menu</button>'));
  assert.ok(currentContent.includes('<div onclick="openCart()">Cart</div>'));
});

test('atomicFileFixNode - quarantines violation if retry limit (>= 2) is exceeded', async () => {
  const filePath = 'src/Problematic.html';
  const html = '<div onclick="fail()">Retry Me</div>';

  const { manager } = createMockSandboxManager({ [filePath]: html });
  await manager.initialize({
    repoUrl: 'https://github.com/acme/store.git',
    githubToken: 'dummy',
  });

  const cst = parse(html);
  const diags = evaluateRules(cst);
  const violation = diags[0];

  const fingerprint = `${filePath}:${violation.node.startOffset}:${violation.ruleId}`;

  // State with 2 prior failed attempts on this specific violation
  const state = createInitialAgentState({
    sandbox: manager,
    activeFilePath: filePath,
    fileDiagnostics: {
      [filePath]: [violation],
    },
    attemptCounter: {
      [fingerprint]: 2,
    },
  });

  const update = await atomicFileFixNode(state);

  // Must quarantine the violation and remove it from active file diagnostics
  assert.equal(update.quarantinedIssues?.length, 1);
  assert.equal(update.quarantinedIssues![0].filePath, filePath);
  assert.equal(update.quarantinedIssues![0].reason, 'Exceeded max retry attempts (2)');
  assert.equal(update.fileDiagnostics![filePath].length, 0);
});

test('atomicFileFixNode - triggers circuit breaker when budget cap is reached', async () => {
  const filePath = 'src/Budget.html';
  const html = '<div onclick="action()">Action</div>';

  const { manager } = createMockSandboxManager({ [filePath]: html });
  const cst = parse(html);
  const diags = evaluateRules(cst);

  const state = createInitialAgentState({
    sandbox: manager,
    activeFilePath: filePath,
    fileDiagnostics: {
      [filePath]: diags,
    },
    llmCallCount: 5,
    budgetCap: 5, // Cap hit
  });

  const update = await atomicFileFixNode(state);

  assert.equal(update.budgetCapReached, true);
  assert.equal(update.activeFilePath, null);
  assert.equal(update.quarantinedIssues?.length, 1);
  assert.ok(update.quarantinedIssues![0].reason.includes('Budget cap reached'));
  assert.equal(update.phase, 'verify_build');
});

// ============================================================================
// 3. Conditional Edge Tests
// ============================================================================

test('routeAfterAtomicFix - routes correctly based on budget, remaining issues, and pending files', () => {
  // Case 1: Budget cap reached -> verify_build
  const stateBudget = createInitialAgentState({ budgetCapReached: true });
  assert.equal(routeAfterAtomicFix(stateBudget), 'verify_build');

  // Case 2: Active file has remaining violations -> atomic_file_fix
  const stateActive = createInitialAgentState({
    activeFilePath: 'index.html',
    fileDiagnostics: { 'index.html': [{ ruleId: 'img-alt' }] },
  });
  assert.equal(routeAfterAtomicFix(stateActive), 'atomic_file_fix');

  // Case 3: Active file clean, but pending files remain -> atomic_file_fix
  const statePending = createInitialAgentState({
    activeFilePath: 'index.html',
    fileDiagnostics: { 'index.html': [] },
    pendingFiles: ['about.html'],
  });
  assert.equal(routeAfterAtomicFix(statePending), 'atomic_file_fix');

  // Case 4: Everything clean -> verify_build
  const stateDone = createInitialAgentState({
    activeFilePath: null,
    pendingFiles: [],
    fileDiagnostics: {},
  });
  assert.equal(routeAfterAtomicFix(stateDone), 'verify_build');
});

// ============================================================================
// 4. End-to-End Workflow Execution & State Machine Tests
// ============================================================================

test('buildAgentWorkflow - executes autonomous remediation loop across multi-violation files with SQLite checkpoints', async () => {
  const fileA = 'templates/Header.html';
  const fileB = 'templates/Footer.html';

  const htmlA = '<div onclick="openHelp()">Help</div>';
  const htmlB = '<div onclick="openContact()">Contact</div>';

  const { manager, files } = createMockSandboxManager({
    [fileA]: htmlA,
    [fileB]: htmlB,
  });

  await manager.initialize({
    repoUrl: 'https://github.com/acme/accessible-portal.git',
    githubToken: 'test-token',
  });

  const checkpointer = new SqliteSaver(':memory:');

  const mockModelInvoker = async (
    _prompt: string,
    context: { targetSnippet: string; ruleId: string }
  ): Promise<SemanticFixOutput> => {
    return {
      newTagName: 'button',
      attributesToAdd: { type: 'button' },
      wcagRationale: `Fixed ${context.ruleId} by converting clickable div to semantic button.`,
    };
  };

  const workflow = buildAgentWorkflow({
    checkpointer,
    modelInvoker: mockModelInvoker,
    initialFiles: {
      [fileA]: htmlA,
      [fileB]: htmlB,
    },
    prCreator: async (title) => `https://github.com/acme/accessible-portal/pull/42 (${title})`,
  });

  const threadId = 'autonomous-run-session-001';
  const initialState = createInitialAgentState({
    repoUrl: 'https://github.com/acme/accessible-portal.git',
    sandbox: manager,
    budgetCap: 10,
  });

  // Run the full LangGraph workflow
  const finalState = await workflow.invoke(initialState, {
    configurable: {
      thread_id: threadId,
    },
  });

  // 1. Verify workflow completed successfully
  assert.equal(finalState.phase, 'complete');
  assert.equal(finalState.verificationPassed, true);
  assert.ok(finalState.prUrl?.includes('pull/42'));

  // 2. Both files remediated
  assert.equal(finalState.appliedPatches.length, 2);
  assert.ok(files.get(fileA)!.includes('<button onclick="openHelp()" type="button">Help</button>'));
  assert.ok(files.get(fileB)!.includes('<button onclick="openContact()" type="button">Contact</button>'));

  // 3. Verify SQLite checkpointer recorded checkpoints for threadId
  const checkpoints: any[] = [];
  for await (const cp of checkpointer.list({ configurable: { thread_id: threadId } })) {
    checkpoints.push(cp);
  }

  // Multiple node transitions occurred (init_sandbox, initial_audit, atomic_file_fix x2, verify_build, open_pr)
  assert.ok(checkpoints.length >= 4, `Expected at least 4 checkpoints, got ${checkpoints.length}`);

  checkpointer.close();
});
