/**
 * LangGraph Workflow & State Machine Builder.
 *
 * Implements:
 * - StateGraph<AgentState> registration with channel definitions.
 * - Nodes: init_sandbox, initial_audit, atomic_file_fix, verify_build, open_pr.
 * - Dynamic loop routing via routeAfterAtomicFix.
 * - Durable SQLite checkpointing at every node boundary via SqliteSaver.
 */

import { StateGraph, START, END, BaseCheckpointSaver } from '@langchain/langgraph';
import { AgentState } from './types.js';
import { SqliteSaver } from './checkpointer.js';
import { atomicFileFixNode, ModelInvoker } from './nodes/atomic-file-fix.js';
import {
  initSandboxNode,
  initialAuditNode,
  verifyBuildNode,
  openPrNode,
} from './nodes/lifecycle-nodes.js';
import { routeAfterAtomicFix } from './edges/route-after-atomic-fix.js';

export interface BuildWorkflowOptions {
  checkpointer?: BaseCheckpointSaver;
  dbPath?: string;
  modelInvoker?: ModelInvoker;
  githubToken?: string;
  initialFiles?: Record<string, string>;
  prCreator?: (title: string, body: string) => Promise<string>;
}

export function buildAgentWorkflow(options: BuildWorkflowOptions = {}) {
  // Channel definitions: null indicates standard replacement channel
  const channels = {
    repoUrl: null,
    targetDirectory: null,
    ignorePatterns: null,
    branchName: null,
    baseBranch: null,
    existingPrNumber: null,
    workspaceDir: null,
    sandbox: null,
    pendingFiles: null,
    activeFilePath: null,
    fileDiagnostics: null,
    attemptCounter: null,
    quarantinedIssues: null,
    appliedPatches: null,
    budgetCap: null,
    llmCallCount: null,
    budgetCapReached: null,
    verificationPassed: null,
    buildErrors: null,
    prUrl: null,
    phase: null,
  };

  const workflow = new StateGraph<AgentState, any, any>({
    channels: channels as any,
  });

  // 1. Register Nodes
  workflow.addNode('init_sandbox', async (state) => {
    return await initSandboxNode(state, { githubToken: options.githubToken });
  });

  workflow.addNode('initial_audit', async (state) => {
    return await initialAuditNode(state, { files: options.initialFiles });
  });

  workflow.addNode('atomic_file_fix', async (state) => {
    return await atomicFileFixNode(state, { modelInvoker: options.modelInvoker });
  });

  workflow.addNode('verify_build', async (state) => {
    return await verifyBuildNode(state);
  });

  workflow.addNode('open_pr', async (state) => {
    return await openPrNode(state, { prCreator: options.prCreator });
  });

  // 2. Register Edges
  workflow.addEdge(START, 'init_sandbox');
  workflow.addEdge('init_sandbox', 'initial_audit');

  // Branch from initial_audit: if issues found -> atomic_file_fix, else verify_build
  workflow.addConditionalEdges('initial_audit', (state: AgentState) => {
    if (state.activeFilePath || (state.pendingFiles && state.pendingFiles.length > 0)) {
      return 'atomic_file_fix';
    }
    return 'verify_build';
  });

  // Loop or exit from atomic_file_fix
  workflow.addConditionalEdges('atomic_file_fix', routeAfterAtomicFix);

  workflow.addEdge('verify_build', 'open_pr');
  workflow.addEdge('open_pr', END);

  // 3. Configure SQLite checkpointer
  const checkpointer =
    options.checkpointer || new SqliteSaver(options.dbPath || '.checkpoints.db');

  return workflow.compile({ checkpointer });
}
