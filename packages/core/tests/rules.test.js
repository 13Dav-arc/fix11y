import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from '../src/parser/parser.js';
import { applyPatches } from '../src/parser/patcher.js';
import {
  ImgAltRule,
  FormLabelRule,
  ButtonSemanticsRule,
  AriaLiveStatusRule,
  remediate,
  evaluateRules
} from '../src/rules/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFixture(filename) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf-8');
}

test('ImgAltRule detects missing alt attributes and injects contextual alt attributes', () => {
  const raw = loadFixture('img-alt.raw.html');
  const expected = loadFixture('img-alt.fixed.html');

  const cst = parse(raw);
  const rule = new ImgAltRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].ruleId, 'img-alt');
  assert.equal(diagnostics[0].safety, 'caution'); // meaningful image with derived name

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  assert.equal(fixed, expected);
});

test('FormLabelRule generates deterministic ID pairing and aria-label', () => {
  const raw = loadFixture('form-label.raw.html');
  const expected = loadFixture('form-label.fixed.html');

  const cst = parse(raw);
  const rule = new FormLabelRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].ruleId, 'form-label');

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  assert.equal(fixed, expected);
});

test('ButtonSemanticsRule transforms non-semantic elements and adds accessible names', () => {
  const raw = loadFixture('button-semantics.raw.html');
  const expected = loadFixture('button-semantics.fixed.html');

  const cst = parse(raw);
  const rule = new ButtonSemanticsRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 3);
  assert.equal(diagnostics[0].safety, 'caution'); // tag swap is review-advised

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  assert.equal(fixed, expected);
});

test('AriaLiveStatusRule adds aria-live and role to dynamic status/alert regions', () => {
  const raw = loadFixture('aria-live-status.raw.html');
  const expected = loadFixture('aria-live-status.fixed.html');

  const cst = parse(raw);
  const rule = new AriaLiveStatusRule();
  const diagnostics = rule.evaluate(cst);

  assert.equal(diagnostics.length, 2);

  const patches = diagnostics.flatMap(d => d.patches);
  const fixed = applyPatches(raw, patches);

  assert.equal(fixed, expected);
});

test('remediate() applies multi-rule fixes to Mustache template losslessly', () => {
  const raw = loadFixture('mustache-template.raw.mustache');
  const expected = loadFixture('mustache-template.fixed.mustache');

  const result = remediate(raw);

  assert.ok(result.diagnostics.length > 0);
  assert.equal(result.patched, expected);
  // Ensure template tags remain intact
  assert.ok(result.patched.includes('{{#if isFeatured}}featured{{/if}}'));
  assert.ok(result.patched.includes('{{#if user.hasEmail}}'));
});

test('remediate() respects safety level filtering (safe only vs caution)', () => {
  const source = '<img src="spacer.gif" class="spacer"><div onclick="submit()">Submit</div>';
  
  // Safe only (should fix decorative img with alt="", but skip div tag swap)
  const safeOnly = remediate(source, { safetyLevels: ['safe'] });
  assert.ok(safeOnly.patched.includes('<img src="spacer.gif" class="spacer" alt="">'));
  assert.ok(safeOnly.patched.includes('<div onclick="submit()">Submit</div>'));

  // All safety levels (should fix both)
  const allLevels = remediate(source, { safetyLevels: ['safe', 'caution'] });
  assert.ok(allLevels.patched.includes('<img src="spacer.gif" class="spacer" alt="">'));
  assert.ok(allLevels.patched.includes('<button onclick="submit()"'));
});
