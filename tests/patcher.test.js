import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, getElementsByTagName } from '../src/parser/parser.js';
import {
  applyPatches,
  createInsertAttributePatch,
  createUpdateAttributePatch,
  createRemoveAttributePatch,
  createSwapTagNamePatch,
  createWrapNodePatch
} from '../src/parser/patcher.js';

test('applyPatches applies non-overlapping surgical string splices cleanly', () => {
  const original = '<div class="btn">Click me</div>';
  const patches = [
    { startOffset: 1, endOffset: 4, replacement: 'button' },
    { startOffset: 27, endOffset: 30, replacement: 'button' }
  ];

  const result = applyPatches(original, patches);
  assert.equal(result, '<button class="btn">Click me</button>');
});

test('100% preservation of untouched whitespace, quotes, comments, and newlines', () => {
  const original = [
    '<!-- Header Section -->',
    '<div   class=\'custom-container\'   id="main-div">',
    '  <img  src="avatar.png"  >',
    '  {{#if showName}}<span>{{user.name}}</span>{{/if}}',
    '</div>'
  ].join('\r\n');

  const cst = parse(original);
  const img = getElementsByTagName(cst, 'img')[0];
  const patch = createInsertAttributePatch(img, 'alt', '');

  const patched = applyPatches(original, [patch]);

  // Image tag receives alt="" while keeping extra spaces, comments, and CRLF untouched
  assert.ok(patched.includes('<img  src="avatar.png" alt=""  >'));
  assert.ok(patched.startsWith('<!-- Header Section -->\r\n<div   class=\'custom-container\''));
  assert.ok(patched.includes('{{#if showName}}<span>{{user.name}}</span>{{/if}}'));
});

test('Detects and rejects overlapping patches', () => {
  const original = '<div class="card">Hello</div>';
  const overlapping = [
    { startOffset: 0, endOffset: 10, replacement: '<section' },
    { startOffset: 5, endOffset: 15, replacement: 'role="main"' }
  ];

  assert.throws(() => {
    applyPatches(original, overlapping);
  }, /Overlapping patches detected/);
});

test('createInsertAttributePatch on self-closing and regular void tags', () => {
  const source = '<input type="text" name="email" />';
  const cst = parse(source);
  const input = cst.children[0];

  const patch = createInsertAttributePatch(input, 'id', 'email-input');
  const result = applyPatches(source, [patch]);

  assert.equal(result, '<input type="text" name="email" id="email-input" />');
});

test('createUpdateAttributePatch modifies attribute preserving quotation style', () => {
  const source = '<img src="logo.png" alt=\'old description\' />';
  const cst = parse(source);
  const img = cst.children[0];

  const patch = createUpdateAttributePatch(img, 'alt', 'Company Logo');
  const result = applyPatches(source, [patch]);

  assert.equal(result, '<img src="logo.png" alt=\'Company Logo\' />');
});

test('createRemoveAttributePatch removes targeted attribute', () => {
  const source = '<button type="button" aria-hidden="true">Action</button>';
  const cst = parse(source);
  const btn = cst.children[0];

  const patch = createRemoveAttributePatch(btn, 'aria-hidden');
  const result = applyPatches(source, [patch]);

  assert.equal(result, '<button type="button" >Action</button>');
});

test('createSwapTagNamePatch swaps both opening and closing tags', () => {
  const source = '<div onclick="doSomething()" class="interactive">\n  <span>Click</span>\n</div>';
  const cst = parse(source);
  const div = cst.children[0];

  const patches = createSwapTagNamePatch(div, 'button');
  const result = applyPatches(source, patches);

  assert.equal(
    result,
    '<button onclick="doSomething()" class="interactive">\n  <span>Click</span>\n</button>'
  );
});

test('createWrapNodePatch wraps node with before and after markup', () => {
  const source = '<input type="text" id="username">';
  const cst = parse(source);
  const input = cst.children[0];

  const patches = createWrapNodePatch(input, '<label for="username">Username: ', '</label>');
  const result = applyPatches(source, patches);

  assert.equal(result, '<label for="username">Username: <input type="text" id="username"></label>');
});
