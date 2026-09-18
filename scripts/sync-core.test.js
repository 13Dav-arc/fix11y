import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { syncCore, resolveTarget } from './sync-core.js';

test('resolveTarget filters undefined/falsy candidates and does not throw', () => {
  const resolved = resolveTarget([undefined, null, '', 'packages/core/src']);
  assert.ok(resolved);
  assert.ok(resolved.endsWith(path.join('packages', 'core', 'src')));

  const empty = resolveTarget([undefined, null, '']);
  assert.equal(empty, null);
});

test('syncCore --check fails when siblings are absent and requireSiblings=true', () => {
  const nonExistentDir = path.resolve('non_existent_sibling_dir_xyz');
  const result = syncCore({
    check: true,
    requireSiblings: true,
    targets: [{ name: 'mock-runner', dir: nonExistentDir }],
  });

  assert.equal(result.success, false);
  assert.ok(Array.isArray(result.divergences));
  assert.ok(result.divergences.some((d) => d.includes('mock-runner: directory does not exist')));
});

test('syncCore --check skips cleanly when siblings are absent and requireSiblings is false', () => {
  const nonExistentDir = path.resolve('non_existent_sibling_dir_xyz');
  const result = syncCore({
    check: true,
    requireSiblings: false,
    targets: [{ name: 'mock-runner', dir: nonExistentDir }],
  });

  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
});

test('syncCore --check succeeds when vendored core copies match source', () => {
  const result = syncCore({ check: true });
  assert.equal(result.success, true);
  assert.ok(typeof result.treeHash === 'string' && result.treeHash.length === 64);
});
