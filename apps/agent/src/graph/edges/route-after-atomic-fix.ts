/**
 * Conditional Edge Routing after Atomic File Fix.
 *
 * Controls the outer remediation loop in LangGraph:
 * - If the budget cap has been reached -> routes to verify_build.
 * - If all files and violations have been resolved -> routes to verify_build.
 * - Otherwise -> loops back to atomic_file_fix to remediate the next violation.
 */

import { AgentState } from '../types.js';

export function routeAfterAtomicFix(state: AgentState): 'verify_build' | 'atomic_file_fix' {
  // 1. Circuit breaker: Stop if budget cap reached
  if (state.budgetCapReached) {
    return 'verify_build';
  }

  // 2. Check if active file has remaining issues
  const activeIssues = state.activeFilePath
    ? state.fileDiagnostics[state.activeFilePath] || []
    : [];

  if (activeIssues.length > 0) {
    return 'atomic_file_fix';
  }

  // 3. Check if there are pending files waiting to be processed
  if (state.pendingFiles && state.pendingFiles.length > 0) {
    return 'atomic_file_fix';
  }

  // 4. All issues across all files resolved
  return 'verify_build';
}
