'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, Zap, GitPullRequest, Lock, Terminal, Sparkles, ArrowRight } from 'lucide-react';
import { Navbar } from '../../components/Navbar.jsx';
import { ProgressPanel } from '../../components/ProgressPanel.jsx';
import { AgentTriggerForm } from '../../components/AgentTriggerForm.jsx';

function AgentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeRunId, setActiveRunId] = useState(searchParams?.get('runId') || null);

  useEffect(() => {
    const urlRunId = searchParams?.get('runId');
    if (urlRunId) {
      setActiveRunId(urlRunId);
    }
  }, [searchParams]);

  const handleTriggerSuccess = (runId) => {
    setActiveRunId(runId);
    window.history.pushState(null, '', `/agent?runId=${encodeURIComponent(runId)}`);
  };

  const handleReset = () => {
    setActiveRunId(null);
    window.history.pushState(null, '', '/agent');
  };

  return (
    <div className="flex flex-col min-h-screen bg-canvas text-slate-100">
      <Navbar activeTab="agent" />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
        {/* Page Heading */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/10 border border-accent/30 text-accent">
              CI-Grade Autonomous Remediation
            </span>
            <span className="text-xs font-mono text-muted bg-card px-2 py-0.5 rounded border border-border">
              v2.2 Architecture
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            fix11y Autonomous Accessibility Engineer
          </h1>
          <p className="text-sm text-muted max-w-3xl leading-relaxed">
            Continuously audits HTML5 and Mustache/Handlebars templates, applies surgical non-destructive CST patches,
            verifies project test suites in air-gapped sandboxes, and opens verified pull requests.
          </p>
        </div>

        {/* Dynamic Display: ProgressPanel vs TriggerForm */}
        {activeRunId ? (
          <div className="animate-fadeIn flex flex-col gap-4">
            <ProgressPanel
              runId={activeRunId}
              onReset={handleReset}
              onRunAgain={handleReset}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fadeIn">
            {/* Left: On-Demand Trigger Form */}
            <div className="lg:col-span-7">
              <AgentTriggerForm onTriggerSuccess={handleTriggerSuccess} />
            </div>

            {/* Right: How It Works & Invariants Card */}
            <div className="lg:col-span-5 bg-card/60 border border-border/80 rounded-xl p-6 flex flex-col gap-5 text-xs text-muted">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-addition" aria-hidden="true" />
                <span>Operating Invariants & Guarantees</span>
              </h2>

              <ul className="flex flex-col gap-3.5 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-slate-200">Zero Broken Builds Guarantee:</strong> Every patch is verified
                    by executing your repository&apos;s native test suite (&apos;npm test&apos;). If tests fail, no PR is opened.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-addition shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-slate-200">Air-Gapped Private Isolation:</strong> Private repositories run
                    exclusively in their own GitHub Actions runners. Zero source code leaves your private environment.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-slate-200">Surgical CST Patching:</strong> Preserves 100% of untouched code,
                    comments, template delimiters, and quotation styles.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                  <div>
                    <strong className="text-slate-200">Safe vs Caution Tiers:</strong> Deterministic safe rules are applied
                    with high confidence. AI-assisted fixes are flagged as caution for human review.
                  </div>
                </li>
              </ul>

              <div className="pt-4 border-t border-border flex items-center justify-between text-slate-300">
                <span>Want to learn more about the architecture?</span>
                <a
                  href="/docs/agent"
                  className="inline-flex items-center gap-1 text-accent font-semibold hover:underline"
                >
                  <span>Read Docs</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense
      fallback={
        <main
          aria-label="Loading fix11y Agent"
          className="flex min-h-screen items-center justify-center bg-canvas text-muted text-xs"
        >
          <p>Loading fix11y Agent...</p>
        </main>
      }
    >
      <AgentContent />
    </Suspense>
  );
}
