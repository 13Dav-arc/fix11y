/**
 * fix11y - Rule: form-label (WCAG 2.1 AA 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value)
 * Detects form controls without accessible labels and pairs them with <label for="..."> or injects aria-label.
 */

import { BaseRule } from './base.js';
import {
  getElementsByTagName,
  hasAttribute,
  getAttributeValue,
  findNodes
} from '../parser/parser.js';
import { createInsertAttributePatch } from '../parser/patcher.js';

const IGNORED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

export class FormLabelRule extends BaseRule {
  constructor() {
    super({
      id: 'form-label',
      wcag: ['1.3.1', '4.1.2'],
      description: 'Form controls (<input>, <select>, <textarea>) must have an accessible label.',
      severity: 'error',
      safety: 'safe'
    });
  }

  /**
   * Checks if an element is wrapped inside a <label> ancestor.
   * @param {object} node
   * @returns {boolean}
   */
  isWrappedInLabel(node) {
    let curr = node.parent;
    while (curr && curr.type === 'element') {
      if (curr.tagName === 'label') {
        return true;
      }
      curr = curr.parent;
    }
    return false;
  }

  /**
   * Generates a deterministic ID for an input element.
   * @param {object} node
   * @param {number} fallbackIndex
   * @returns {string}
   */
  generateDeterministicId(node, fallbackIndex) {
    const name = getAttributeValue(node, 'name');
    if (name) {
      const clean = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (clean) return `${clean}-input`;
    }

    const type = getAttributeValue(node, 'type');
    if (type && !['text', 'password'].includes(type)) {
      return `${type}-input-${fallbackIndex}`;
    }

    return `${node.tagName}-${fallbackIndex}`;
  }

  /**
   * Generates an accessible label text derived from element attributes.
   * @param {object} node
   * @returns {string}
   */
  deriveAriaLabel(node) {
    const placeholder = getAttributeValue(node, 'placeholder');
    if (placeholder && placeholder.trim()) {
      return placeholder.trim();
    }

    const name = getAttributeValue(node, 'name');
    if (name && name.trim()) {
      return name
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
    }

    const type = getAttributeValue(node, 'type');
    if (type && type !== 'text') {
      return type.charAt(0).toUpperCase() + type.slice(1);
    }

    return 'Input Field';
  }

  /**
   * @param {object} cst
   * @param {object} [context]
   * @returns {Array<object>}
   */
  evaluate(cst, context = {}) {
    const diagnostics = [];

    // Collect all <label> elements and their 'for' attributes
    const allLabels = getElementsByTagName(cst, 'label');
    const linkedForIds = new Set();
    const unlinkedLabels = [];

    for (const label of allLabels) {
      const forVal = getAttributeValue(label, 'for');
      if (forVal) {
        linkedForIds.add(forVal.trim().toLowerCase());
      } else {
        // Only consider as unlinked if it doesn't wrap an input already
        const hasNestedInput = findNodes(label, (n) =>
          n.type === 'element' && ['input', 'select', 'textarea'].includes(n.tagName)
        ).length > 0;

        if (!hasNestedInput) {
          unlinkedLabels.push(label);
        }
      }
    }

    // Inspect all form controls
    const formControls = findNodes(cst, (n) => {
      if (n.type !== 'element') return false;
      if (['select', 'textarea'].includes(n.tagName)) return true;
      if (n.tagName === 'input') {
        const type = (getAttributeValue(n, 'type') || 'text').toLowerCase();
        return !IGNORED_INPUT_TYPES.has(type);
      }
      return false;
    });

    let autoIndex = 1;
    let labelCursor = 0;

    for (const control of formControls) {
      // Check 1: aria-label or aria-labelledby
      if (hasAttribute(control, 'aria-label') || hasAttribute(control, 'aria-labelledby')) {
        continue;
      }

      // Check 2: Wrapped in <label>
      if (this.isWrappedInLabel(control)) {
        continue;
      }

      // Check 3: Has ID matching an existing <label for="...">
      const idVal = getAttributeValue(control, 'id');
      if (idVal && linkedForIds.has(idVal.trim().toLowerCase())) {
        continue;
      }

      // Violation detected! Construct patches
      const patches = [];

      // Check if there is an unlinked <label> we can pair with
      if (labelCursor < unlinkedLabels.length) {
        const targetLabel = unlinkedLabels[labelCursor++];
        let finalId = idVal ? idVal.trim() : this.generateDeterministicId(control, autoIndex++);

        if (!idVal) {
          patches.push(
            createInsertAttributePatch(
              control,
              'id',
              finalId,
              '"',
              `Add id="${finalId}" to <${control.tagName}>`
            )
          );
        }

        patches.push(
          createInsertAttributePatch(
            targetLabel,
            'for',
            finalId,
            '"',
            `Link <label> with for="${finalId}"`
          )
        );
      } else {
        // No unlinked label available: Inject aria-label for direct accessible name
        const ariaLabelText = this.deriveAriaLabel(control);
        patches.push(
          createInsertAttributePatch(
            control,
            'aria-label',
            ariaLabelText,
            '"',
            `Add aria-label="${ariaLabelText}" to <${control.tagName}>`
          )
        );
      }

      diagnostics.push(
        this.createDiagnostic({
          message: `<${control.tagName}> is missing an associated <label> or aria-label.`,
          node: control,
          patches
        })
      );
    }

    return diagnostics;
  }
}
