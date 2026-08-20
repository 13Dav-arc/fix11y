'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Filter,
  ExternalLink,
  Tag
} from 'lucide-react';

const WCAG_METADATA = {
  'img-alt': {
    name: 'Images Must Have Alt Text',
    wcag: 'WCAG 1.1.1 (Level A)',
    principle: 'Perceivable',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html'
  },
  'form-label': {
    name: 'Form Controls Must Have Labels',
    wcag: 'WCAG 1.3.1 & 4.1.2 (Level A)',
    principle: 'Perceivable & Robust',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html'
  },
  'button-semantics': {
    name: 'Buttons Require Semantic Names & Roles',
    wcag: 'WCAG 2.1.1 & 4.1.2 (Level A)',
    principle: 'Operable & Robust',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html'
  },
  'aria-live-status': {
    name: 'Dynamic Status & Alert Regions Require aria-live',
    wcag: 'WCAG 4.1.3 (Level AA)',
    principle: 'Robust',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html'
  }
};

export function DiagnosticList({ diagnostics = [], onJumpToLine }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'safe' | 'caution'

  const filteredDiagnostics = diagnostics.filter((diag) => {
    if (filter === 'safe') return diag.safety === 'safe';
    if (filter === 'caution') return diag.safety === 'caution';
    return true;
  });

  const safeCount = diagnostics.filter((d) => d.safety === 'safe').length;
  const cautionCount = diagnostics.filter((d) => d.safety === 'caution').length;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-canvas/80 border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-caution" aria-hidden="true" />
          <h2 className="font-bold text-slate-200 text-sm">WCAG Diagnostics & Remediation Rules</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-canvas text-accent border border-border">
            {diagnostics.length} issue{diagnostics.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Filter Controls */}
        <div role="group" aria-label="Filter diagnostics" className="flex items-center gap-1 bg-canvas p-0.5 rounded-lg border border-border">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-card text-white shadow-sm border border-border'
                : 'text-muted hover:text-white'
            }`}
            aria-pressed={filter === 'all'}
          >
            All ({diagnostics.length})
          </button>
          <button
            onClick={() => setFilter('safe')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filter === 'safe'
                ? 'bg-card text-addition border border-addition-border shadow-sm'
                : 'text-muted hover:text-white'
            }`}
            aria-pressed={filter === 'safe'}
          >
            <ShieldCheck className="w-3 h-3 text-addition" />
            Safe ({safeCount})
          </button>
          <button
            onClick={() => setFilter('caution')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filter === 'caution'
                ? 'bg-card text-caution border border-caution-border shadow-sm'
                : 'text-muted hover:text-white'
            }`}
            aria-pressed={filter === 'caution'}
          >
            <ShieldAlert className="w-3 h-3 text-caution" />
            Review ({cautionCount})
          </button>
        </div>
      </div>

      {/* Issues List Container */}
      <div
        tabIndex={0}
        aria-label="WCAG Violations List"
        className="divide-y divide-border/60 max-h-[380px] overflow-auto p-2 space-y-2 bg-canvas/30"
      >
        {filteredDiagnostics.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
            <CheckCircle2 className="w-8 h-8 text-addition mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-200">
              {diagnostics.length === 0
                ? 'No WCAG Violations Detected'
                : 'No issues match the selected safety filter'}
            </p>
            <p className="text-xs text-muted mt-1">
              {diagnostics.length === 0
                ? 'Your markup satisfies the evaluated WCAG 2.1 AA success criteria.'
                : 'Switch filters to inspect other diagnostic categories.'}
            </p>
          </div>
        ) : (
          filteredDiagnostics.map((diag, index) => {
            const meta = WCAG_METADATA[diag.ruleId] || {
              name: diag.ruleId,
              wcag: 'WCAG 2.1 AA',
              principle: 'Accessibility',
              url: 'https://www.w3.org/WAI/WCAG21/quickref/'
            };

            const isSafe = diag.safety === 'safe';

            return (
              <div
                key={index}
                className="p-3.5 rounded-lg border border-border bg-card hover:border-accent/40 hover:bg-cardHover transition-all flex flex-col gap-2"
              >
                {/* Header Row */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-100 px-2 py-0.5 bg-canvas rounded border border-border text-[11px]">
                      {diag.ruleId}
                    </span>
                    <a
                      href={meta.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-accent flex items-center gap-1 text-[11px] underline underline-offset-2"
                      title={`View ${meta.wcag} documentation`}
                    >
                      {meta.wcag}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Safety Badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                      isSafe
                        ? 'bg-addition/10 text-addition border-addition-border'
                        : 'bg-caution/10 text-caution border-caution-border'
                    }`}
                  >
                    {isSafe ? (
                      <>
                        <ShieldCheck className="w-3 h-3" />
                        Safe Auto-Fix
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3 h-3" />
                        Review Advised
                      </>
                    )}
                  </span>
                </div>

                {/* Message */}
                <p className="text-xs text-slate-200 leading-relaxed font-medium">
                  {diag.message}
                </p>

                {/* Location & Jump Button */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px] text-muted">
                  <span className="font-mono text-slate-400">
                    Location: Line {diag.line || 1}, Col {diag.column || 1}
                  </span>

                  {onJumpToLine && diag.line && (
                    <button
                      onClick={() => onJumpToLine(diag.line)}
                      className="flex items-center gap-1 text-accent hover:text-accent-hover font-semibold transition-colors"
                      aria-label={`Jump to line ${diag.line} in editor`}
                    >
                      <span>Jump to line</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
