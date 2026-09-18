'use client';

import React, { useState } from 'react';
import { Play, Loader2, Lock, AlertCircle, ExternalLink, Globe, Sparkles, ShieldCheck } from 'lucide-react';

export function AgentTriggerForm({ onTriggerSuccess }) {
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [sha, setSha] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorInfo(null);

    const trimmedRepo = repo.trim();
    if (!trimmedRepo) {
      setErrorInfo({ type: 'validation', message: 'Please enter a repository in "owner/repo" format.' });
      return;
    }

    if (!trimmedRepo.includes('/')) {
      setErrorInfo({ type: 'validation', message: 'Repository must contain owner and name separated by "/" (e.g. acme/web-app).' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: trimmedRepo,
          branch: branch.trim() || undefined,
          sha: sha.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 202 && data.runId) {
        if (onTriggerSuccess) {
          onTriggerSuccess(data.runId);
        }
        return;
      }

      if (res.status === 400 && data.isPrivate) {
        setErrorInfo({
          type: 'private_repo',
          message: data.error,
          repo: trimmedRepo,
        });
        return;
      }

      if (res.status === 403) {
        setErrorInfo({
          type: 'app_not_installed',
          message: data.error,
          repo: trimmedRepo,
        });
        return;
      }

      if (res.status === 429) {
        setErrorInfo({
          type: 'rate_limit',
          message: 'Trigger rate limit exceeded. Please wait a minute before starting another scan.',
        });
        return;
      }

      setErrorInfo({
        type: 'general',
        message: data.error || 'Failed to trigger scan. Please verify repository details.',
      });
    } catch (err) {
      setErrorInfo({
        type: 'general',
        message: err?.message || 'Network error occurred while communicating with fix11y API.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-xl flex flex-col gap-6 text-slate-100">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" aria-hidden="true" />
          <h2 className="text-lg font-bold text-white tracking-tight">Run Autonomous Agent Now</h2>
        </div>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Trigger an on-demand WCAG 2.1/2.2 AA remediation scan against any repository with the fix11y GitHub App installed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Repository Input */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="repo-input" className="text-xs font-semibold text-slate-200">
            Target Repository <span className="text-accent">*</span>
          </label>
          <div className="relative">
            <input
              id="repo-input"
              type="text"
              required
              placeholder="e.g. 13Dav-arc/fix11y-demo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              disabled={submitting}
              className="w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-border text-xs text-white placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent font-mono"
            />
          </div>
          <p className="text-[11px] text-muted flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-addition" aria-hidden="true" />
            <span>Public repositories only. Scans execute on shared GitHub Actions runners.</span>
          </p>
        </div>

        {/* Optional Branch & Commit SHA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="branch-input" className="text-xs font-semibold text-slate-200">
              Branch <span className="text-muted font-normal">(Optional)</span>
            </label>
            <input
              id="branch-input"
              type="text"
              placeholder="defaults to default branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={submitting}
              className="w-full px-3.5 py-2 rounded-lg bg-canvas border border-border text-xs text-white placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sha-input" className="text-xs font-semibold text-slate-200">
              Commit SHA <span className="text-muted font-normal">(Optional)</span>
            </label>
            <input
              id="sha-input"
              type="text"
              placeholder="defaults to latest HEAD"
              value={sha}
              onChange={(e) => setSha(e.target.value)}
              disabled={submitting}
              className="w-full px-3.5 py-2 rounded-lg bg-canvas border border-border text-xs text-white placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent font-mono"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-canvas font-semibold text-xs hover:bg-accent/90 disabled:opacity-50 transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent shadow-lg shadow-accent/10"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Verifying & Dispatching Runner...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-canvas" aria-hidden="true" />
              <span>Run Agent Now</span>
            </>
          )}
        </button>
      </form>

      {/* Error Callouts */}
      {errorInfo && (
        <div
          role="alert"
          className={`p-4 rounded-xl border text-xs flex flex-col gap-2.5 animate-fadeIn ${
            errorInfo.type === 'private_repo'
              ? 'bg-canvas border-accent/40 text-slate-200'
              : errorInfo.type === 'app_not_installed'
              ? 'bg-canvas border-amber-500/40 text-amber-200'
              : 'bg-red-500/10 border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {errorInfo.type === 'private_repo' ? (
              <Lock className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            ) : errorInfo.type === 'app_not_installed' ? (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="flex-1">
              <p className="font-semibold text-white">
                {errorInfo.type === 'private_repo'
                  ? 'Private Repository Execution'
                  : errorInfo.type === 'app_not_installed'
                  ? 'GitHub App Not Installed'
                  : 'Trigger Error'}
              </p>
              <p className="mt-1 leading-relaxed text-muted text-slate-300">{errorInfo.message}</p>
            </div>
          </div>

          {/* Actionable CTAs based on error type */}
          {errorInfo.type === 'private_repo' && (
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <p className="text-[11px] text-muted">
                Navigate to your repo&apos;s Actions tab and click &quot;Run workflow&quot; on the fix11y workflow.
              </p>
              <a
                href={`https://github.com/${errorInfo.repo}/actions`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-canvas border border-border text-slate-200 hover:text-white font-medium text-[11px]"
              >
                <span>Actions Tab</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}

          {errorInfo.type === 'app_not_installed' && (
            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
              <p className="text-[11px] text-amber-300/80">Install the app to grant permission for automated scans.</p>
              <a
                href="https://github.com/apps/fix11y-app/installations/new"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-canvas font-semibold text-xs hover:bg-amber-400 transition-colors shadow"
              >
                <span>Install fix11y App</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AgentTriggerForm;
