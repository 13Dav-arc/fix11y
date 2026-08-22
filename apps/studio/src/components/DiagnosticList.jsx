'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

const WCAG_METADATA = {
  'form-label': {
    title: 'Form Input Missing Label',
    wcag: 'WCAG 1.3.1 & 4.1.2',
    principle: 'Perceivable & Robust',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html'
  },
  'img-alt': {
    title: 'Image Missing Description',
    wcag: 'WCAG 1.1.1',
    principle: 'Perceivable',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html'
  },
  'button-semantics': {
    title: 'Non-Semantic Clickable Element',
    wcag: 'WCAG 2.1.1 & 4.1.2',
    principle: 'Operable & Robust',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html'
  },
  'aria-live-status': {
    title: 'Live Region Missing Status Alert',
    wcag: 'WCAG 4.1.3',
    principle: 'Robust',
    url: 'https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html'
  }
};

/**
 * Renders technical diagnostic messages with highlighted inline HTML/attribute tags.
 */
function renderStyledMessage(message) {
  if (!message || typeof message !== 'string') return message;

  // Regex matches <tag>, attribute="val", attribute='val', or specific code keywords
  const parts = message.split(/(<[^>]+>|[a-zA-Z-]+="[^"]*"|[a-zA-Z-]+='[^']*'|\b(?:aria-label|aria-live|role|alt|id|for|onclick|type)\b)/g);

  return parts.map((part, index) => {
    if (!part) return null;
    const isTagOrAttr =
      part.startsWith('<') ||
      part.includes('="') ||
      part.includes("='") ||
      ['aria-label', 'aria-live', 'role', 'alt', 'id', 'for', 'onclick', 'type'].includes(part);

    if (isTagOrAttr) {
      return (
        <code
          key={index}
          className="font-mono text-accent bg-canvas/90 px-1 py-0.5 rounded border border-border/60 text-[11px] font-semibold mx-0.5"
        >
          {part}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

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
          <h2 className="font-bold text-slate-200 text-sm">WCAG Accessibility Diagnostics</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-canvas text-accent border border-border">
            {diagnostics.length} issue{diagnostics.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Filter Controls */}
        <div role="group" aria-label="Filter diagnostics by safety level" className="flex items-center gap-1 bg-canvas p-0.5 rounded-lg border border-border">
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
        aria-label="Accessibility Violations List"
        className="divide-y divide-border/60 max-h-[380px] overflow-auto p-2 space-y-2 bg-canvas/30"
      >
        {filteredDiagnostics.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted">
            <CheckCircle2 className="w-8 h-8 text-addition mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-200">
              {diagnostics.length === 0
                ? 'All Clear! No Accessibility Violations Detected'
                : 'No issues match the selected safety filter'}
            </p>
            <p className="text-xs text-muted mt-1">
              {diagnostics.length === 0
                ? 'Your markup satisfies the evaluated WCAG 2.1 AA success criteria.'
                : 'Switch filters above to inspect other diagnostic categories.'}
            </p>
          </div>
        ) : (
          filteredDiagnostics.map((diag, index) => {
            const meta = WCAG_METADATA[diag.ruleId] || {
              title: diag.ruleId,
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
                {/* Header Row: Humanized Title + Code Tag + WCAG Spec Link */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-100 text-xs">
                      {meta.title}
                    </h3>
                    <span className="font-mono text-slate-400 px-1.5 py-0.5 bg-canvas rounded border border-border text-[10px]">
                      [{diag.ruleId}]
                    </span>
                    <a
                      href={meta.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-accent flex items-center gap-1 text-[11px] underline underline-offset-2"
                      title={`View ${meta.wcag} documentation on W3C`}
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

                {/* Technical Explanation with Formatted Code Badges */}
                <p className="text-xs text-slate-200 leading-relaxed font-normal">
                  {renderStyledMessage(diag.message)}
                </p>

                {/* Location & Jump Button */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px] text-muted">
                  <span className="font-mono text-slate-400">
                    Line {diag.line || 1}, Column {diag.column || 1}
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
