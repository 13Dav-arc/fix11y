import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCore } from './sync-core.js';

test('syncCore --check succeeds when vendored core copies match source', () => {
  const result = syncCore({ check: true });
  assert.equal(result.success, true);
  assert.ok(typeof result.treeHash === 'string' && result.treeHash.length === 64);
});
