/**
 * fix11y - Rule Registry and Evaluation Engine.
 */

import { ImgAltRule } from './img-alt.js';
import { FormLabelRule } from './form-label.js';
import { ButtonSemanticsRule } from './button-semantics.js';
import { AriaLiveStatusRule } from './aria-live-status.js';
import { parse } from '../parser/parser.js';
import { applyPatches } from '../parser/patcher.js';

export { BaseRule } from './base.js';
export { ImgAltRule } from './img-alt.js';
export { FormLabelRule } from './form-label.js';
export { ButtonSemanticsRule } from './button-semantics.js';
export { AriaLiveStatusRule } from './aria-live-status.js';

export class RuleRegistry {
  constructor() {
    this.rules = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    this.register(new ImgAltRule());
    this.register(new FormLabelRule());
    this.register(new ButtonSemanticsRule());
    this.register(new AriaLiveStatusRule());
  }

  /**
   * Registers a rule instance.
   * @param {import('./base.js').BaseRule} rule
   */
  register(rule) {
    if (!rule || !rule.id) {
      throw new Error('Invalid rule: must have an id');
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Retrieves a rule by its ID.
   * @param {string} id
   * @returns {import('./base.js').BaseRule|undefined}
   */
  get(id) {
    return this.rules.get(id);
  }

  /**
   * Returns an array of all registered rule instances.
   * @returns {Array<import('./base.js').BaseRule>}
   */
  getAll() {
    return Array.from(this.rules.values());
  }

  /**
   * Evaluates CST against registered rules.
   * @param {object} cst - Root CST node
   * @param {object} [options={}]
   * @param {string[]} [options.ruleIds] - Specific rule IDs to execute (default: all)
   * @param {object} [context={}] - Context metadata (e.g. filename)
   * @returns {Array<object>} Flat array of Diagnostic objects
   */
  evaluate(cst, options = {}, context = {}) {
    const selectedRules = options.ruleIds
      ? options.ruleIds.map((id) => this.rules.get(id)).filter(Boolean)
      : this.getAll();

    const diagnostics = [];
    for (const rule of selectedRules) {
      const results = rule.evaluate(cst, context);
      if (Array.isArray(results)) {
        diagnostics.push(...results);
      }
    }

    return diagnostics;
  }

  /**
   * Runs evaluation on source string, extracts patches, and returns remediated source code.
   * @param {string} source
   * @param {object} [options={}]
   * @param {string[]} [options.ruleIds]
   * @param {('safe'|'caution')[]} [options.safetyLevels=['safe', 'caution']]
   * @param {object} [context={}]
   * @returns {{ source: string, patched: string, diagnostics: Array<object>, patches: Array<object> }}
   */
  remediate(source, options = {}, context = {}) {
    const cst = parse(source);
    const diagnostics = this.evaluate(cst, options, context);

    const safetyLevels = new Set(options.safetyLevels || ['safe', 'caution']);
    const applicableDiagnostics = diagnostics.filter((d) => safetyLevels.has(d.safety));

    const allPatches = [];
    for (const diag of applicableDiagnostics) {
      if (Array.isArray(diag.patches)) {
        allPatches.push(...diag.patches);
      }
    }

    const patched = applyPatches(source, allPatches);

    return {
      source,
      patched,
      diagnostics,
      patches: allPatches
    };
  }
}

// Global default singleton registry
export const defaultRegistry = new RuleRegistry();

/**
 * Programmatic convenience function to evaluate CST against default rule set.
 * @param {object} cst
 * @param {object} [options]
 * @returns {Array<object>}
 */
export function evaluateRules(cst, options = {}) {
  return defaultRegistry.evaluate(cst, options);
}

/**
 * Programmatic convenience function to remediate markup string against default rule set.
 * @param {string} source
 * @param {object} [options]
 * @returns {{ source: string, patched: string, diagnostics: Array<object>, patches: Array<object> }}
 */
export function remediate(source, options = {}) {
  return defaultRegistry.remediate(source, options);
}
