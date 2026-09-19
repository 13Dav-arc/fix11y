import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parser/parser.js';
import { applyPatches } from '../src/parser/patcher.js';
import {
  FormLabelRule,
  HtmlLangRule,
  MetaViewportRule,
  DuplicateIdRule,
  EmptyLinkRule,
  EmptyHeadingRule,
  TabindexPositiveRule,
  HeadingOrderRule,
  LandmarkOneMainRule,
  RuleRegistry,
  evaluateRules,
  remediate
} from '../src/index.js';

// ---------------------------------------------------------------------------
// 1. form-label Proximity Pairing & Safety Tier Tests
// ---------------------------------------------------------------------------

test('FormLabelRule: proximity pairing correctly pairs adjacent sibling labels without cross-pairing', () => {
  const raw = `
<div class="form-container">
  <div class="field">
    <label>First Name</label>
    <input name="firstName">
  </div>
  <div class="field">
    <label>Email Address</label>
    <input name="email">
  </div>
</div>`;

  const cst = parse(raw);
  const rule = new FormLabelRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 2);
  assert.equal(rule.safety, 'caution');

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  // firstName should be paired with First Name, and email with Email Address
  assert.match(fixed, /<label for="firstname-input">First Name<\/label>/);
  assert.match(fixed, /<input name="firstName" id="firstname-input">/);
  assert.match(fixed, /<label for="email-input">Email Address<\/label>/);
  assert.match(fixed, /<input name="email" id="email-input">/);
});

test('FormLabelRule: orphan input with no proximity label falls back safely to derived aria-label', () => {
  const raw = `<form><input type="text" name="searchQuery" placeholder="Search articles..."></form>`;
  const cst = parse(raw);
  const rule = new FormLabelRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const patches = diagnostics[0].patches;
  const fixed = applyPatches(raw, patches);

  assert.match(fixed, /aria-label="Search articles\.\.\."/);
});

// ---------------------------------------------------------------------------
// 2. html-lang Tests (WCAG 3.1.1, caution)
// ---------------------------------------------------------------------------

test('HtmlLangRule: flags missing lang on <html> and tags with caution safety tier', () => {
  const raw = `<!DOCTYPE html><html><head><title>Test</title></head><body><p>Hello</p></body></html>`;
  const cst = parse(raw);
  const rule = new HtmlLangRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].ruleId, 'html-lang');
  assert.equal(diagnostics[0].wcag[0], '3.1.1');
  assert.equal(diagnostics[0].safety, 'caution');
  assert.equal(diagnostics[0].scope, 'element');

  const fixed = applyPatches(raw, diagnostics[0].patches);
  assert.match(fixed, /<html lang="en">/);
});

test('HtmlLangRule: valid lang attribute produces no violations', () => {
  const raw = `<!DOCTYPE html><html lang="fr"><head><title>Test</title></head><body></body></html>`;
  const cst = parse(raw);
  const rule = new HtmlLangRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 0);
});

// ---------------------------------------------------------------------------
// 3. meta-viewport Tests (WCAG 1.4.4, safe, surgical token removal)
// ---------------------------------------------------------------------------

test('MetaViewportRule: surgically removes zoom restrictions while preserving surrounding directives', () => {
  const raw = `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`;
  const cst = parse(raw);
  const rule = new MetaViewportRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].ruleId, 'meta-viewport');
  assert.equal(diagnostics[0].wcag[0], '1.4.4');
  assert.equal(diagnostics[0].safety, 'safe');

  const fixed = applyPatches(raw, diagnostics[0].patches);

  // user-scalable=no and maximum-scale=1.0 removed, others preserved
  assert.doesNotMatch(fixed, /user-scalable/);
  assert.doesNotMatch(fixed, /maximum-scale/);
  assert.match(fixed, /width=device-width/);
  assert.match(fixed, /initial-scale=1\.0/);
  assert.match(fixed, /viewport-fit=cover/);
});

test('MetaViewportRule: accessible viewport produces no violations', () => {
  const raw = `<meta name="viewport" content="width=device-width, initial-scale=1">`;
  const cst = parse(raw);
  const rule = new MetaViewportRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 0);
});

// ---------------------------------------------------------------------------
// 4. duplicate-id Tests (WCAG 4.1.2, caution)
// ---------------------------------------------------------------------------

test('DuplicateIdRule: detects duplicate IDs, maps to WCAG 4.1.2, and withholds auto-patches', () => {
  const raw = `<section id="hero">First</section><div id="hero">Second</div><p id="hero">Third</p>`;
  const cst = parse(raw);
  const rule = new DuplicateIdRule();
  const diagnostics = rule.evaluate(cst);

  // First is kept; 2nd and 3rd are flagged
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].ruleId, 'duplicate-id');
  assert.equal(diagnostics[0].wcag[0], '4.1.2');
  assert.equal(diagnostics[0].safety, 'caution');
  assert.match(diagnostics[0].message, /Automatic patch withheld to prevent breaking CSS, JavaScript, or anchor references/);

  // Detection-only: no automatic rename patches
  const patches = diagnostics.flatMap(d => d.patches);
  assert.equal(patches.length, 0);
});

