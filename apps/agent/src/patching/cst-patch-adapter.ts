/**
 * CST Patch Adapter & Dynamic In-Memory Re-Audit.
 *
 * Implements Invariant 6 & Invariant 7:
 * - Surgical CST patching via @fix11y/core without re-serializing the whole document.
 * - Atomic in-memory re-audit (< 10ms) immediately after mutation to regenerate fresh,
 *   drift-free character offsets for subsequent violations.
 */

import {
  parse,
  findNodes,
  hasAttribute,
  applyPatches,
  createSwapTagNamePatch,
  createInsertAttributePatch,
  createUpdateAttributePatch,
  createRemoveAttributePatch,
  evaluateRules,
  createUnifiedDiff,
} from '@fix11y/core';
import { SemanticFixOutput, validateSemanticFix } from '../validation/semantic-schema.js';

export interface AppliedPatchResult {
  updatedCode: string;
  freshDiagnostics: any[];
  diff: string;
}

/**
 * Finds the CST element node matching the targetOffset.
 */
export function findNodeAtOffset(cst: any, targetOffset: number): any {
  // 1. Exact match on startOffset or openTag.startOffset
  const exact = findNodes(
    cst,
    (node: any) =>
      node.type === 'element' &&
      (node.startOffset === targetOffset || node.openTag?.startOffset === targetOffset)
  );
  if (exact.length > 0) return exact[0];

  // 2. Narrowest element enclosing targetOffset
  const enclosing = findNodes(
    cst,
    (node: any) =>
      node.type === 'element' &&
      node.startOffset <= targetOffset &&
      node.endOffset >= targetOffset
  );
  if (enclosing.length > 0) {
    enclosing.sort(
      (a: any, b: any) => a.endOffset - a.startOffset - (b.endOffset - b.startOffset)
    );
    return enclosing[0];
  }

  return null;
}

/**
 * Applies an AI-generated semantic fix to source code using surgical CST patches,
 * and immediately re-evaluates rules in-memory to prevent offset drift.
 */
export function applyAiSemanticPatch(
  sourceCode: string,
  targetOffset: number,
  aiResult: SemanticFixOutput
): AppliedPatchResult {
  // 1. Validate LLM payload against guardrails schema
  const validated = validateSemanticFix(aiResult);

  // 2. Parse CST
  const cst = parse(sourceCode);
  const targetNode = findNodeAtOffset(cst, targetOffset);

  if (!targetNode) {
    throw new Error(`Target element node not found in CST at offset ${targetOffset}`);
  }

  // 3. Construct @fix11y/core patches
  const patches: any[] = [];

  // Swap tag name if different
  if (targetNode.tagName.toLowerCase() !== validated.newTagName.toLowerCase()) {
    const swapPatches = createSwapTagNamePatch(
      targetNode,
      validated.newTagName,
      validated.wcagRationale
    );
    patches.push(...swapPatches);
  }

  // Insert or update attributes
  if (validated.attributesToAdd && Object.keys(validated.attributesToAdd).length > 0) {
    for (const [attrName, attrValue] of Object.entries(validated.attributesToAdd)) {
      if (hasAttribute(targetNode, attrName)) {
        patches.push(
          createUpdateAttributePatch(
            targetNode,
            attrName,
            attrValue,
            '"',
            validated.wcagRationale
          )
        );
      } else {
        patches.push(
          createInsertAttributePatch(
            targetNode,
            attrName,
            attrValue,
            '"',
            validated.wcagRationale
          )
        );
      }
    }
  }

  // Remove attributes if specified
  if (validated.attributesToRemove && validated.attributesToRemove.length > 0) {
    for (const attrName of validated.attributesToRemove) {
      if (hasAttribute(targetNode, attrName)) {
        patches.push(
          createRemoveAttributePatch(
            targetNode,
            attrName,
            validated.wcagRationale
          )
        );
      }
    }
  }

  // Update inner text if specified and element has separate open and close tags
  if (typeof validated.innerText === 'string' && targetNode.openTag && targetNode.closeTag) {
    patches.push({
      startOffset: targetNode.openTag.endOffset,
      endOffset: targetNode.closeTag.startOffset,
      replacement: validated.innerText,
      description: validated.wcagRationale,
    });
  }

  // 4. Apply non-destructive surgical string patches
  const updatedCode = applyPatches(sourceCode, patches);

  // 5. In-Memory Atomic Re-Audit (< 10ms)
  // Generates fresh diagnostics with updated character offsets, eliminating offset drift
  const freshCst = parse(updatedCode);
  const freshDiagnostics = evaluateRules(freshCst);

  // 6. Generate unified diff
  const diff = createUnifiedDiff(sourceCode, updatedCode, {
    fromFile: 'original',
    toFile: 'remediated',
    color: false,
  });

  return {
    updatedCode,
    freshDiagnostics,
    diff,
  };
}
