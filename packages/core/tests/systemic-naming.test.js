import test from 'node:test';
import assert from 'node:assert/strict';

import { parse } from '../src/parser/parser.js';
import { applyPatches } from '../src/parser/patcher.js';
import {
  ImgAltRule,
  ButtonSemanticsRule,
  EmptyLinkRule,
  FormLabelRule
} from '../src/rules/index.js';
import {
  classifyImage,
  deriveAccessibleName,
  isBlocklisted,
  GENERIC_LABEL_BLOCKLIST
} from '../src/rules/naming.js';

test('Systemic Naming — Tri-state image classification', () => {
  // Decorative
  const decorativeCst = parse('<img src="spacer.gif" class="spacer">');
  const decorativeImg = decorativeCst.children[0];
  assert.equal(classifyImage(decorativeImg), 'decorative');

  const presRoleCst = parse('<img src="random.png" role="presentation">');
  assert.equal(classifyImage(presRoleCst.children[0]), 'decorative');

  // Meaningful
  const logoCst = parse('<header><img src="assets/site-logo.svg" class="brand-logo"></header>');
  const logoImg = logoCst.children[0].children[0];
  assert.equal(classifyImage(logoImg), 'meaningful');

  const soleChildLinkCst = parse('<a href="/"><img src="item.png"></a>');
  const linkImg = soleChildLinkCst.children[0].children[0];
  assert.equal(classifyImage(linkImg), 'meaningful');

  // Unknown (no signal either way)
  const unknownCst = parse('<img src="photo.jpg">');
  const unknownImg = unknownCst.children[0];
  assert.equal(classifyImage(unknownImg), 'unknown');
});

test('ImgAltRule — "no signal either way" scenario does NOT receive alt=""', () => {
  const raw = '<section><img src="photo.jpg"></section>';
  const cst = parse(raw);
  const rule = new ImgAltRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.ruleId, 'img-alt');
  assert.equal(diag.safety, 'caution');
  // CRITICAL ASSERTION: No patches generated, does NOT inject alt=""
  assert.equal(diag.patches.length, 0);

  // Applying patches produces 0 mutations on the untouched source
  const patched = applyPatches(raw, diag.patches);
  assert.equal(patched, raw);
  assert.ok(!patched.includes('alt=""'));
});

test('ImgAltRule — logo image receives meaningful alt and NEVER alt=""', () => {
  const raw = '<header><img src="/images/logo.svg" class="site-logo"></header>';
  const cst = parse(raw);
  const rule = new ImgAltRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.ruleId, 'img-alt');
  assert.equal(diag.safety, 'caution');
  assert.equal(diag.patches.length, 1);

  const patched = applyPatches(raw, diag.patches);
  assert.ok(patched.includes('alt="Logo"'));
  assert.ok(!patched.includes('alt=""'));
});

test('ButtonSemanticsRule — notification button receives aria-label="Notifications" and NEVER "Action"', () => {
  const raw = '<button class="notification-btn"><svg class="bell"><path d="M10..."/></svg></button>';
  const cst = parse(raw);
  const rule = new ButtonSemanticsRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.patches.length, 1);

  const patched = applyPatches(raw, diag.patches);
  // CRITICAL ASSERTION: Correctly maps bell/notification to "Notifications", never "Action"
  assert.ok(patched.includes('aria-label="Notifications"'));
  assert.ok(!patched.includes('aria-label="Action"'));
});

test('ButtonSemanticsRule — icon button with onclick="openNotifications()" receives aria-label="Notifications"', () => {
  // Exact pattern from 13Dav-arc/fix11y-demo-target index.html
  const raw = '<button class="icon-button" onclick="openNotifications()"><svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg></button>';
  const cst = parse(raw);
  const rule = new ButtonSemanticsRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.patches.length, 1);

  const patched = applyPatches(raw, diag.patches);
  assert.ok(patched.includes('aria-label="Notifications"'));
  assert.ok(!patched.includes('aria-label="Action"'));
});

test('ButtonSemanticsRule — button with no signals or only generic cues does NOT receive "Action"', () => {
  // Pure unlabelled button with no text, class, or icon hints
  const raw = '<button><svg><path d="M0 0"/></svg></button>';
  const cst = parse(raw);
  const rule = new ButtonSemanticsRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.safety, 'caution');
  // CRITICAL ASSERTION: Blocklist suppresses "Action" and generates zero patches
  assert.equal(diag.patches.length, 0);

  const patched = applyPatches(raw, diag.patches);
  assert.equal(patched, raw);
  assert.ok(!patched.includes('aria-label="Action"'));
});

test('ButtonSemanticsRule — legitimate <button type="submit"> derives "Submit" without blocklist suppression', () => {
  const raw = '<form><button type="submit" class="btn"></button></form>';
  const cst = parse(raw);
  const rule = new ButtonSemanticsRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.patches.length, 1);

  const patched = applyPatches(raw, diag.patches);
  // CRITICAL ASSERTION: Submit is NOT suppressed on a legitimate submit button
  assert.ok(patched.includes('aria-label="Submit"'));
});

test('EmptyLinkRule — uninformative href (#, javascript:void) suppresses "Link" and emits NO patch', () => {
  const raw = '<a href="#" class="btn"></a>';
  const cst = parse(raw);
  const rule = new EmptyLinkRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.safety, 'caution');
  // CRITICAL ASSERTION: "Link" is blocklisted and emits zero patches
  assert.equal(diag.patches.length, 0);

  const patched = applyPatches(raw, diag.patches);
  assert.equal(patched, raw);
  assert.ok(!patched.includes('aria-label="Link"'));
});

test('EmptyLinkRule — meaningful href or child icon derives accessible name', () => {
  const raw = '<a href="/contact-us"></a>';
  const cst = parse(raw);
  const rule = new EmptyLinkRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.patches.length, 1);

  const patched = applyPatches(raw, diag.patches);
  assert.ok(patched.includes('aria-label="Contact Us"'));
});

test('FormLabelRule — unlabelled input with no hints suppresses generic "Input Field" patch', () => {
  const raw = '<form><input type="text"></form>';
  const cst = parse(raw);
  const rule = new FormLabelRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 1);
  const diag = diagnostics[0];
  assert.equal(diag.safety, 'caution');
  // CRITICAL ASSERTION: "Input Field" is blocklisted and emits zero patches
  assert.equal(diag.patches.length, 0);

  const patched = applyPatches(raw, diag.patches);
  assert.equal(patched, raw);
  assert.ok(!patched.includes('aria-label="Input Field"'));
});

test('Blocklist Guard — isBlocklisted() rejects all generic tokens and respects context', () => {
  for (const banned of GENERIC_LABEL_BLOCKLIST) {
    assert.equal(isBlocklisted(banned), true, `Expected "${banned}" to be blocklisted`);
    assert.equal(isBlocklisted(banned.toUpperCase()), true, `Expected uppercase "${banned}" to be blocklisted`);
    assert.equal(isBlocklisted(`  ${banned}  `), true, `Expected padded "${banned}" to be blocklisted`);
  }

  // 'submit' is allowed for buttons, but blocklisted for images
  assert.equal(isBlocklisted('Submit', { type: 'button' }), false);
  assert.equal(isBlocklisted('Submit', { type: 'image' }), true);
});
