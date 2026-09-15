import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, evaluateRules } from '@fix11y/core';
import { sliceCstContext } from '../src/context/context-slicer.js';
import {
  SemanticFixSchema,
  validateSemanticFix,
  ALLOWED_SEMANTIC_TAGS,
  ALLOWED_ARIA_ROLES,
} from '../src/validation/semantic-schema.js';
import { applyAiSemanticPatch } from '../src/patching/cst-patch-adapter.js';

// ============================================================================
// 1. Context Slicer Tests
// ============================================================================

test('sliceCstContext - accurately extracts target snippet and calculates 1-indexed lines', () => {
  const source = [
    '<!DOCTYPE html>',
    '<html>',
    '<body>',
    '  <header>',
    '    <h1>Page Title</h1>',
    '  </header>',
    '  <main>',
    '    <div onclick="doSomething()">Clickable Div</div>',
    '  </main>',
    '</body>',
    '</html>',
  ].join('\n');

  const targetSnippet = '<div onclick="doSomething()">Clickable Div</div>';
  const startOffset = source.indexOf(targetSnippet);
  const endOffset = startOffset + targetSnippet.length;

  const result = sliceCstContext(source, startOffset, endOffset, 2);

  // Line 8 contains the target element
  assert.equal(result.startLine, 8);
  assert.equal(result.endLine, 8);
  assert.equal(result.targetSnippet, targetSnippet);

  // Window with paddingLines=2 should cover lines 6 to 10
  assert.equal(result.lineWindow.start, 6);
  assert.equal(result.lineWindow.end, 10);

  // Annotated context must format line 8 with '>' pointer and other lines with spaces
  const lines = result.annotatedContext.split('\n');
  assert.equal(lines.length, 5); // lines 6, 7, 8, 9, 10

  const targetLine = lines.find((l) => l.includes('Clickable Div'));
  assert.ok(targetLine);
  assert.ok(targetLine.startsWith('> '));
  assert.ok(targetLine.includes(' 8 |     <div onclick="doSomething()">Clickable Div</div>'));

  const nonTargetLine = lines.find((l) => l.includes('</header>'));
  assert.ok(nonTargetLine);
  assert.ok(nonTargetLine.startsWith('  '));
});

test('sliceCstContext - clamps padding at line 1 and end-of-file safely', () => {
  const source = '<button>One</button>\n<button>Two</button>';
  const result = sliceCstContext(source, 0, 20, 50);

  assert.equal(result.lineWindow.start, 1);
  assert.equal(result.lineWindow.end, 2);
  assert.equal(result.startLine, 1);
  assert.equal(result.endLine, 1);
});

test('sliceCstContext - handles multi-line target nodes spanning multiple lines', () => {
  const source = [
    '<div>',
    '  <div onclick="submitForm()">',
    '    <span>Submit</span>',
    '  </div>',
    '</div>',
  ].join('\n');

  const targetSnippet = '  <div onclick="submitForm()">\n    <span>Submit</span>\n  </div>';
  const startOffset = source.indexOf(targetSnippet);
  const endOffset = startOffset + targetSnippet.length;

  const result = sliceCstContext(source, startOffset, endOffset, 0);

  assert.equal(result.startLine, 2);
  assert.equal(result.endLine, 4);

  const lines = result.annotatedContext.split('\n');
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.ok(line.startsWith('> '));
  }
});

// ============================================================================
// 2. Zod Validation Guardrail Tests
// ============================================================================

test('SemanticFixSchema - accepts valid semantic fix payload', () => {
  const validPayload = {
    newTagName: 'button',
    attributesToAdd: {
      type: 'button',
      'aria-label': 'Close dialog',
      tabindex: '0',
    },
    wcagRationale: 'Converting non-semantic div to button to satisfy WCAG 2.1.1 keyboard operability.',
  };

  const parsed = validateSemanticFix(validPayload);
  assert.equal(parsed.newTagName, 'button');
  assert.equal(parsed.attributesToAdd['type'], 'button');
  assert.equal(parsed.attributesToAdd['aria-label'], 'Close dialog');
});

