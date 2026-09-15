/**
 * Atomic Single-Step Node for fix11y LangGraph Orchestration.
 *
 * Implements the atomic remediation invariant:
 * - Processes strictly ONE violation per invocation.
 * - Enforces budget cap circuit-breaker.
 * - Bounded token context slicing via sliceCstContext().
 * - LLM output validation against SemanticFixSchema.
 * - Surgical CST patching and instant in-memory re-audit via applyAiSemanticPatch().
 * - Never loops inside the node—control flow is governed by LangGraph edges.
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AgentState } from '../types.js';
import { sliceCstContext } from '../../context/context-slicer.js';
import { SemanticFixSchema, SemanticFixOutput } from '../../validation/semantic-schema.js';
import { applyAiSemanticPatch } from '../../patching/cst-patch-adapter.js';

export type ModelInvoker = (
  prompt: string,
  context: {
    targetSnippet: string;
    annotatedContext: string;
    ruleId: string;
    message: string;
  }
) => Promise<SemanticFixOutput>;

export interface AtomicFileFixOptions {
  modelInvoker?: ModelInvoker;
}

/**
 * Default production LLM invoker using Google Gemini 2.5 Flash with structured output.
 * Prioritizes GEMINI_API_KEY, falling back to ANTHROPIC_API_KEY if configured.
 */
export async function defaultModelInvoker(
  prompt: string,
  _context: {
    targetSnippet: string;
    annotatedContext: string;
    ruleId: string;
    message: string;
  }
): Promise<SemanticFixOutput> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY;

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 0,
    apiKey,
    thinkingConfig: {
      thinkingBudget: 1024,
    },
  } as any);

  const structuredModel = model.withStructuredOutput(SemanticFixSchema);
  const result = await structuredModel.invoke(prompt);
  return result as SemanticFixOutput;
}

/**
 * Executes a single atomic remediation step on one violation.
 */
export async function atomicFileFixNode(
  state: AgentState,
  options: AtomicFileFixOptions = {}
): Promise<Partial<AgentState>> {
  // 1. Budget Cap Check (Circuit Breaker)
  if (state.llmCallCount >= state.budgetCap) {
    const quarantined = [...state.quarantinedIssues];
    for (const [filePath, issues] of Object.entries(state.fileDiagnostics)) {
      for (const issue of issues) {
        quarantined.push({
          filePath,
          diagnostic: issue,
          reason: `Circuit breaker triggered: Budget cap reached (${state.budgetCap} calls)`,
        });
      }
    }

    return {
      budgetCapReached: true,
      activeFilePath: null,
      pendingFiles: [],
      fileDiagnostics: {},
      quarantinedIssues: quarantined,
      phase: 'verify_build',
    };
  }

  // 2. Active File Resolution
  let activeFile = state.activeFilePath;
  let pending = [...state.pendingFiles];

  if (!activeFile) {
    if (pending.length === 0) {
      return {
        activeFilePath: null,
        phase: 'verify_build',
      };
    }
    activeFile = pending[0];
    pending = pending.slice(1);
  }

  const fileIssues = state.fileDiagnostics[activeFile] || [];

  // If active file has no more issues, advance to next file
  if (fileIssues.length === 0) {
    const nextFile = pending.length > 0 ? pending[0] : null;
    const nextPending = pending.length > 0 ? pending.slice(1) : [];
    return {
      activeFilePath: nextFile,
      pendingFiles: nextPending,
      phase: nextFile ? 'atomic_file_fix' : 'verify_build',
    };
  }

  // 3. Select strictly ONE violation
  const currentViolation = fileIssues[0];
  const startOffset = currentViolation.node?.startOffset ?? currentViolation.startOffset ?? 0;
  const endOffset = currentViolation.node?.endOffset ?? currentViolation.endOffset ?? startOffset;
  const ruleId = currentViolation.ruleId || 'unknown-rule';

  // 4. Attempt Counter & Quarantining
  const fingerprint = `${activeFile}:${startOffset}:${ruleId}`;
  const currentAttempts = state.attemptCounter[fingerprint] || 0;

  if (currentAttempts >= 2) {
    // Quarantine violation and advance
    return {
      attemptCounter: {
        ...state.attemptCounter,
        [fingerprint]: currentAttempts + 1,
      },
      fileDiagnostics: {
        ...state.fileDiagnostics,
        [activeFile]: fileIssues.slice(1),
      },
      quarantinedIssues: [
        ...state.quarantinedIssues,
        {
          filePath: activeFile,
          diagnostic: currentViolation,
          reason: 'Exceeded max retry attempts (2)',
        },
      ],
    };
  }

  const updatedAttemptCounter = {
    ...state.attemptCounter,
    [fingerprint]: currentAttempts + 1,
  };

  // 5. Read file content from Sandbox
  if (!state.sandbox) {
    throw new Error('Sandbox is not initialized in AgentState');
  }

  const sourceCode = await state.sandbox.readFile(activeFile);

  // 6. Context Slicing
  const sliced = sliceCstContext(sourceCode, startOffset, endOffset, 10);

  // 7. Prompt Construction & Model Invocation
  const prompt = [
    `You are fix11y, an expert accessibility remediation engineer.`,
    `Remediate the following WCAG AA violation:`,
    `Rule ID: ${ruleId}`,
    `Message: ${currentViolation.message}`,
    ``,
    `Target Snippet:`,
    sliced.targetSnippet,
    ``,
    `Annotated Surrounding Context:`,
    sliced.annotatedContext,
    ``,
    `Requirements:`,
    `1. Select the most accessible semantic replacement tag (button, a, summary, input).`,
    `2. Provide safe, standard attributes to add or update (aria-*, role, type, tabindex, title, href).`,
    `3. Write a clear WCAG rationale explaining the compliance criteria (10-300 characters).`,
  ].join('\n');

  const invoker = options.modelInvoker || defaultModelInvoker;
  const aiResult = await invoker(prompt, {
    targetSnippet: sliced.targetSnippet,
    annotatedContext: sliced.annotatedContext,
    ruleId,
    message: currentViolation.message,
  });

  // 8. Surgical CST Patching & In-Memory Dynamic Re-Audit
  const patchResult = applyAiSemanticPatch(sourceCode, startOffset, aiResult);

  // Write updated code back into the microVM
  await state.sandbox.writeFile(activeFile, patchResult.updatedCode);

  // Filter fresh diagnostics for the current active file
  const remainingIssues = patchResult.freshDiagnostics;

  // 9. Update State
  const newAppliedPatches = [
    ...state.appliedPatches,
    {
      filePath: activeFile,
      diff: patchResult.diff,
      rationale: aiResult.wcagRationale,
      timestamp: Date.now(),
    },
  ];

  const updatedDiagnostics = {
    ...state.fileDiagnostics,
    [activeFile]: remainingIssues,
  };

  const isFileDone = remainingIssues.length === 0;
  const nextActiveFile = isFileDone
    ? pending.length > 0 ? pending[0] : null
    : activeFile;
  const nextPendingFiles = isFileDone && pending.length > 0 ? pending.slice(1) : pending;

  return {
    activeFilePath: nextActiveFile,
    pendingFiles: nextPendingFiles,
    fileDiagnostics: updatedDiagnostics,
    appliedPatches: newAppliedPatches,
    attemptCounter: updatedAttemptCounter,
    llmCallCount: state.llmCallCount + 1,
    phase: nextActiveFile ? 'atomic_file_fix' : 'verify_build',
  };
}
