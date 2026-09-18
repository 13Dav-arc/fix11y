import React from 'react';
import Link from 'next/link';
import { BookOpen, ArrowRight, Lock, Eye, Split, Zap } from 'lucide-react';

export const metadata = {
  title: 'Studio Playground — fix11y Documentation',
  description: 'Learn how to use fix11y Studio Playground for instant, in-browser accessibility preview and learning.',
};

export default function PlaygroundDocPage() {
  return (
    <article className="prose prose-invert max-w-none flex flex-col gap-8 text-slate-200">
      {/* Header */}
      <div className="border-b border-border/80 pb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Part 2 • Visual Studio</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Studio Playground
        </h1>
        <p className="text-base text-muted leading-relaxed">
          fix11y Playground is an interactive visual environment running client-side in your browser.
          Inspect violations, preview Myers unified diffs, and understand the accessibility reasoning behind every fix.
        </p>
      </div>

      {/* Zero Server Upload */}
      <section className="bg-card/70 border border-border rounded-xl p-5 text-xs text-slate-300 leading-relaxed flex flex-col gap-3">
        <div className="flex items-center gap-2 text-addition font-bold text-sm">
          <Lock className="w-4 h-4" />
          <span>100% Private Client-Side Execution</span>
        </div>
        <p>
          Playground runs the entire <code>@fix11y/core</code> CST parser and WCAG rule evaluators directly inside your browser.
          Nothing you paste into the editor is ever transmitted over the network or saved to external databases.
        </p>
      </section>

      {/* How to Use It */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">How to Use the Playground</h2>

        <ol className="flex flex-col gap-3 text-xs leading-relaxed">
          <li className="p-3.5 rounded-lg border border-border/70 bg-card/40 flex items-start gap-3">
            <span className="font-bold text-accent shrink-0">1.</span>
            <div>
              <strong className="text-white">Paste or Upload Templates:</strong> Paste HTML5, Mustache, or Handlebars code directly into the editor, or use the multi-file drag-and-drop ingestion area.
            </div>
          </li>
          <li className="p-3.5 rounded-lg border border-border/70 bg-card/40 flex items-start gap-3">
            <span className="font-bold text-accent shrink-0">2.</span>
            <div>
              <strong className="text-white">Instant Diagnostics:</strong> fix11y evaluates rules in sub-millisecond time. Every violation highlights the exact offending lines in the source editor.
            </div>
          </li>
          <li className="p-3.5 rounded-lg border border-border/70 bg-card/40 flex items-start gap-3">
            <span className="font-bold text-accent shrink-0">3.</span>
            <div>
              <strong className="text-white">Plain-Language Explanations:</strong> Click on any diagnostic card to view plain-language rationale, the associated WCAG success criterion, and the safety tier.
            </div>
          </li>
          <li className="p-3.5 rounded-lg border border-border/70 bg-card/40 flex items-start gap-3">
            <span className="font-bold text-accent shrink-0">4.</span>
            <div>
              <strong className="text-white">Myers Unified Diff Viewer:</strong> Inspect character-level insertions and deletions before exporting. Copy individual remediations or download all fixed files in a single zip.
            </div>
          </li>
        </ol>
      </section>

      {/* Boundary: Playground vs Agent */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">The Boundary: Playground vs. Agent</h2>
        <p className="text-xs text-muted leading-relaxed">
          It is important to understand what the Playground can do versus what requires the Autonomous Agent:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="border border-border p-4 rounded-xl bg-card/40 flex flex-col gap-2">
            <span className="font-bold text-white text-sm">Playground (Interactive Preview)</span>
            <ul className="text-muted list-disc list-inside flex flex-col gap-1.5 leading-relaxed">
              <li>Works on pasted code snippets or uploaded files</li>
              <li>Runs instant single-document & element checks</li>
              <li>Previews Myers unified diffs</li>
              <li>Cannot clone repositories or verify project builds</li>
            </ul>
          </div>

          <div className="border border-accent/40 bg-accent/5 p-4 rounded-xl flex flex-col gap-2">
            <span className="font-bold text-accent text-sm">Autonomous Agent (CI Pipeline)</span>
            <ul className="text-slate-300 list-disc list-inside flex flex-col gap-1.5 leading-relaxed">
              <li>Watches real GitHub repositories on push</li>
              <li>Executes 3-job DAG in an air-gapped sandbox</li>
              <li>Runs your project&apos;s build and test suite</li>
              <li>Opens verified, merge-ready pull requests</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Navigation */}
      <div className="pt-6 border-t border-border flex items-center justify-between">
        <Link
          href="/docs/core"
          className="text-xs text-muted hover:text-white transition-colors"
        >
          ← Core Engine & Rules
        </Link>
        <Link
          href="/docs/agent"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-canvas font-semibold text-xs hover:bg-accent/90 transition-colors shadow"
        >
          <span>Next: Autonomous Agent</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </article>
  );
}
