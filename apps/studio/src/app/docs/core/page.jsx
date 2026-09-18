import React from 'react';
import Link from 'next/link';
import { Terminal, ArrowRight, ShieldCheck, CheckCircle2, AlertTriangle, Code2 } from 'lucide-react';

export const metadata = {
  title: 'Core Engine & Rule Catalog — fix11y Documentation',
  description: 'Learn about @fix11y/core, the zero-dependency CST engine, WCAG 2.1/2.2 AA rule catalog, and CLI usage.',
};

export default function CoreDocPage() {
  return (
    <article className="prose prose-invert max-w-none flex flex-col gap-8 text-slate-200">
      {/* Header */}
      <div className="border-b border-border/80 pb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent uppercase tracking-wider">
          <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Part 1 • The Engine</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Core Engine & Rule Catalog
        </h1>
        <p className="text-base text-muted leading-relaxed">
          <code>@fix11y/core</code> is a zero-dependency, developer-focused accessibility remediation engine and CLI.
          It scans HTML5 and web templates (Mustache, Handlebars) and applies surgical AST patches at exact character offsets.
        </p>
      </div>

      {/* The CST Surgical Patching Architecture */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">Surgical CST Patching Architecture</h2>
        <p className="text-xs text-muted leading-relaxed">
          Traditional linters parse your code into an Abstract Syntax Tree (AST) and then serialize the entire file back out.
          That approach collapses whitespace, alters quote styles, strips comments, and corrupts templating partials.
        </p>
        <div className="bg-card/70 border border-border rounded-xl p-5 text-xs text-slate-300 leading-relaxed flex flex-col gap-2.5">
          <h3 className="font-bold text-white text-sm">Character Offset Spans & Zero-Drift Splices</h3>
          <p>
            <code>@fix11y/core</code> tracks exact character start and end byte offsets (<code>startOffset</code>, <code>endOffset</code>)
            for every element, token, and attribute.
          </p>
          <p>
            When a fix is applied, the engine splices strictly at those character positions.
            <strong> 100% of untouched code, comments, Handlebars directives, and formatting remain byte-for-byte identical.</strong>
          </p>
        </div>
      </section>

      {/* Safety Tiers */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">Safety Tiers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="border border-addition-border/60 bg-addition/5 p-4 rounded-xl flex flex-col gap-2">
            <div className="flex items-center gap-2 text-addition font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Safe Tier</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Fixes where the remediation is deterministic, unambiguous, and cannot alter the visual rendering
              or meaning of your page. Ideal for automated CI merges and bulk fixes.
            </p>
          </div>

          <div className="border border-amber-500/40 bg-amber-500/5 p-4 rounded-xl flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>Caution Tier</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Fixes that are structurally sound, but where optimal accuracy requires human context
              (e.g. distinguishing a decorative image from a content image requiring descriptive alt text).
            </p>
          </div>
        </div>
      </section>

      {/* WCAG 2.1/2.2 AA Rule Catalog */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">WCAG 2.1 / 2.2 AA Rule Catalog</h2>
        <div className="grid grid-cols-1 gap-3 text-xs">
          {[
            {
              id: 'img-alt',
              tier: 'safe',
              scope: 'element',
              wcag: '1.1.1 Non-text Content',
              desc: 'Flags <img> elements missing alt attributes. Surgically inserts alt="" or suggested descriptions.',
            },
            {
              id: 'form-label',
              tier: 'caution',
              scope: 'element',
              wcag: '1.3.1 Info and Relationships',
              desc: 'Connects unlabeled inputs to nearby labels or wraps them with proximity pairing.',
            },
            {
              id: 'button-semantics',
              tier: 'safe',
              scope: 'element',
              wcag: '4.1.2 Name, Role, Value',
              desc: 'Converts clickable <div> and <span> elements into accessible native <button> elements.',
            },
            {
              id: 'aria-live-status',
              tier: 'safe',
              scope: 'element',
              wcag: '4.1.3 Status Messages',
              desc: 'Injects aria-live="polite" on asynchronous status announcers to alert screen readers.',
            },
            {
              id: 'link-name',
              tier: 'safe',
              scope: 'element',
              wcag: '2.4.4 Link Purpose',
              desc: 'Ensures anchor links contain accessible text or aria-label instead of empty icon links.',
            },
            {
              id: 'target-blank',
              tier: 'safe',
              scope: 'element',
              wcag: '3.2.5 Change on Request',
              desc: 'Adds rel="noopener noreferrer" and announces new tab opening on target="_blank" links.',
            },
            {
              id: 'duplicate-id',
              tier: 'caution',
              scope: 'document',
              wcag: '4.1.1 Parsing',
              desc: 'Detection-only rule that warns of duplicate ID attributes causing screen reader conflicts.',
            },
            {
              id: 'dialog-accessible',
              tier: 'safe',
              scope: 'element',
              wcag: '4.1.2 Name, Role, Value',
              desc: 'Ensures <dialog> elements possess aria-labelledby or aria-label for accessibility naming.',
            },
          ].map((rule) => (
            <div
              key={rule.id}
              className="border border-border p-4 rounded-xl bg-card/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-bold text-white font-mono">{rule.id}</code>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      rule.tier === 'safe'
                        ? 'bg-addition/10 text-addition border-addition-border'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {rule.tier}
                  </span>
                  <span className="text-[10px] font-mono text-muted bg-canvas px-1.5 py-0.5 rounded border border-border">
                    {rule.scope}
                  </span>
                </div>
                <p className="text-muted mt-1 leading-relaxed">{rule.desc}</p>
              </div>
              <div className="text-[11px] font-mono text-muted shrink-0 text-right">
                {rule.wcag}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CLI Reference */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">CLI Command Reference</h2>
        <div className="bg-canvas border border-border rounded-xl p-4 font-mono text-xs text-slate-300 flex flex-col gap-2.5 overflow-x-auto">
          <p><span className="text-accent">npx fix11y &lt;path&gt;</span> <span className="text-muted"># Scan and report — no code changed</span></p>
          <p><span className="text-accent">npx fix11y &lt;path&gt; --fix</span> <span className="text-muted"># Interactively review and apply fixes</span></p>
          <p><span className="text-accent">npx fix11y &lt;path&gt; --ci</span> <span className="text-muted"># Exits non-zero on violations for CI quality gates</span></p>
          <p><span className="text-accent">npx fix11y &lt;path&gt; --json</span> <span className="text-muted"># Outputs machine-readable JSON</span></p>
          <p><span className="text-accent">npx fix11y &lt;path&gt; --safety safe</span> <span className="text-muted"># Restrict checks exclusively to safe tier</span></p>
          <p><span className="text-accent">npx fix11y &lt;path&gt; --safety safe -y</span> <span className="text-muted"># Auto-accept all safe fixes</span></p>
        </div>
      </section>

      {/* Navigation */}
      <div className="pt-6 border-t border-border flex items-center justify-between">
        <Link
          href="/docs/getting-started"
          className="text-xs text-muted hover:text-white transition-colors"
        >
          ← Getting Started
        </Link>
        <Link
          href="/docs/playground"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-canvas font-semibold text-xs hover:bg-accent/90 transition-colors shadow"
        >
          <span>Next: Studio Playground</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </article>
  );
}
