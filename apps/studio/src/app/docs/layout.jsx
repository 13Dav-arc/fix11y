'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Terminal, Sparkles, Bot, HelpCircle, ChevronRight } from 'lucide-react';
import { Navbar } from '../../components/Navbar.jsx';

export const DOC_SECTIONS = [
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

export default function DocsLayout({ children }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-screen bg-canvas text-slate-100">
      {/* Skip to Content Link for Keyboard / Screen Reader Accessibility */}
      <a
        href="#docs-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-canvas focus:font-bold focus:rounded-lg focus:shadow-xl focus:outline-none"
      >
        Skip to main documentation content
      </a>

      {/* Global Navbar */}
      <Navbar activeTab="docs" />

      {/* Main Documentation Shell */}
      <div className="flex-1 max-w-[1500px] w-full mx-auto flex flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <aside
          aria-label="Documentation Navigation"
          className="w-full md:w-64 lg:w-72 border-b md:border-b-0 md:border-r border-border/80 p-4 sm:p-6 shrink-0 bg-card/30"
        >
          <div className="sticky top-20 flex flex-col gap-6">
            <div>
              <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                Documentation Hub
              </h2>
              <nav aria-label="Documentation sections" className="flex flex-col gap-1">
                {DOC_SECTIONS.map((sec) => {
                  const Icon = sec.icon;
                  const isActive = pathname === sec.href;
                  return (
                    <Link
                      key={sec.id}
                      href={sec.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                          : 'text-muted hover:text-white hover:bg-cardHover'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{sec.title}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="p-3.5 rounded-xl border border-border/70 bg-canvas/60 flex flex-col gap-2 text-[11px] text-muted">
              <span className="font-semibold text-slate-200">Need immediate help?</span>
              <p className="leading-relaxed">
                Check the interactive Playground to experiment directly or inspect rule diagnostics.
              </p>
              <Link href="/" className="text-accent font-medium hover:underline flex items-center gap-1">
                <span>Open Playground</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </aside>

        {/* Article Landmark */}
        <main
          id="docs-content"
          tabIndex={-1}
          className="flex-1 p-6 sm:p-8 lg:p-12 max-w-4xl focus:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
