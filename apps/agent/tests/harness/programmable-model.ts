/**
 * Programmable LLM Invoker Harness.
 *
 * Provides deterministic, schema-compliant SemanticFixOutput payloads
 * tailored to @fix11y/core rule IDs, with support for simulating retries,
 * invalid hallucinations, and failure modes.
 */

import { SemanticFixOutput } from '../../src/validation/semantic-schema.js';
import { ModelInvoker } from '../../src/graph/nodes/atomic-file-fix.js';

export interface InvocationRecord {
  prompt: string;
  context: {
    targetSnippet: string;
    annotatedContext: string;
    ruleId: string;
    message: string;
  };
  output: SemanticFixOutput;
  timestamp: number;
}

export class ProgrammableModel {
  public callCount = 0;
  public invocations: InvocationRecord[] = [];
  private failRules = new Map<string, { count: number; payload?: Partial<SemanticFixOutput> }>();
  private customOverrides = new Map<string, SemanticFixOutput>();

  /**
   * Configures a specific rule to fail or return an ineffective patch N times.
   */
  failRule(ruleId: string, times = 2, ineffectivePayload?: Partial<SemanticFixOutput>): void {
    this.failRules.set(ruleId, { count: times, payload: ineffectivePayload });
  }

  /**
   * Overrides the output for a specific rule ID.
   */
  overrideRule(ruleId: string, output: SemanticFixOutput): void {
    this.customOverrides.set(ruleId, output);
  }

  /**
   * The ModelInvoker function passed to atomicFileFixNode or buildAgentWorkflow.
   */
  invoker: ModelInvoker = async (prompt, context): Promise<SemanticFixOutput> => {
    this.callCount++;

    const ruleId = context.ruleId;

    // Check if configured to simulate repeated failure/retry
    const failureConfig = this.failRules.get(ruleId);
    if (failureConfig && failureConfig.count > 0) {
      failureConfig.count--;
      const ineffective = failureConfig.payload;

      const result: SemanticFixOutput = {
        newTagName: ineffective?.newTagName || 'button',
        attributesToAdd: ineffective?.attributesToAdd || {},
        wcagRationale: ineffective?.wcagRationale || 'Simulated retry attempt.',
      };

      this.invocations.push({ prompt, context, output: result, timestamp: Date.now() });
      return result;
    }

    // Check custom overrides
    if (this.customOverrides.has(ruleId)) {
      const result = this.customOverrides.get(ruleId)!;
      this.invocations.push({ prompt, context, output: result, timestamp: Date.now() });
      return result;
    }

    // Default rule-based deterministic remediations
    let result: SemanticFixOutput;

    switch (ruleId) {
      case 'button-semantics':
        result = {
          newTagName: 'button',
          attributesToAdd: {
            type: 'button',
          },
          wcagRationale: 'Replaced non-semantic div with native button for WCAG 4.1.2 Name, Role, Value.',
        };
        break;

      case 'form-label':
        result = {
          newTagName: 'input',
          attributesToAdd: {
            'aria-label': 'Subscribe to email newsletter',
          },
          wcagRationale: 'Injected accessible name via aria-label for WCAG 1.3.1 Info and Relationships.',
        };
        break;

      default:
        result = {
          newTagName: 'button',
          attributesToAdd: {
            type: 'button',
          },
          wcagRationale: 'Applied semantic button element for WCAG AA keyboard operability.',
        };
        break;
    }

    this.invocations.push({ prompt, context, output: result, timestamp: Date.now() });
    return result;
  };
}
