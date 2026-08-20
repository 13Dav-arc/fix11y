import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const binPath = path.resolve(__dirname, '..', 'bin', 'fix11y.js');

test('CLI --help outputs usage information and exits 0', async () => {
  const { stdout } = await execFileAsync(process.execPath, [binPath, '--help']);
  assert.ok(stdout.includes('fix11y ⚡ Automated Accessibility Remediation Engine'));
  assert.ok(stdout.includes('Usage:'));
  assert.ok(stdout.includes('--fix'));
  assert.ok(stdout.includes('--ci'));
});

test('CLI --version outputs version and exits 0', async () => {
  const { stdout } = await execFileAsync(process.execPath, [binPath, '--version']);
  assert.ok(stdout.includes('fix11y v'));
});

test('CLI audit scan reports violations with exit code 0 in default mode', async () => {
  const targetFile = path.resolve(__dirname, 'fixtures', 'img-alt.raw.html');
  const { stdout } = await execFileAsync(process.execPath, [binPath, targetFile]);

  assert.ok(stdout.includes('fix11y Accessibility Audit Report'));
  assert.ok(stdout.includes('img-alt'));
});

test('CLI --ci exits with code 1 when violations exist', async () => {
  const targetFile = path.resolve(__dirname, 'fixtures', 'img-alt.raw.html');

  await assert.rejects(
    async () => {
      await execFileAsync(process.execPath, [binPath, targetFile, '--ci']);
    },
    (err) => {
      assert.equal(err.code, 1);
      assert.ok(err.stdout.includes('img-alt'));
      return true;
    }
  );
});

test('CLI --ci exits with code 0 when all files are compliant', async () => {
  const cleanFile = path.resolve(__dirname, 'fixtures', 'img-alt.fixed.html');
  const { stdout } = await execFileAsync(process.execPath, [binPath, cleanFile, '--ci']);

  assert.ok(stdout.includes('WCAG 2.1 AA compliant'));
});

test('CLI --json outputs parseable JSON payload', async () => {
  const targetFile = path.resolve(__dirname, 'fixtures', 'form-label.raw.html');
  const { stdout } = await execFileAsync(process.execPath, [binPath, targetFile, '--json']);

  const json = JSON.parse(stdout);
  assert.ok(json.summary);
  assert.equal(json.summary.filesScanned, 1);
  assert.ok(json.summary.totalViolations > 0);
  assert.ok(json.files.length === 1);
  assert.equal(json.files[0].violations[0].ruleId, 'form-label');
});

test('CLI --fix with auto-accept (-y) remediates file on disk', async () => {
  const tempDir = path.resolve(__dirname, '..', 'scratch');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempFile = path.join(tempDir, 'temp-button-test.html');
  const rawContent = '<div onclick="login()" class="btn">Login</div>';
  fs.writeFileSync(tempFile, rawContent, 'utf-8');

  // Run fix with -y
  const { stdout } = await execFileAsync(process.execPath, [binPath, tempFile, '--fix', '-y']);
  assert.ok(stdout.includes('Applied'));

  // Verify file on disk was modified to <button>
  const fixedContent = fs.readFileSync(tempFile, 'utf-8');
  assert.equal(fixedContent, '<button onclick="login()" class="btn" type="button">Login</button>');

  // Verify subsequent CI scan is 100% clean (exit code 0)
  const ciCheck = await execFileAsync(process.execPath, [binPath, tempFile, '--ci']);
  assert.ok(ciCheck.stdout.includes('WCAG 2.1 AA compliant'));

  // Clean up
  fs.unlinkSync(tempFile);
});
