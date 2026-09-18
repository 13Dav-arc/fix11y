import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Terminal, BookOpen, Bot, HelpCircle } from 'lucide-react';

export const metadata = {
  title: 'Documentation Hub — fix11y Studio',
  description: 'Guides, API reference, CLI architecture, and security models for fix11y accessibility engine.',
};

const SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    href: '/docs/getting-started',
    icon: Sparkles,
    description: 'Quickstart in 60s, Core vs Playground vs Agent',
  },
  {
    id: 'core',
    title: 'Core Engine & Rules',
    href: '/docs/core',
    icon: Terminal,
    description: 'CLI flags, CST patching, WCAG rule catalog',
  },
  {
    id: 'playground',
    title: 'Studio Playground',
    href: '/docs/playground',
    icon: BookOpen,
    description: 'In-browser preview, Myers diffs, diagnostics',
  },
  {
    id: 'agent',
    title: 'Autonomous Agent',
    href: '/docs/agent',
    icon: Bot,
    description: '3-job DAG, public vs private routing, PR verification',
  },
  {
    id: 'faq',
    title: 'FAQ & Security',
    href: '/docs/faq',
    icon: HelpCircle,
    description: 'Privacy guarantees, limits, beta pricing',
  },
];

export default function DocsIndexPage() {
  return (
    <article className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-3 pb-6 border-b border-border/70">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/10 border border-accent/30 text-accent">
            Documentation Hub
          </span>
          <span className="text-xs font-mono text-muted bg-card px-2 py-0.5 rounded border border-border">
            WCAG 2.1/2.2 AA
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          fix11y Documentation
        </h1>
        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
          Everything you need to integrate automated accessibility auditing, surgical AST patching, and autonomous
          CI engineering into your workflow.
        </p>
      </div>

      {/* Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.id}
              href={section.href}
              className="group p-5 rounded-xl border border-border bg-card/80 hover:bg-cardHover hover:border-accent/40 transition-all flex flex-col justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-canvas border border-border text-accent group-hover:scale-105 transition-transform">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white group-hover:text-accent transition-colors">
                    {section.title}
                  </h2>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    {section.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center text-xs font-medium text-accent gap-1 pt-2 border-t border-border/40">
                <span>Explore guide</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Start CTA */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white">New to fix11y?</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Start with the 60-second quickstart guide to understand the three core pillars.
          </p>
        </div>
        <Link
          href="/docs/getting-started"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-canvas font-semibold text-xs hover:bg-accent-hover transition-colors shrink-0 shadow-sm"
        >
          <span>Get Started in 60s</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
