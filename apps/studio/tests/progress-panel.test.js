import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STAGE_LIVENESS_THRESHOLDS_MS } from '../src/hooks/useAgentProgress.js';

describe('Phase 4: ProgressPanel & useAgentProgress State Machine', () => {
  const panelPath = fileURLToPath(new URL('../src/components/ProgressPanel.jsx', import.meta.url));
  const hookPath = fileURLToPath(new URL('../src/hooks/useAgentProgress.js', import.meta.url));

  it('verifies that component and hook files exist', () => {
    assert.ok(fs.existsSync(panelPath), 'ProgressPanel.jsx must exist');
    assert.ok(fs.existsSync(hookPath), 'useAgentProgress.js must exist');
  });

  describe('Stage-Adaptive Liveness Thresholds (useAgentProgress)', () => {
    it('defines explicit threshold headroom below job timeouts', () => {
      // Job 1 (patch) timeout is 15m (900,000ms) -> warning at 10m (600,000ms) -> 33% headroom
      assert.equal(STAGE_LIVENESS_THRESHOLDS_MS.atomic_file_fix, 600_000);

      // Job 2 (verify) timeout is 10m (600,000ms) -> warning at 7m (420,000ms) -> 30% headroom
      assert.equal(STAGE_LIVENESS_THRESHOLDS_MS.verify_build, 420_000);

      // Job 3 (resolve) timeout is 5m (300,000ms) -> warning at 3m (180,000ms) -> 40% headroom
      assert.equal(STAGE_LIVENESS_THRESHOLDS_MS.resolve, 180_000);
      assert.equal(STAGE_LIVENESS_THRESHOLDS_MS.open_pr, 180_000);

      // Cold start runner provisioning
      assert.equal(STAGE_LIVENESS_THRESHOLDS_MS.provisioning_runner, 120_000);

      // Default fallback threshold
      assert.equal(STAGE_LIVENESS_THRESHOLDS_MS.default, 300_000);
    });

    it('implements dismissWarning and visibility listener hooks in useAgentProgress', () => {
      const hookContent = fs.readFileSync(hookPath, 'utf8');

      // Page Visibility API support
      assert.match(hookContent, /document\.hidden/, 'Must check document.hidden');
      assert.match(hookContent, /visibilitychange/, 'Must listen for visibilitychange events');

      // Dismissible warning handler
      assert.match(hookContent, /dismissWarning/, 'Must export dismissWarning callback');
      assert.match(hookContent, /warningDismissed/, 'Must track warningDismissed state');

      // Adaptive threshold calculation
      assert.match(hookContent, /STAGE_LIVENESS_THRESHOLDS_MS\[/, 'Must query stage-adaptive thresholds table');
    });
  });

  describe('ProgressPanel Milestones and Component Architecture', () => {
    const panelContent = fs.readFileSync(panelPath, 'utf8');

    it('exports STEPS with all 6 sequential milestones', () => {
      assert.match(panelContent, /export const STEPS = \[/, 'Must export STEPS array');
      const expectedSteps = [
        'provisioning_runner',
        'init_sandbox',
        'initial_audit',
        'atomic_file_fix',
        'verify_build',
        'open_pr',
      ];

      for (const stepId of expectedSteps) {
        assert.ok(panelContent.includes(`id: '${stepId}'`), `STEPS must include step: ${stepId}`);
      }
    });

    it('implements WCAG 2.2 AA live announcer and progressbar landmarks', () => {
      // Live announcer for screen readers
      assert.match(panelContent, /role="status"/, 'Must contain role="status" live region');
      assert.match(panelContent, /aria-live="polite"/, 'Must announce asynchronously with aria-live="polite"');
      assert.match(panelContent, /sr-only/, 'Live announcer must use sr-only styling');

      // Progress bar landmark with ARIA attributes
      assert.match(panelContent, /role="progressbar"/, 'Must contain role="progressbar"');
      assert.match(panelContent, /aria-valuenow=/, 'Must declare aria-valuenow');
      assert.match(panelContent, /aria-valuemin="0"/, 'Must declare aria-valuemin="0"');
      assert.match(panelContent, /aria-valuemax="100"/, 'Must declare aria-valuemax="100"');
    });

    it('includes non-alarming, dismissible liveness warning banner', () => {
      assert.match(panelContent, /isStalled && !warningDismissed/, 'Warning banner conditionally renders when stalled');
      assert.match(panelContent, /dismissWarning/, 'Banner must provide dismiss button calling dismissWarning');
      assert.match(panelContent, /aria-label="Dismiss long duration notice"/, 'Dismiss button must have accessible label');
      assert.match(panelContent, /taking longer than usual/i, 'Banner copy must be calm and non-alarming');
    });

    it('implements auto-focus management on completion', () => {
      assert.match(panelContent, /prLinkRef\.current\.focus\(\)/, 'Must auto-focus PR link on PR success');
      assert.match(panelContent, /runAgainRef\.current\.focus\(\)/, 'Must auto-focus action button on zero violations');
    });
  });

  describe('5 Terminal States Logic & Anomaly Protection', () => {
    const panelContent = fs.readFileSync(panelPath, 'utf8');

    // Helper to evaluate terminal classification logic as implemented in ProgressPanel
    function classifyRun(status, activeData) {
      const isTerminalSuccess = status === 'success';
      const isTerminalFailure = status === 'failed' || status === 'failure';
      const isZeroViolations = isTerminalSuccess && activeData.zeroViolations === true;
      const isPrSuccess = isTerminalSuccess && activeData.zeroViolations !== true && Boolean(activeData.prUrl);
      const isAnomalySuccess = isTerminalSuccess && activeData.zeroViolations !== true && !activeData.prUrl;
      const isTestFailure = isTerminalFailure && activeData.category === 'test_failure';
      const isPipelineError = isTerminalFailure && activeData.category !== 'test_failure';

      return {
        isPrSuccess,
        isZeroViolations,
        isAnomalySuccess,
        isTestFailure,
        isPipelineError,
      };
    }

    it('enforces strict zeroViolations condition (no !prUrl fallback in component source)', () => {
      // Must NOT contain `!prUrl || zeroViolations` or similar fallback that masks missing PRs
      assert.doesNotMatch(
        panelContent,
        /!prUrl\s*\|\|\s*.*zeroViolations/,
        'Must NOT infer zero-violations from absence of prUrl'
      );
      assert.doesNotMatch(
        panelContent,
        /zeroViolations\s*\|\|\s*!.*prUrl/,
        'Must NOT fallback to zero-violations when prUrl is missing'
      );

      // Must explicitly require activeData.zeroViolations === true
      assert.match(
        panelContent,
        /isZeroViolations\s*=\s*isTerminalSuccess\s*&&\s*activeData\.zeroViolations\s*===\s*true/,
        'isZeroViolations must strictly check activeData.zeroViolations === true'
      );
    });

    it('Terminal State 1: Pull Request Success', () => {
      const state = classifyRun('success', {
        zeroViolations: false,
        prUrl: 'https://github.com/acme/repo/pull/42',
        patchesCount: 3,
      });

      assert.equal(state.isPrSuccess, true);
      assert.equal(state.isZeroViolations, false);
      assert.equal(state.isAnomalySuccess, false);
      assert.equal(state.isTestFailure, false);
      assert.equal(state.isPipelineError, false);

      // Verify source renders PR link and diff count
      assert.match(panelContent, /href=\{activeData\.prUrl\}/, 'Must link to activeData.prUrl');
      assert.match(panelContent, /ref=\{prLinkRef\}/, 'Must attach prLinkRef');
      assert.match(panelContent, /View Pull Request on GitHub/, 'Must have prominent PR action button');
    });

    it('Terminal State 2: Zero Violations Success (Scan clean, no PR opened)', () => {
      const state = classifyRun('success', {
        zeroViolations: true,
        prUrl: undefined,
        patchesCount: 0,
      });

      assert.equal(state.isPrSuccess, false);
      assert.equal(state.isZeroViolations, true);
      assert.equal(state.isAnomalySuccess, false);
      assert.equal(state.isTestFailure, false);
      assert.equal(state.isPipelineError, false);

      // Verify source renders zero-violations messaging
      assert.match(panelContent, /Scan Complete: Zero Accessibility Violations Found/i, 'Must render zero-violations title');
      assert.match(panelContent, /All templates and HTML files scanned across your repository meet WCAG/i, 'Must explain clean audit');
    });

    it('Terminal State 3: Pipeline Anomaly (Success without PR URL or zeroViolations flag)', () => {
      // Crucial edge case: pipeline returned success, but PR link is missing and zeroViolations is NOT true
      const state = classifyRun('success', {
        zeroViolations: false,
        prUrl: undefined,
      });

      assert.equal(state.isPrSuccess, false);
      assert.equal(state.isZeroViolations, false);
      assert.equal(state.isAnomalySuccess, true, 'Must classify as anomaly, NOT zero violations');
      assert.equal(state.isTestFailure, false);
      assert.equal(state.isPipelineError, false);

      // Verify source displays anomaly warning
      assert.match(panelContent, /Remediation Succeeded — Pull Request Metadata Unavailable/i, 'Must display anomaly title');
      assert.match(panelContent, /no pull request URL was returned/i, 'Must explain missing PR link');
    });

    it('Terminal State 4: Broken Build Protection (Test suite failure in sandbox)', () => {
      const state = classifyRun('failure', {
        category: 'test_failure',
        error: 'Test suite failed in verify_build: npm test exited with code 1',
        errorExcerpt: 'FAIL tests/app.test.js\nAssertionError: Expected 200 got 500',
      });

      assert.equal(state.isPrSuccess, false);
      assert.equal(state.isZeroViolations, false);
      assert.equal(state.isAnomalySuccess, false);
      assert.equal(state.isTestFailure, true);
      assert.equal(state.isPipelineError, false);

      // Verify source displays broken build shield and test log excerpt
      assert.match(panelContent, /Build Verification Failed — No Pull Request Created/i, 'Must announce PR rejection');
      assert.match(panelContent, /Zero Broken Builds Guarantee/i, 'Must highlight build protection guarantee');
      assert.match(panelContent, /rejected the patches\s+and opened no pull request/i, 'Must explain protection');
      assert.match(panelContent, /activeData\.errorExcerpt\s*\|\|\s*activeData\.logExcerpt/, 'Must render captured test excerpt');
    });

    it('Terminal State 5: Pipeline Infrastructure Error', () => {
      const state = classifyRun('failed', {
        category: 'pipeline_error',
        error: 'Runner VM provision timeout exceeded',
        actionsLogUrl: 'https://github.com/acme/repo/actions/runs/12345',
      });

      assert.equal(state.isPrSuccess, false);
      assert.equal(state.isZeroViolations, false);
      assert.equal(state.isAnomalySuccess, false);
      assert.equal(state.isTestFailure, false);
      assert.equal(state.isPipelineError, true);

      // Verify source displays runner infrastructure failure and link to logs
      assert.match(panelContent, /Pipeline Infrastructure Error/i, 'Must display pipeline error title');
      assert.match(panelContent, /href=\{actionsUrl\}/, 'Must link to GitHub Actions log URL');
    });
  });
});
