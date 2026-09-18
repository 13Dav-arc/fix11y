'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Zap, Github, Lock, Menu, X, BookOpen, Bot, Code2 } from 'lucide-react';

export function Navbar({ activeTab = 'playground' }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'playground', label: 'Playground', href: '/', icon: Code2 },
    { id: 'agent', label: 'Autonomous Agent', href: '/agent', icon: Bot },
    { id: 'docs', label: 'Documentation', href: '/docs', icon: BookOpen },
  ];

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur px-4 sm:px-6 py-3.5 sticky top-0 z-30 flex items-center justify-between">
      {/* Brand & Logo */}
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-accent to-addition flex items-center justify-center shadow-md shadow-accent/10 group-hover:scale-105 transition-transform">
            <Zap className="w-4 h-4 text-canvas fill-canvas" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold tracking-tight text-white">fix11y</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-accent/10 border border-accent/30 text-accent">
                Studio
              </span>
              <span className="hidden sm:inline-block text-[10px] font-mono text-muted bg-canvas px-1.5 py-0.2 rounded border border-border">
                v0.1.0
              </span>
            </div>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-1 border-l border-border/80 pl-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-muted hover:text-slate-200 hover:bg-cardHover'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right Action Icons & Badges */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-addition/10 border border-addition-border text-addition text-xs font-semibold">
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>100% Private • Air-Gapped</span>
        </div>

        <a
          href="https://github.com/13Dav-arc/fix11y"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-canvas hover:bg-cardHover hover:text-white transition-colors text-muted"
          aria-label="View fix11y on GitHub"
        >
          <Github className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">GitHub</span>
        </a>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-1.5 rounded-lg text-muted hover:text-white hover:bg-cardHover"
          aria-expanded={mobileMenuOpen}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-card border-b border-border p-4 flex flex-col gap-2 shadow-2xl animate-fadeIn">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-muted hover:text-white hover:bg-cardHover'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}

export default Navbar;
