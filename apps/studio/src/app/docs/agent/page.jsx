import React from 'react';
import Link from 'next/link';
import { Bot, ShieldCheck, GitPullRequest, ArrowRight, Lock, Globe2, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Autonomous Agent — fix11y Documentation',
  description: 'How the fix11y autonomous accessibility engineer works: 3-job GitHub Actions DAG, public vs private routing, and safety tiers.',
};

export default function AgentDocPage() {
  return (
    <article className="prose prose-invert max-w-none flex flex-col gap-8 text-slate-200">
      {/* Header */}
      <div className="border-b border-border/80 pb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
          <Bot className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Part 3 • Autonomous Remediation</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          The fix11y Agent
        </h1>
        <p className="text-base text-muted leading-relaxed">
          The autonomous accessibility engineer that installs on GitHub repositories, detects WCAG violations on every commit push,
          surgically patches files, verifies that project tests still pass, and opens clean pull requests.
        </p>
      </div>

      {/* Overview */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">What It Does</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          When installed on a GitHub repository, the Agent monitors push events. Rather than blindly committing changes,
          it executes an autonomous remediation loop:
        </p>
        <ol className="list-decimal list-inside text-xs sm:text-sm text-slate-300 space-y-2 pl-1">
          <li><strong>Scans changed files:</strong> Detects accessibility violations in modified HTML and template source files.</li>
          <li><strong>Mechanical fixes:</strong> Immediately resolves deterministic issues using the zero-dependency CST patcher.</li>
          <li><strong>AI-assisted fixes:</strong> For judgment-dependent fixes, requests targeted suggestions from Google Gemini under strict structural AST constraints (never full-file rewrites).</li>
          <li><strong>Build &amp; test verification:</strong> Executes your project&apos;s existing test suite to guarantee no build regressions.</li>
          <li><strong>Opens a pull request:</strong> Categorizes all changes by safety tier (<span className="text-addition font-semibold">safe</span> vs <span className="text-warning font-semibold">caution</span>) and submits a detailed PR for human review.</li>
        </ol>
        <div className="bg-canvas border border-border/80 rounded-xl p-4 text-xs text-muted">
          <strong className="text-white">Review &amp; Merge Policy:</strong> The Agent <em>never</em> pushes directly to your default branch or merges its own PRs. You retain full control over review and merging.
        </div>
      </section>

      {/* The 3-Job GitHub Actions DAG */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">The 3-Job Verification Pipeline (DAG)</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Every remediation run executes as a sequential 3-stage directed acyclic graph (DAG). Each job runs in an isolated runner with strict timeout ceilings:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-border/80 rounded-xl p-4 bg-card/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-accent uppercase">Job 1</span>
              <span className="text-[11px] font-mono text-muted">Timeout: 15m</span>
            </div>
            <h3 className="text-sm font-bold text-white">patch (Remediation)</h3>
            <p className="text-xs text-muted leading-relaxed">
              Clones repository, scans changed template files, invokes CST surgical patcher, and requests Gemini guidance for judgment-tier fixes.
            </p>
          </div>

          <div className="border border-border/80 rounded-xl p-4 bg-card/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-warning uppercase">Job 2</span>
              <span className="text-[11px] font-mono text-muted">Timeout: 10m</span>
            </div>
            <h3 className="text-sm font-bold text-white">verify (Build &amp; Test)</h3>
            <p className="text-xs text-muted leading-relaxed">
              Executes the repository&apos;s native build and test scripts (<code className="text-accent">npm test</code> / <code className="text-accent">npm run build</code>). Air-gapped from any external tokens.
            </p>
          </div>

          <div className="border border-border/80 rounded-xl p-4 bg-card/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-addition uppercase">Job 3</span>
              <span className="text-[11px] font-mono text-muted">Timeout: 5m</span>
            </div>
            <h3 className="text-sm font-bold text-white">resolve (PR Submission)</h3>
            <p className="text-xs text-muted leading-relaxed">
              If Job 2 passed, opens a pull request with unified diffs. If Job 2 failed, marks check run as failed and refuses to open any PR.
            </p>
          </div>
        </div>
      </section>

      {/* Public vs Private Repositories */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">Public vs. Private Repositories</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          fix11y enforces strict privacy boundaries depending on your repository visibility:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="border border-border rounded-xl p-4 bg-card/40 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-accent font-bold">
              <Globe2 className="w-4 h-4" aria-hidden="true" />
              <span>Public Repositories</span>
            </div>
            <ul className="text-muted space-y-2 leading-relaxed">
              <li>• Runs on fix11y&apos;s shared, ephemeral runner (<code className="text-slate-300">fix11y-runner</code>).</li>
              <li>• Zero setup files committed to your repository.</li>
              <li>• On-demand manual trigger available directly from the Studio interface (<Link href="/agent" className="text-accent underline">/agent</Link>).</li>
              <li>• Automatically triggered on push events via GitHub Webhooks.</li>
            </ul>
          </div>

          <div className="border border-border rounded-xl p-4 bg-card/40 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-warning font-bold">
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>Private Repositories</span>
            </div>
            <ul className="text-muted space-y-2 leading-relaxed">
              <li>• Runs exclusively in your own repository&apos;s GitHub Actions minutes.</li>
              <li>• App opens a setup PR adding a native workflow file (<code className="text-slate-300">fix11y-remediate.yml</code>).</li>
              <li>• Your proprietary source code never touches fix11y&apos;s servers.</li>
              <li>• Manual runs are triggered directly from your repository&apos;s GitHub Actions tab (&ldquo;Run workflow&rdquo;).</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Safety Tiers */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">Pull Request Safety Tiers</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Every remediation pull request includes an itemized breakdown grouped into two distinct safety tiers:
        </p>

        <div className="flex flex-col gap-3 text-xs">
          <div className="border border-addition/30 rounded-xl p-4 bg-addition/5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-bold text-addition">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Safe Tier (Deterministic AST Patches)</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Mechanically verifiable, zero-risk modifications. Examples include inserting missing <code className="text-addition">alt=&quot;&quot;</code> attributes on purely decorative images,
              adding required <code className="text-addition">&lt;th scope=&quot;col&quot;&gt;</code> headers to tables, or generating missing <code className="text-addition">id</code> attributes to bind labels to form inputs.
              These can be merged with complete confidence.
            </p>
          </div>

          <div className="border border-warning/30 rounded-xl p-4 bg-warning/5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-bold text-warning">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              <span>Caution Tier (Heuristic &amp; AI-Assisted Patches)</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Structurally sound modifications that involve semantic interpretation. Examples include synthesizing descriptive alt text for informative images or resolving ambiguous heading hierarchy skips.
              Always inspect caution-tier suggestions before approving.
            </p>
          </div>
        </div>
      </section>

      {/* Build Failure Guard */}
      <section className="bg-card/70 border border-border rounded-xl p-5 text-sm leading-relaxed flex flex-col gap-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4.5 h-4.5 text-addition" aria-hidden="true" />
          <span>The Broken Build Protection Guarantee</span>
        </h2>
        <p className="text-slate-300">
          If any fix causes a build failure or breaks existing unit tests during Job 2, the Agent <strong>strictly refuses to open a pull request</strong>.
          The commit status check updates to failed (<code className="text-warning">category: &apos;test_failure&apos;</code>) and provides a direct link to the CI test log.
          The default branch is protected against regressions at all times.
        </p>
      </section>

      {/* Navigation Footer */}
      <div className="pt-6 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs font-semibold">
        <Link href="/docs/playground" className="text-muted hover:text-white transition-colors">
          ← Part 2: Studio Playground
        </Link>
        <Link href="/docs/faq" className="text-accent hover:underline flex items-center gap-1">
          <span>Part 4: Frequently Asked Questions</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
