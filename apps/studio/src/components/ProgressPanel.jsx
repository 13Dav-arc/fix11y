'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  FileCode2,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAgentProgress } from '../hooks/useAgentProgress.js';

export const STEPS = [
  { id: 'provisioning_runner', label: '1. Provision VM', description: 'Spinning up GitHub Actions runner VM...' },
  { id: 'init_sandbox', label: '2. Workspace Init', description: 'Checking out repository and setting up environment...' },
  { id: 'initial_audit', label: '3. Audit Templates', description: 'Auditing HTML and template files across workspace...' },
  { id: 'atomic_file_fix', label: '4. Surgical Patching', description: 'Applying non-destructive CST AST patches...' },
  { id: 'verify_build', label: '5. Build Verification', description: 'Executing isolated build and tests (npm test)...' },
  { id: 'open_pr', label: '6. Resolve & Open PR', description: 'Finalizing remediation pull request...' },
];

export function ProgressPanel({
  runId,
  initialData,
  onReset,
  onRunAgain,
  pollInterval = 2500,
}) {
  const {
    status,
    step,
    data,
    loading,
    error,
    isStalled,
    warningDismissed,
    dismissWarning,
    refetch,
  } = useAgentProgress({ runId, pollInterval });

  const activeData = data || initialData || {};
  const currentStatus = activeData.status || status;
  const currentStep = activeData.step || step;

  const prLinkRef = useRef(null);
  const runAgainRef = useRef(null);
  const [showLogExcerpt, setShowLogExcerpt] = React.useState(true);

  // Determine stage progression index (0 to 5)
  const currentStepIndex = useMemo(() => {
    if (!currentStep) return 0;
    const idx = STEPS.findIndex((s) => s.id === currentStep);
    return idx >= 0 ? idx : 0;
  }, [currentStep]);

  // Terminal state classifications
  const isTerminalSuccess = currentStatus === 'success';
  const isTerminalFailure = currentStatus === 'failed' || currentStatus === 'failure';
  const isZeroViolations = isTerminalSuccess && activeData.zeroViolations === true;
  const isPrSuccess = isTerminalSuccess && activeData.zeroViolations !== true && Boolean(activeData.prUrl);
  const isAnomalySuccess = isTerminalSuccess && activeData.zeroViolations !== true && !activeData.prUrl;
  const isTestFailure = isTerminalFailure && activeData.category === 'test_failure';
  const isPipelineError = isTerminalFailure && activeData.category !== 'test_failure';

  const progressPercentage = useMemo(() => {
    if (isTerminalSuccess) return 100;
    if (isTerminalFailure) return Math.min(Math.round(((currentStepIndex + 1) / STEPS.length) * 100), 100);
    return Math.min(Math.round(((currentStepIndex + 0.5) / STEPS.length) * 100), 95);
  }, [isTerminalSuccess, isTerminalFailure, currentStepIndex]);

  // Screen reader announcement text
  const announcement = useMemo(() => {
    if (loading && !currentStatus) return 'Loading autonomous remediation progress...';
    if (isPrSuccess) return `Remediation complete! Pull request opened: ${activeData.prUrl}`;
    if (isZeroViolations) return 'Scan complete. Zero accessibility violations found. No pull request needed.';
    if (isAnomalySuccess) return 'Scan finished, but pull request link is unavailable. Check repository logs.';
    if (isTestFailure) return 'Build verification failed. Test suite failed during sandbox verification. No pull request opened.';
    if (isPipelineError) return 'Scan failed due to a pipeline infrastructure error. No repository files were modified.';
    if (currentStep) {
      const stepObj = STEPS.find((s) => s.id === currentStep);
      return `Current step: ${stepObj ? stepObj.label : currentStep}`;
    }
    return 'Remediation scan in progress.';
  }, [loading, currentStatus, isPrSuccess, isZeroViolations, isAnomalySuccess, isTestFailure, isPipelineError, currentStep, activeData]);

  // Programmatic focus shifting to appropriate interactive element on completion
  useEffect(() => {
    if (isPrSuccess && prLinkRef.current) {
      prLinkRef.current.focus();
    } else if (isZeroViolations && runAgainRef.current) {
      runAgainRef.current.focus();
    }
  }, [isPrSuccess, isZeroViolations]);

  const actionsUrl = activeData.actionsLogUrl ||
    (activeData.repo ? `https://github.com/${activeData.repo}/actions` : 'https://github.com');

  return (
    <section
      aria-labelledby="progress-panel-title"
      className="bg-card border border-border rounded-xl p-6 shadow-xl flex flex-col gap-6 text-slate-100"
    >
      {/* Live Screen Reader Announcer */}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {/* Header Landmark & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" aria-hidden="true" />
            <h2 id="progress-panel-title" className="text-lg font-bold text-white tracking-tight">
              Autonomous Remediation Pipeline
            </h2>
            <span className="text-xs font-mono bg-canvas px-2 py-0.5 rounded border border-border text-muted">
              {runId ? `run-${runId.slice(0, 8)}` : 'active-session'}
            </span>
          </div>
          {activeData.repo && (
            <p className="text-xs text-muted mt-1">
              Target Repository:{' '}
              <span className="text-slate-200 font-mono font-semibold">{activeData.repo}</span>
              {activeData.sha && (
                <span className="ml-1 text-muted">
                  @<span className="font-mono text-accent">{activeData.sha.slice(0, 7)}</span>
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={actionsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-canvas hover:bg-cardHover hover:text-white transition-colors text-muted"
            aria-label="View live GitHub Actions run logs"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Actions Log</span>
          </a>
          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-canvas hover:bg-cardHover hover:text-white transition-colors text-muted"
              aria-label="Reset and trigger another scan"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Adaptive Liveness Warning Banner (Dismissible, Non-Alarming) */}
      {isStalled && !warningDismissed && currentStatus === 'running' && (
        <div
          role="region"
          aria-label="Run duration notice"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex items-start justify-between gap-3 text-amber-200 text-xs animate-fadeIn"
        >
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-amber-300">This step is taking longer than usual</p>
              <p className="mt-0.5 text-amber-200/90 leading-relaxed">
                Multi-file sequential AI remediation or extensive project test suites can extend execution times.
                You can view the real-time runner output in{' '}
                <a
                  href={actionsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-medium hover:text-white text-amber-100"
                >
                  GitHub Actions logs
                </a>.
              </p>
            </div>
          </div>
          <button
            onClick={dismissWarning}
            className="text-amber-300 hover:text-white p-1 rounded hover:bg-amber-500/20 transition-colors"
            aria-label="Dismiss long duration notice"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Accessible Overall Progress Bar (WCAG 4.1.2) */}
      <div className="flex flex-col gap-1.5" aria-label="Pipeline progress metric">
        <div className="flex justify-between items-center text-xs text-muted">
          <span className="font-semibold text-slate-300">Overall Pipeline Progress</span>
          <span className="font-mono text-accent">{progressPercentage}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progressPercentage}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Remediation pipeline completion"
          className="w-full h-2 rounded-full bg-canvas border border-border overflow-hidden"
        >
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isTerminalFailure
                ? 'bg-red-500'
                : isTerminalSuccess
                ? 'bg-addition'
                : 'bg-accent'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* 6-Stage Progress Stepper */}
      <div className="flex flex-col gap-3" aria-label="Pipeline milestone progression">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
          Milestone Progression
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {STEPS.map((s, idx) => {
            const isCompleted = isTerminalSuccess || (currentStatus === 'running' && idx < currentStepIndex);
            const isCurrent = currentStatus === 'running' && idx === currentStepIndex;
            const isFailedStep = isTerminalFailure && idx === currentStepIndex;

            return (
              <div
                key={s.id}
                className={`p-3.5 rounded-lg border flex flex-col gap-1 transition-all ${
                  isCurrent
                    ? 'border-accent bg-accent/10 shadow-md shadow-accent/5 ring-1 ring-accent/30'
                    : isCompleted
                    ? 'border-addition-border/60 bg-addition/5 text-slate-300'
                    : isFailedStep
                    ? 'border-red-500/50 bg-red-500/10 text-red-200'
                    : 'border-border/60 bg-canvas/40 text-muted opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    {s.label}
                  </span>
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-addition shrink-0" aria-hidden="true" />
                  ) : isFailedStep ? (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
                  ) : isCurrent ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping shrink-0" aria-hidden="true" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-border shrink-0" aria-hidden="true" />
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-muted">
                  {s.id === 'atomic_file_fix' && activeData.filesTotal > 0
                    ? `Surgically patching (${activeData.filesDone || 0} of ${activeData.filesTotal} files)...`
                    : s.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal Outcome Containers */}

      {/* Terminal State 1: Pull Request Opened */}
      {isPrSuccess && (
        <output
          role="status"
          aria-label="Remediation success with pull request"
          className="rounded-xl border border-addition-border bg-addition/10 p-5 flex flex-col gap-4 text-addition-text animate-fadeIn"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-addition shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <h4 className="text-base font-bold text-white tracking-tight">
                Remediation Verified & Pull Request Opened!
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Accessibility violations were remediated using surgical CST AST patching, and all repository build &
                test suites passed cleanly in the verified sandbox.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-addition-border/40">
            <a
              ref={prLinkRef}
              href={activeData.prUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-addition text-canvas font-semibold text-xs hover:bg-addition/90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-addition shadow-lg transition-all"
              aria-label="View verified accessibility pull request on GitHub"
            >
              <span>View Pull Request on GitHub</span>
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>

            {onRunAgain && (
              <button
                onClick={onRunAgain}
                className="px-3.5 py-2 rounded-lg border border-border bg-canvas hover:bg-cardHover text-slate-200 text-xs font-medium transition-colors"
              >
                Scan Another Repo
              </button>
            )}
          </div>
        </output>
      )}

      {/* Terminal State 2: Zero Violations Found */}
      {isZeroViolations && (
        <output
          role="status"
          aria-label="Scan complete with zero violations"
          className="rounded-xl border border-addition-border/70 bg-addition/10 p-5 flex flex-col gap-4 text-addition-text animate-fadeIn"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-addition shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <div className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-addition/20 text-addition border border-addition-border mb-1">
                100% WCAG 2.1/2.2 AA Compliant
              </div>
              <h4 className="text-base font-bold text-white tracking-tight">
                Scan Complete: Zero Accessibility Violations Found
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                All templates and HTML files scanned across your repository meet WCAG 2.1/2.2 AA standards.
                No remediation patches were required, and your codebase remains compliant.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-addition-border/40">
            {onRunAgain && (
              <button
                ref={runAgainRef}
                onClick={onRunAgain}
                className="px-4 py-2 rounded-lg bg-addition text-canvas font-semibold text-xs hover:bg-addition/90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-addition transition-all"
              >
                Run Another Scan
              </button>
            )}
            <a
              href="/"
              className="px-3.5 py-2 rounded-lg border border-border bg-canvas hover:bg-cardHover text-slate-200 text-xs font-medium transition-colors"
            >
              Open Studio Playground
            </a>
          </div>
        </output>
      )}

      {/* Terminal State 3: Pipeline Anomaly (Success with missing PR and zeroViolations !== true) */}
      {isAnomalySuccess && (
        <output
          role="alert"
          aria-label="Remediation succeeded with missing PR link"
          className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-5 flex flex-col gap-3 text-amber-200 animate-fadeIn"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <h4 className="text-base font-bold text-white tracking-tight">
                Remediation Succeeded — Pull Request Metadata Unavailable
              </h4>
              <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                The runner pipeline completed remediation, but no pull request URL was returned in the progress record.
                This usually indicates a branch was created on GitHub but the final pull request link was not captured.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-amber-500/30">
            <a
              href={actionsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-canvas font-semibold text-xs hover:bg-amber-400 transition-colors"
            >
              <span>Inspect Actions Run</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>
        </output>
      )}

      {/* Terminal State 4: Build Verification Rejection (Test Failure) */}
      {isTestFailure && (
        <output
          role="status"
          aria-label="Build verification failed"
          className="rounded-xl border border-red-500/50 bg-red-500/10 p-5 flex flex-col gap-4 text-red-200 animate-fadeIn"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <div className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/40 mb-1">
                Zero Broken Builds Guarantee
              </div>
              <h4 className="text-base font-bold text-white tracking-tight">
                Build Verification Failed — No Pull Request Created
              </h4>
              <p className="text-xs text-red-200/90 mt-1 leading-relaxed">
                Automated accessibility patches were generated, but your test suite (&apos;npm test&apos;) failed during
                sandbox build verification. To protect your branch from breaking changes, fix11y rejected the patches
                and opened no pull request.
              </p>
            </div>
          </div>

          {/* Collapsible Test Failure Log Excerpt */}
          {(activeData.errorExcerpt || activeData.logExcerpt || activeData.summary) && (
            <div className="rounded-lg bg-canvas border border-border p-3 flex flex-col gap-2">
              <button
                onClick={() => setShowLogExcerpt(!showLogExcerpt)}
                className="flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white"
                aria-expanded={showLogExcerpt}
              >
                <span className="flex items-center gap-1.5">
                  <FileCode2 className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                  <span>Captured Test Failure Excerpt</span>
                </span>
                {showLogExcerpt ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showLogExcerpt && (
                <pre className="text-[11px] font-mono bg-canvas/80 text-red-300 p-3 rounded overflow-x-auto max-h-48 whitespace-pre-wrap border border-red-500/20">
                  {activeData.errorExcerpt || activeData.logExcerpt || activeData.summary}
                </pre>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-red-500/30">
            <a
              href={actionsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-canvas border border-border text-slate-200 text-xs font-semibold hover:bg-cardHover transition-colors"
            >
              <span>View Full Test Log</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            {onRunAgain && (
              <button
                onClick={onRunAgain}
                className="px-3.5 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-medium hover:bg-red-500/30 transition-colors"
              >
                Re-run Scan
              </button>
            )}
          </div>
        </output>
      )}

      {/* Terminal State 5: Pipeline Infrastructure Error */}
      {isPipelineError && (
        <output
          role="alert"
          aria-label="Pipeline infrastructure error"
          className="rounded-xl border border-red-500/60 bg-red-500/10 p-5 flex flex-col gap-4 text-red-200 animate-fadeIn"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <h4 className="text-base font-bold text-white tracking-tight">
                Scan Failed: Pipeline Infrastructure Error
              </h4>
              <p className="text-xs text-red-200/90 mt-1 leading-relaxed">
                An internal infrastructure error occurred in the runner environment (such as an artifact transfer failure or
                runner VM timeout). Your repository files were not modified.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-red-500/30">
            <a
              href={actionsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-500 text-canvas font-semibold text-xs hover:bg-red-400 transition-colors"
            >
              <span>Inspect Runner Log</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            {onRunAgain && (
              <button
                onClick={onRunAgain}
                className="px-3.5 py-2 rounded-lg border border-border bg-canvas hover:bg-cardHover text-slate-200 text-xs font-medium transition-colors"
              >
                Retry Scan
              </button>
            )}
          </div>
        </output>
      )}
    </section>
  );
}

export default ProgressPanel;
