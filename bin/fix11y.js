#!/usr/bin/env node

/**
 * fix11y - CLI Executable Entry Point.
 * Zero external dependencies (Native Node.js v20+ LTS standard library only).
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { defaultRegistry, remediate } from '../src/rules/index.js';
import { createUnifiedDiff } from '../src/ui/diff.js';
import { formatTerminalReport, formatJsonReport, shouldUseColor } from '../src/ui/reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED_EXTENSIONS = new Set(['.html', '.htm', '.mustache', '.hbs', '.handlebars']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache']);

/**
 * Recursively discovers supported template and HTML files.
 * @param {string[]} targetPaths
 * @returns {string[]}
 */
export function findTargetFiles(targetPaths) {
  const found = [];
  const pathsToScan = targetPaths && targetPaths.length > 0 ? targetPaths : ['.'];

  for (const inputPath of pathsToScan) {
    if (!fs.existsSync(inputPath)) {
      continue;
    }

    const stat = fs.statSync(inputPath);
    if (stat.isFile()) {
      const ext = path.extname(inputPath).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        found.push(path.resolve(inputPath));
      }
    } else if (stat.isDirectory()) {
      function walkDir(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) {
              walkDir(path.join(currentDir, entry.name));
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.has(ext)) {
              found.push(path.resolve(path.join(currentDir, entry.name)));
            }
          }
        }
      }
      walkDir(inputPath);
    }
  }

  return Array.from(new Set(found));
}

function printHelp() {
  console.log(`
fix11y ⚡ Automated Accessibility Remediation Engine

Usage:
  npx fix11y [paths...] [options]

Options:
  -f, --fix              Interactively review diffs and apply surgical patches to files
  -y, --yes              Automatically accept all fixes without interactive prompt (for scripted use)
  --ci                   CI mode: scans without writing and exits with non-zero code on violations
  --safety <safe|all>    Filter remediation by safety tier (default: 'all')
  --json                 Output diagnostic results as structured JSON to stdout
  -h, --help             Display this help message
  -v, --version          Display version information

Examples:
  npx fix11y ./src                    # Audit files in ./src
  npx fix11y ./src --fix              # Interactively fix violations with unified diff approval
  npx fix11y ./templates --ci         # Run as CI quality gate
  npx fix11y ./src --safety safe -y   # Auto-apply only safe fixes across all files
`);
}

function printVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    console.log(`fix11y v${pkg.version}`);
  } catch {
    console.log('fix11y v0.1.0');
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        fix: { type: 'boolean', short: 'f', default: false },
        yes: { type: 'boolean', short: 'y', default: false },
        ci: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        safety: { type: 'string', default: 'all' },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false }
      },
      allowPositionals: true
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    printHelp();
    return 1;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    printHelp();
    return 0;
  }

  if (values.version) {
    printVersion();
    return 0;
  }

  const safetyLevels = values.safety === 'safe' ? ['safe'] : ['safe', 'caution'];
  const targetFiles = findTargetFiles(positionals);

  if (targetFiles.length === 0) {
    if (values.json) {
      console.log(formatJsonReport([]));
    } else {
      console.log('No matching HTML or template files (.html, .htm, .mustache, .hbs) found.');
    }
    return 0;
  }

  const fileResults = [];
  let totalViolations = 0;

  for (const filePath of targetFiles) {
    const relativePath = path.relative(process.cwd(), filePath) || filePath;
    const content = fs.readFileSync(filePath, 'utf-8');

    const result = remediate(content, { safetyLevels }, { filepath: filePath });
    totalViolations += result.diagnostics.length;

    fileResults.push({
      file: relativePath,
      absolutePath: filePath,
      original: content,
      patched: result.patched,
      diagnostics: result.diagnostics,
      patches: result.patches
    });
  }

  // 1. JSON Output mode
  if (values.json) {
    console.log(formatJsonReport(fileResults));
    if (values.ci && totalViolations > 0) {
      return 1;
    }
    return 0;
  }

  // 2. Interactive or Auto-Fix mode (--fix / -f / -y)
  if (values.fix || values.yes) {
    let autoApplyAll = values.yes;
    let filesModified = 0;
    let patchesApplied = 0;

    let rl = null;
    if (!autoApplyAll && process.stdin.isTTY) {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    } else if (!autoApplyAll) {
      // Non-interactive fallback: auto-apply all if stdin is not a TTY
      autoApplyAll = true;
    }

    try {
      for (const res of fileResults) {
        if (res.patches.length === 0) continue;

        const diffOutput = createUnifiedDiff(res.original, res.patched, {
          fromFile: `a/${res.file}`,
          toFile: `b/${res.file} (remediated)`
        });

        console.log(`\n${diffOutput}\n`);

        let applyThis = autoApplyAll;

        if (!autoApplyAll && rl) {
          const answer = (
            await rl.question(`Apply this fix to ${res.file}? [y]es / [n]o / [a]ll / [q]uit: `)
          )
            .trim()
            .toLowerCase();

          if (answer === 'q' || answer === 'quit') {
            console.log('\nRemediation aborted.');
            break;
          } else if (answer === 'a' || answer === 'all') {
            autoApplyAll = true;
            applyThis = true;
          } else if (answer === 'y' || answer === 'yes' || answer === '') {
            applyThis = true;
          } else {
            applyThis = false;
          }
        }

        if (applyThis) {
          fs.writeFileSync(res.absolutePath, res.patched, 'utf-8');
          filesModified++;
          patchesApplied += res.patches.length;
          console.log(`✔ Applied ${res.patches.length} patch(es) to ${res.file}`);
        } else {
          console.log(`- Skipped ${res.file}`);
        }
      }
    } finally {
      if (rl) rl.close();
    }

    console.log(`\n🎉 Done! Remediated ${filesModified} file(s) (${patchesApplied} patch(es) applied).`);
    return 0;
  }

  // 3. Standard Audit / CI mode
  console.log(formatTerminalReport(fileResults));

  if (values.ci && totalViolations > 0) {
    return 1;
  }

  return 0;
}

// Execute if run directly from CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runCli().then((code) => {
    process.exit(code);
  });
}