// ---------------------------------------------------------------------------
// 5. empty-link Tests (WCAG 2.4.4, 4.1.2, caution)
// ---------------------------------------------------------------------------

test('EmptyLinkRule: flags link without accessible name and derives label from href', () => {
  const raw = `<a href="/contact-us"></a><a href="mailto:support@fix11y.org"></a>`;
  const cst = parse(raw);
  const rule = new EmptyLinkRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].safety, 'caution');
  assert.deepEqual(diagnostics[0].wcag, ['2.4.4', '4.1.2']);

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  assert.match(fixed, /aria-label="Contact [Uu]s"/);
  assert.match(fixed, /aria-label="Email support@fix11y\.org"/);
});

test('EmptyLinkRule: link with image alt text or text content produces no violations', () => {
  const raw = `<a href="/home"><img src="logo.png" alt="Home page"></a><a href="/about">About Us</a>`;
  const cst = parse(raw);
  const rule = new EmptyLinkRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 0);
});

// ---------------------------------------------------------------------------
// 6. empty-heading Tests (WCAG 1.3.1, 2.4.6, caution)
// ---------------------------------------------------------------------------

test('EmptyHeadingRule: flags empty headings', () => {
  const raw = `<h1></h1><h2>   </h2><h3>Accessible Title</h3>`;
  const cst = parse(raw);
  const rule = new EmptyHeadingRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].safety, 'caution');

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  assert.match(fixed, /<h1 aria-label="Section Heading">/);
});

// ---------------------------------------------------------------------------
// 7. tabindex-positive Tests (WCAG 2.4.3, caution)
// ---------------------------------------------------------------------------

test('TabindexPositiveRule: flags tabindex > 0 and patches to 0', () => {
  const raw = `<button tabindex="3">Save</button><input tabindex="1"><div tabindex="0">Valid</div>`;
  const cst = parse(raw);
  const rule = new TabindexPositiveRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].safety, 'caution');
  assert.equal(diagnostics[0].wcag[0], '2.4.3');

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  assert.match(fixed, /<button tabindex="0">Save<\/button>/);
  assert.match(fixed, /<input tabindex="0">/);
  assert.match(fixed, /<div tabindex="0">Valid<\/div>/);
});

// ---------------------------------------------------------------------------
// 8. heading-order Tests (Document-level rule, caution)
// ---------------------------------------------------------------------------

test('HeadingOrderRule: detects skipped heading levels in full document', () => {
  const raw = `<h1>Title</h1><h3>Skipped to H3</h3><h2>Valid H2</h2><h5>Skipped to H5</h5>`;
  const cst = parse(raw);
  const rule = new HeadingOrderRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 2);
  assert.equal(rule.scope, 'document');
  assert.equal(diagnostics[0].safety, 'caution');

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  assert.match(fixed, /<h2>Skipped to H3<\/h2>/);
  assert.match(fixed, /<h3>Skipped to H5<\/h3>/);
});

// ---------------------------------------------------------------------------
// 9. landmark-one-main Tests (Document-level rule, caution)
// ---------------------------------------------------------------------------

test('LandmarkOneMainRule: flags duplicate <main> landmarks', () => {
  const raw = `<body><main>Main 1</main><main>Main 2</main></body>`;
  const cst = parse(raw);
  const rule = new LandmarkOneMainRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  assert.equal(rule.scope, 'document');
  assert.match(diagnostics[0].message, /Multiple <main> landmarks detected/);
});

test('LandmarkOneMainRule: single <main> landmark produces no violations', () => {
  const raw = `<body><header>Nav</header><main>Content</main><footer>Footer</footer></body>`;
  const cst = parse(raw);
  const rule = new LandmarkOneMainRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 0);
});

// ---------------------------------------------------------------------------
// 10. Scope Filtering Tests in RuleRegistry
// ---------------------------------------------------------------------------

test('RuleRegistry: scope: "element" filters out document-level rules', () => {
  const templateSnippet = `<h1>Title</h1><h3>Skipped</h3><main>P1</main><main>P2</main><img src="test.jpg">`;
  const cst = parse(templateSnippet);
  const registry = new RuleRegistry();

  // 1. Agent mode: scope: 'element'
  const agentDiagnostics = registry.evaluate(cst, { scope: 'element' });

  // Only img-alt should fire; heading-order and landmark-one-main are skipped
  const ruleIds = agentDiagnostics.map(d => d.ruleId);
  assert.ok(ruleIds.includes('img-alt'));
  assert.ok(!ruleIds.includes('heading-order'));
  assert.ok(!ruleIds.includes('landmark-one-main'));

  // 2. Studio Playground mode: scope: 'all'
  const studioDiagnostics = registry.evaluate(cst, { scope: 'all' });
  const studioRuleIds = studioDiagnostics.map(d => d.ruleId);

  assert.ok(studioRuleIds.includes('img-alt'));
  assert.ok(studioRuleIds.includes('heading-order'));
  assert.ok(studioRuleIds.includes('landmark-one-main'));
});