test('SemanticFixSchema - accepts allowed ARIA roles', () => {
  for (const role of ALLOWED_ARIA_ROLES) {
    const payload = {
      newTagName: 'a',
      attributesToAdd: {
        role,
        href: '#main-content',
      },
      wcagRationale: `Assigning semantic role ${role} for accessibility support.`,
    };
    const parsed = validateSemanticFix(payload);
    assert.equal(parsed.attributesToAdd['role'], role);
  }
});

test('SemanticFixSchema - rejects hallucinated tag names', () => {
  const invalidTags = ['div-button', 'custom-btn', 'clickable', 'span'];

  for (const tag of invalidTags) {
    assert.throws(
      () => {
        validateSemanticFix({
          newTagName: tag,
          attributesToAdd: { type: 'button' },
          wcagRationale: 'Attempting fix with non-standard tag name.',
        });
      },
      (err: Error) => {
        assert.ok(err.message.includes('Invalid newTagName') || err.message.includes('Invalid'));
        return true;
      }
    );
  }
});

test('SemanticFixSchema - rejects unauthorized or malicious attributes', () => {
  // Disallowed attributes (e.g., onclick, id, class, style)
  assert.throws(() => {
    validateSemanticFix({
      newTagName: 'button',
      attributesToAdd: { onclick: 'alert(1)' },
      wcagRationale: 'Attempting to inject onclick attribute directly.',
    });
  });

  // Disallowed role
  assert.throws(() => {
    validateSemanticFix({
      newTagName: 'button',
      attributesToAdd: { role: 'super-button' },
      wcagRationale: 'Attempting to assign an unauthorized ARIA role.',
    });
  });

  // Forbidden javascript: protocol
  assert.throws(() => {
    validateSemanticFix({
      newTagName: 'a',
      attributesToAdd: { href: 'javascript:void(0)' },
      wcagRationale: 'Attempting to inject dangerous javascript protocol.',
    });
  });

  // Forbidden <script> injection in value
  assert.throws(() => {
    validateSemanticFix({
      newTagName: 'button',
      attributesToAdd: { title: '<script>fetch("evil.com")</script>' },
      wcagRationale: 'Attempting XSS payload injection inside title.',
    });
  });
});

test('SemanticFixSchema - enforces wcagRationale length limits (10-300 chars)', () => {
  // Too short (< 10 chars)
  assert.throws(() => {
    validateSemanticFix({
      newTagName: 'button',
      attributesToAdd: {},
      wcagRationale: 'Too short',
    });
  });

  // Too long (> 300 chars)
  assert.throws(() => {
    validateSemanticFix({
      newTagName: 'button',
      attributesToAdd: {},
      wcagRationale: 'A'.repeat(301),
    });
  });
});

// ============================================================================
// 3. CST Patch Adapter & Dynamic In-Memory Re-Audit Tests
// ============================================================================

test('applyAiSemanticPatch - applies surgical patch and preserves untouched markup', () => {
  const source = [
    '<!-- Header Section -->',
    '<header class="main-header">',
    '  {{#if userLoggedIn}}',
    '    <div onclick="logout()">Log Out</div>',
    '  {{/if}}',
    '</header>',
  ].join('\n');

  const targetOffset = source.indexOf('<div onclick="logout()">');

  const fixResult = applyAiSemanticPatch(source, targetOffset, {
    newTagName: 'button',
    attributesToAdd: {
      type: 'button',
    },
    wcagRationale: 'Convert clickable div with onclick to native button with type="button".',
  });

  // 1. Tag name swapped to button, attribute inserted
  assert.ok(fixResult.updatedCode.includes('<button onclick="logout()" type="button">Log Out</button>'));

  // 2. Untouched template syntax and comments preserved 100%
  assert.ok(fixResult.updatedCode.includes('<!-- Header Section -->'));
  assert.ok(fixResult.updatedCode.includes('{{#if userLoggedIn}}'));
  assert.ok(fixResult.updatedCode.includes('{{/if}}'));

  // 3. Unified diff generated
  assert.ok(fixResult.diff.includes('<div onclick="logout()">Log Out</div>'));
  assert.ok(fixResult.diff.includes('<button onclick="logout()" type="button">Log Out</button>'));
});

