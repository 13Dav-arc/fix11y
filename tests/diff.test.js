import test from 'node:test';
import assert from 'node:assert/strict';
import { myersDiff, createUnifiedDiff, splitLines } from '../src/ui/diff.js';

test('myersDiff detects line additions, deletions, and equalities', () => {
  const oldLines = ['line 1', 'line 2', 'line 3'];
  const newLines = ['line 1', 'line 2 modified', 'line 3', 'line 4'];

  const edits = myersDiff(oldLines, newLines);

  assert.ok(edits.length > 0);
  assert.equal(edits[0].type, 'eq');
  assert.equal(edits[0].value, 'line 1');

  const del = edits.find((e) => e.type === 'del');
  assert.ok(del);
  assert.equal(del.value, 'line 2');

  const addModified = edits.find((e) => e.type === 'add' && e.value === 'line 2 modified');
  assert.ok(addModified);

  const add4 = edits.find((e) => e.type === 'add' && e.value === 'line 4');
  assert.ok(add4);
});

test('createUnifiedDiff outputs standard unified diff format without color', () => {
  const original = '<div class="card">\n  <img src="pic.jpg">\n</div>';
  const modified = '<div class="card">\n  <img src="pic.jpg" alt="">\n</div>';

  const diff = createUnifiedDiff(original, modified, {
    fromFile: 'a/card.html',
    toFile: 'b/card.html',
    color: false
  });

  assert.ok(diff.includes('--- a/card.html'));
  assert.ok(diff.includes('+++ b/card.html'));
  assert.ok(diff.includes('@@ -1,3 +1,3 @@'));
  assert.ok(diff.includes('-   <img src="pic.jpg">'));
  assert.ok(diff.includes('+   <img src="pic.jpg" alt="">'));
  assert.ok(diff.includes(' <div class="card">'));
});

test('createUnifiedDiff returns empty string when strings are identical', () => {
  const text = '<p>No changes here</p>';
  const diff = createUnifiedDiff(text, text);
  assert.equal(diff, '');
});

test('splitLines normalizes across CRLF and LF', () => {
  const lf = 'a\nb\nc';
  const crlf = 'a\r\nb\r\nc';

  assert.deepEqual(splitLines(lf), ['a', 'b', 'c']);
  assert.deepEqual(splitLines(crlf), ['a', 'b', 'c']);
});
