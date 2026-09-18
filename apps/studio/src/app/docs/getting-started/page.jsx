import React from 'react';
import Link from 'next/link';
import { Terminal, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Getting Started — fix11y Documentation',
  description: 'Learn what fix11y is, how it works in 60 seconds, and whether to use Core, Playground, or the Agent.',
};

export default function GettingStartedPage() {
  return (
    <article className="prose prose-invert max-w-none flex flex-col gap-8 text-slate-200">
      {/* Header */}
      <div className="border-b border-border/80 pb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Part 0 • Overview</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          What is fix11y?
        </h1>
        <p className="text-base text-muted leading-relaxed">
          fix11y finds accessibility problems in your HTML and web templates, and — for the ones it can fix safely
          and automatically — fixes them for you using surgical, non-destructive syntax patching.
        </p>
      </div>

      {/* Honest Version Up Front */}
      <section className="bg-card/70 border border-border rounded-xl p-5 text-sm leading-relaxed flex flex-col gap-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span>The Honest Version, Up Front</span>
        </h2>
        <p className="text-slate-300">
          No tool, automated or otherwise, can catch every accessibility issue a website might have.
          A lot of accessibility is about <strong>human judgment</strong> — does this text actually make sense to someone using
          a screen reader? Is this the <em>right</em> description for this image? Those questions need a human.
        </p>
        <p className="text-slate-300">
          What fix11y does well is the <strong>mechanical part</strong>: missing attributes, non-semantic buttons, unlinked form labels,
          and structural things a computer really can verify. It fixes what it can fix confidently, and clearly flags what still needs human review.
        </p>
      </section>

      {/* Three Pillars Table */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">The Three Pillars of fix11y</h2>
        <p className="text-sm text-muted">
          fix11y has three parts, and you can use any one of them independently:
        </p>

        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-border text-slate-300">
                <th scope="col" className="p-3.5 font-bold">Pillar</th>
                <th scope="col" className="p-3.5 font-bold">What it is</th>
                <th scope="col" className="p-3.5 font-bold">When to use it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              <tr className="hover:bg-cardHover/40 transition-colors">
                <td className="p-3.5 font-bold text-accent">Core</td>
                <td className="p-3.5 text-slate-300">The zero-dependency rule engine & CLI tool</td>
                <td className="p-3.5 text-muted">Run checks or apply fixes locally, or integrate in your own CI pipeline</td>
              </tr>
              <tr className="hover:bg-cardHover/40 transition-colors">
                <td className="p-3.5 font-bold text-white">Playground</td>
                <td className="p-3.5 text-slate-300">In-browser playground with live side-by-side AST diffs</td>
                <td className="p-3.5 text-muted">Inspect rule diagnostics and preview fixes without installing anything</td>
              </tr>
              <tr className="hover:bg-cardHover/40 transition-colors">
                <td className="p-3.5 font-bold text-addition">Agent</td>
                <td className="p-3.5 text-slate-300">Autonomous bot running verified 3-job GitHub Actions workflows</td>
                <td className="p-3.5 text-muted">Automated remediation and pull requests on every commit push</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Getting Started in 60s */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">Getting Started in 60 Seconds</h2>

        <div className="flex flex-col gap-4 text-xs">
          <div className="border border-border/80 rounded-xl p-4.5 bg-card/40 flex flex-col gap-2">
            <span className="font-semibold text-slate-200">1. Instant Browser Preview</span>
            <p className="text-muted leading-relaxed">
              If you just want to see how fix11y operates on your code: open the Playground, paste in HTML or templates,
              and see it remediate live. Zero signup, zero installation.
            </p>
            <Link href="/" className="text-accent font-semibold hover:underline inline-flex items-center gap-1 mt-1">
              <span>Open Studio Playground</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="border border-border/80 rounded-xl p-4.5 bg-card/40 flex flex-col gap-2">
            <span className="font-semibold text-slate-200">2. Run Locally via npx</span>
            <p className="text-muted leading-relaxed">
              Scan your project directory for accessibility violations without installing dependencies:
            </p>
            <div className="bg-canvas p-3 rounded-lg border border-border font-mono text-slate-200 flex items-center justify-between">
              <code>npx fix11y ./src</code>
            </div>
          </div>

          <div className="border border-border/80 rounded-xl p-4.5 bg-card/40 flex flex-col gap-2">
            <span className="font-semibold text-slate-200">3. Apply Fixes Interactively</span>
            <p className="text-muted leading-relaxed">
              Review and apply surgical patches file-by-file with visual diff confirmation:
            </p>
            <div className="bg-canvas p-3 rounded-lg border border-border font-mono text-slate-200 flex items-center justify-between">
              <code>npx fix11y ./src --fix</code>
            </div>
          </div>

          <div className="border border-border/80 rounded-xl p-4.5 bg-card/40 flex flex-col gap-2">
            <span className="font-semibold text-slate-200">4. Auto-Apply Confident Safe Rules</span>
            <p className="text-muted leading-relaxed">
              Apply all deterministic, high-confidence safe rules across your repository in one step:
            </p>
            <div className="bg-canvas p-3 rounded-lg border border-border font-mono text-slate-200 flex items-center justify-between">
              <code>npx fix11y ./src --safety safe -y</code>
            </div>
          </div>
        </div>
      </section>

      {/* Next Link */}
      <div className="pt-6 border-t border-border flex justify-end">
        <Link
          href="/docs/core"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-canvas font-semibold text-xs hover:bg-accent/90 transition-colors shadow"
        >
          <span>Next: Core Engine & Rule Catalog</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </article>
  );
}