test('applyAiSemanticPatch - dynamic in-memory re-audit eliminates offset drift for subsequent violations', () => {
  // Source with TWO distinct ButtonSemantics violations:
  // Item 1: <div onclick="clickOne()">First Action</div>
  // Item 2: <div onclick="clickTwo()">Second Action</div>
  const source = [
    '<main>',
    '  <div onclick="clickOne()">First Action</div>',
    '  <p>Static middle content that remains untouched.</p>',
    '  <div onclick="clickTwo()">Second Action</div>',
    '</main>',
  ].join('\n');

  // Initial audit of original source
  const initialDiagnostics = evaluateRules(parse(source));
  const buttonDiagnostics = initialDiagnostics.filter((d) => d.ruleId === 'button-semantics');

  assert.equal(buttonDiagnostics.length, 2, 'Expected 2 initial button-semantics violations');

  const diag1 = buttonDiagnostics[0];
  const diag2 = buttonDiagnostics[1];

  // Save the original offset of the second violation
  const originalDiag2StartOffset = diag2.node.startOffset;

  // Apply surgical patch to the FIRST violation
  // Converting <div onclick="clickOne()"> to <button onclick="clickOne()" type="button"> (+17 bytes)
  // and </div> to </button> (+3 bytes)
  // Total string expansion = +20 bytes!
  const fix1 = applyAiSemanticPatch(source, diag1.node.startOffset, {
    newTagName: 'button',
    attributesToAdd: {
      type: 'button',
    },
    wcagRationale: 'Convert first action div to interactive button element.',
  });

  // Check fresh diagnostics returned by the immediate in-memory re-audit
  assert.ok(fix1.freshDiagnostics);
  const remainingButtonDiags = fix1.freshDiagnostics.filter((d) => d.ruleId === 'button-semantics');

  // The first issue is resolved, leaving exactly 1 remaining issue
  assert.equal(remainingButtonDiags.length, 1, 'Expected exactly 1 remaining violation after fixing #1');

  const freshDiag2 = remainingButtonDiags[0];

  // Verify that the second diagnostic's character offset shifted mathematically
  const openTagShift = '<button onclick="clickOne()" type="button">'.length - '<div onclick="clickOne()">'.length;
  const closeTagShift = '</button>'.length - '</div>'.length;
  const totalShift = openTagShift + closeTagShift;

  assert.equal(
    freshDiag2.node.startOffset,
    originalDiag2StartOffset + totalShift,
    'Fresh diagnostic offset must match exact string expansion without drift'
  );

  // Verify that we can immediately apply a second fix using the FRESH offset cleanly
  const fix2 = applyAiSemanticPatch(fix1.updatedCode, freshDiag2.node.startOffset, {
    newTagName: 'button',
    attributesToAdd: {
      type: 'button',
    },
    wcagRationale: 'Convert second action div to interactive button element.',
  });

  // After both fixes, all button-semantics violations must be 100% resolved
  const finalButtonDiags = fix2.freshDiagnostics.filter((d) => d.ruleId === 'button-semantics');
  assert.equal(finalButtonDiags.length, 0, 'Expected 0 button-semantics violations after both fixes');

  assert.ok(fix2.updatedCode.includes('<button onclick="clickOne()" type="button">First Action</button>'));
  assert.ok(fix2.updatedCode.includes('<button onclick="clickTwo()" type="button">Second Action</button>'));
});
