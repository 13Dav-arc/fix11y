'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Code2, GitCompare, Sparkles, CheckCircle, AlertTriangle } from 'lucide-react';
import { DiffViewer } from './DiffViewer.jsx';

export function EditorPane({
  rawCode,
  setRawCode,
  fixedCode,
  diff,
  stats,
  isEvaluating,
  highlightLine
}) {
  const [activeTab, setActiveTab] = useState('remediated'); // 'remediated' | 'diff'
  const textareaRef = useRef(null);

  const rawLines = (rawCode || '').split('\n');
  const fixedLines = (fixedCode || '').split('\n');

  // Handle jump-to-line focus
  useEffect(() => {
    if (!highlightLine || !textareaRef.current || !rawCode) return;
    const lines = rawCode.split('\n');
    let charPos = 0;
    for (let i = 0; i < Math.min(highlightLine - 1, lines.length); i++) {
      charPos += lines[i].length + 1;
    }

    const endPos = charPos + (lines[highlightLine - 1]?.length || 0);

    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(charPos, endPos);

    // Calculate approximate scroll top
    const lineHeight = 24; // 24px per line (leading-6)
    textareaRef.current.scrollTop = Math.max(0, (highlightLine - 4) * lineHeight);
  }, [highlightLine, rawCode]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
      {/* Left Pane: Raw Source Input */}
      <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-lg">
        {/* Pane Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-canvas/80 border-b border-border text-xs">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Code2 className="w-4 h-4 text-accent" aria-hidden="true" />
            Raw Source Markup
          </div>
          <div className="flex items-center gap-3 text-muted">
            {isEvaluating && (
              <span className="flex items-center gap-1 text-accent animate-pulse text-[11px]">
                <Sparkles className="w-3 h-3" /> Evaluating...
              </span>
            )}
            <span>{rawLines.length} lines</span>
          </div>
        </div>

        {/* Textarea with Line Numbers */}
        <div className="relative flex flex-1 min-h-[500px] bg-canvas/40 font-mono text-xs">
          {/* Line Numbers Gutter */}
          <div
            aria-hidden="true"
            className="w-12 py-3 bg-canvas/60 border-r border-border text-slate-500 text-right pr-3 select-none flex flex-col font-mono"
          >
            {rawLines.map((_, i) => {
              const isTargetLine = highlightLine === i + 1;
              return (
                <span
                  key={i}
                  className={`leading-6 ${
                    isTargetLine ? 'text-accent font-bold bg-accent/20 rounded-l' : ''
                  }`}
                >
                  {i + 1}
                </span>
              );
            })}
          </div>

          {/* Raw Code Textarea */}
          <textarea
            ref={textareaRef}
            value={rawCode}
            onChange={(e) => setRawCode(e.target.value)}
            placeholder="<!-- Paste your HTML5 or Mustache code here -->"
            className="flex-1 p-3 bg-transparent text-slate-100 placeholder-slate-600 resize-none outline-none leading-6 font-mono overflow-auto whitespace-pre"
            aria-label="Raw HTML or Mustache markup input"
            spellCheck="false"
          />
        </div>
      </div>

      {/* Right Pane: Live Remediated / Diff Output */}
      <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-lg">
        {/* Pane Header & Tab Switcher */}
        <div className="flex items-center justify-between px-4 py-2 bg-canvas/80 border-b border-border text-xs">
          {/* Tab Switcher */}
          <div
            role="tablist"
            aria-label="Output view modes"
            className="flex items-center gap-1 bg-canvas p-0.5 rounded-lg border border-border"
          >
            <button
              role="tab"
              aria-selected={activeTab === 'remediated'}
              onClick={() => setActiveTab('remediated')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'remediated'
                  ? 'bg-card text-addition border border-addition-border shadow-sm'
                  : 'text-muted hover:text-white'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Remediated Markup
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'diff'}
              onClick={() => setActiveTab('diff')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'diff'
                  ? 'bg-card text-accent border border-accent/40 shadow-sm'
                  : 'text-muted hover:text-white'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" aria-hidden="true" />
              Visual Diff
            </button>
          </div>

          {/* Fix Status Badge */}
          <div className="flex items-center gap-2">
            {stats.isClean ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-addition/10 text-addition border border-addition-border">
                <CheckCircle className="w-3 h-3" /> 100% Compliant
              </span>
            ) : stats.totalViolations > 0 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-caution/10 text-caution border border-caution-border">
                <AlertTriangle className="w-3 h-3" /> {stats.appliedCount} Fix(es) Applied
              </span>
            ) : null}
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex flex-1 min-h-[500px] bg-canvas/40 font-mono text-xs overflow-hidden">
          {activeTab === 'remediated' ? (
            <div className="flex flex-1 overflow-auto">
              {/* Line Numbers Gutter */}
              <div
                aria-hidden="true"
                className="w-12 py-3 bg-canvas/60 border-r border-border text-slate-500 text-right pr-3 select-none flex flex-col font-mono"
              >
                {fixedLines.map((_, i) => (
                  <span key={i} className="leading-6">
                    {i + 1}
                  </span>
                ))}
              </div>

              {/* Remediated Code Pre */}
              <pre
                tabIndex={0}
                aria-label="Remediated accessible code output"
                className="flex-1 p-3 text-slate-100 leading-6 overflow-auto font-mono whitespace-pre outline-none"
              >
                <code>{fixedCode || '<!-- No markup to remediate -->'}</code>
              </pre>
            </div>
          ) : (
            /* Visual Diff View */
            <DiffViewer diff={diff} />
          )}
        </div>
      </div>
    </div>
  );
}
