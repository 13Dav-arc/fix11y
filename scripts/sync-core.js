import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const SOURCE_DIR = path.resolve(ROOT, 'packages/core/src');

/**
 * Resolves target directory from candidate paths without throwing on undefined.
 */
export function resolveTarget(dirCandidates = []) {
  const valid = dirCandidates.filter(Boolean);
  for (const cand of valid) {
    if (fs.existsSync(cand)) {
      return path.resolve(cand);
    }
  }
  return valid.length > 0 ? path.resolve(valid[0]) : null;
}

/**
 * Computes SHA-256 hash of a file.
 */
function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively scans directory and returns map of relative paths to hashes.
 */
function getDirectoryHashMap(dir, base = dir, map = {}) {
  if (!fs.existsSync(dir)) return map;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      getDirectoryHashMap(full, base, map);
    } else if (entry.isFile() && entry.name !== 'VENDOR_MANIFEST.json') {
      map[rel] = hashFile(full);
    }
  }
  return map;
}

/**
 * Computes a deterministic single tree hash from a hash map.
 */
function computeTreeHash(hashMap) {
  const sortedKeys = Object.keys(hashMap).sort();
  const hasher = crypto.createHash('sha256');
  for (const key of sortedKeys) {
    hasher.update(`${key}:${hashMap[key]}\n`);
  }
  return hasher.digest('hex');
}

/**
 * Gets current git commit SHA.
 */
function getGitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown-commit';
  }
}

/**
 * Recursively copies a directory.
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Main synchronizer / verifier function.
 */
export function syncCore(options = {}) {
  const checkOnly = options.check || process.argv.includes('--check');
  const requireSiblings = options.requireSiblings ?? (process.env.FIX11Y_REQUIRE_SIBLINGS === 'true');

  const runnerDir = options.runnerDir ?? resolveTarget([
    process.env.FIX11Y_RUNNER_DIR,
    path.resolve(ROOT, 'fix11y-runner/src/core'),
    path.resolve(ROOT, '../fix11y-runner/src/core'),
  ]);

  const actionDir = options.actionDir ?? resolveTarget([
    process.env.FIX11Y_ACTION_DIR,
    path.resolve(ROOT, 'fix11y-action/src/core'),
    path.resolve(ROOT, '../fix11y-action/src/core'),
  ]);

  const targets = options.targets || [
    { name: 'fix11y-runner', dir: runnerDir },
    { name: 'fix11y-action', dir: actionDir },
  ];

  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Source core directory not found: ${SOURCE_DIR}`);
  }

  const sourceHashes = getDirectoryHashMap(SOURCE_DIR);
  const sourceTreeHash = computeTreeHash(sourceHashes);

  let hasDivergence = false;
  const divergences = [];
  let checkedCount = 0;

  for (const target of targets) {
    if (!target.dir || !fs.existsSync(target.dir)) {
      if (requireSiblings) {
        hasDivergence = true;
        divergences.push(`${target.name}: directory does not exist at ${target.dir || 'unresolved'}`);
      } else {
        console.log(`[INFO] Sibling repo ${target.name} not found (${target.dir || 'unresolved'}) — skipping core sync check in local dev.`);
      }
      continue;
    }

    checkedCount++;
    const targetHashes = getDirectoryHashMap(target.dir);
    const targetTreeHash = computeTreeHash(targetHashes);

    if (sourceTreeHash !== targetTreeHash) {
      hasDivergence = true;
      // Find specific divergent files
      const allKeys = new Set([...Object.keys(sourceHashes), ...Object.keys(targetHashes)]);
      for (const key of allKeys) {
        if (sourceHashes[key] !== targetHashes[key]) {
          divergences.push(`${target.name}/${key}: ${sourceHashes[key] ? 'modified/missing' : 'extraneous'}`);
        }
      }
    }
  }

  if (checkOnly) {
    if (hasDivergence) {
      console.error('[ERROR] Vendored core divergence detected between packages/core/src and sibling repos:');
      for (const d of divergences) {
        console.error(`  - ${d}`);
      }
      console.error('\nRun "npm run sync:core" from the monorepo root to synchronize all copies.');
      return { success: false, divergences };
    }

    if (checkedCount === 0) {
      console.log('[INFO] No sibling repos found — core sync check skipped.');
      return { success: true, skipped: true, treeHash: sourceTreeHash };
    }

    console.log('[SUCCESS] All vendored core copies are identical to packages/core/src.');
    return { success: true, treeHash: sourceTreeHash, checkedCount };
  }

  // Sync mode: copy and generate manifest
  console.log('[START] Synchronizing @fix11y/core into sibling repositories...');
  const gitSha = getGitSha();
  const manifest = {
    coreVersion: '0.1.0',
    sourceCommit: gitSha,
    syncedAt: new Date().toISOString(),
    treeHash: sourceTreeHash,
  };

  for (const target of targets) {
    if (!target.dir) {
      console.warn(`[WARNING] Skipping sync for ${target.name} — unresolved path.`);
      continue;
    }
    console.log(`[INFO] Syncing to ${target.name} (${target.dir})...`);
    copyDirSync(SOURCE_DIR, target.dir);
    fs.writeFileSync(
      path.join(target.dir, 'VENDOR_MANIFEST.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
  }

  console.log(`[SUCCESS] Synchronized @fix11y/core (commit ${gitSha.slice(0, 7)}, hash ${sourceTreeHash.slice(0, 8)}) to all repos.`);
  return { success: true, treeHash: sourceTreeHash };
}

// Direct execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/sync-core.js')) {
  const isCheck = process.argv.includes('--check');
  const res = syncCore({ check: isCheck });
  if (!res.success) {
    process.exit(1);
  }
}
