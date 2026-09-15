/**
 * State Schema and Interfaces for fix11y LangGraph Workflow.
 */

import { SandboxManager } from '../sandbox/sandbox-manager.js';

export interface QuarantinedIssue {
  filePath: string;
  diagnostic: any;
  reason: string;
}

export interface AppliedPatchRecord {
  filePath: string;
  diff: string;
  rationale: string;
  timestamp: number;
}

export interface AgentState {
  repoUrl: string;
  targetDirectory: string;
  ignorePatterns: string[];
  branchName: string;
  baseBranch: string;
  existingPrNumber: number | null;
  workspaceDir: string;
  sandbox: SandboxManager | null;
  pendingFiles: string[];
  activeFilePath: string | null;
  fileDiagnostics: Record<string, any[]>;
  attemptCounter: Record<string, number>;
  quarantinedIssues: QuarantinedIssue[];
  appliedPatches: AppliedPatchRecord[];
  budgetCap: number;
  llmCallCount: number;
  budgetCapReached: boolean;
  verificationPassed: boolean;
  buildErrors: string | null;
  prUrl: string | null;
  phase: string;
}

/**
 * Creates an AgentState object with robust defaults.
 */
export function createInitialAgentState(partial: Partial<AgentState> = {}): AgentState {
  return {
    repoUrl: '',
    targetDirectory: '.',
    ignorePatterns: [],
    branchName: 'fix11y/auto-remediation',
    baseBranch: 'main',
    existingPrNumber: null,
    workspaceDir: '/home/user/repo',
    sandbox: null,
    pendingFiles: [],
    activeFilePath: null,
    fileDiagnostics: {},
    attemptCounter: {},
    quarantinedIssues: [],
    appliedPatches: [],
    budgetCap: 50,
    llmCallCount: 0,
    budgetCapReached: false,
    verificationPassed: false,
    buildErrors: null,
    prUrl: null,
    phase: 'init_sandbox',
    ...partial,
  };
}
