'use client';

import React, { useMemo } from 'react';
import { Plus, Minus, FileCode, CheckCircle2 } from 'lucide-react';

/**
 * Parses unified diff text into structured hunk and line data.
 */
function parseUnifiedDiff(diffText) {
  if (!diffText || typeof diffText !== 'string') return { hunks: [], summary: { additions: 0, deletions: 0, hunksCount: 0 } };

  const lines = diffText.split('\n');
  const hunks = [];
  let currentHunk = null;
  let oldLine = 0;
  let newLine = 0;
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    if (line.startsWith('@@')) {
      const match = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      currentHunk = {
        header: line,
        lines: []
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      additions++;
      currentHunk.lines.push({
        type: 'add',
        oldLineNumber: null,
        newLineNumber: newLine++,
        content: line.slice(1)
      });
    } else if (line.startsWith('-')) {
      deletions++;
      currentHunk.lines.push({
        type: 'del',
        oldLineNumber: oldLine++,
        newLineNumber: null,
        content: line.slice(1)
      });
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'ctx',
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
        content: line.slice(1)
      });
    }
  }

  return {
    hunks,
    summary: {
      additions,
      deletions,
      hunksCount: hunks.length
    }
  };
}

export function DiffViewer({ diff }) {
  const { hunks, summary } = useMemo(() => parseUnifiedDiff(diff), [diff]);

  if (!diff || hunks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-muted">
        <CheckCircle2 className="w-8 h-8 text-addition mb-2" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-200">No Differences Detected</p>
        <p className="text-xs text-muted mt-1">Source markup is already compliant or identical.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 font-mono text-xs overflow-hidden">
      {/* Diff Summary Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-canvas border-b border-border text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-addition font-semibold">
            <Plus className="w-3.5 h-3.5" />
            {summary.additions} addition{summary.additions === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1 text-deletion font-semibold">
            <Minus className="w-3.5 h-3.5" />
            {summary.deletions} deletion{summary.deletions === 1 ? '' : 's'}
          </span>
        </div>
        <span className="text-muted">
          {summary.hunksCount} diff hunk{summary.hunksCount === 1 ? '' : 's'}
        </span>
      </div>

      {/* Diff Lines Container */}
      <div
        tabIndex={0}
        aria-label="Unified diff view with line changes"
        className="flex-1 overflow-auto bg-canvas/60 p-1"
      >
        {hunks.map((hunk, hIdx) => (
          <div key={hIdx} className="mb-3 last:mb-0 rounded border border-border/40 overflow-hidden">
            {/* Hunk Header */}
            <div className="px-3 py-1.5 bg-accent-bg text-accent font-semibold text-[11px] border-b border-accent/20 flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5" />
              <span>{hunk.header}</span>
            </div>

            {/* Hunk Lines */}
            <div className="divide-y divide-border/20">
              {hunk.lines.map((l, lIdx) => {
                let rowBg = 'bg-transparent text-slate-300';
                let sign = ' ';
                let signColor = 'text-slate-600';

                if (l.type === 'add') {
                  rowBg = 'bg-addition/10 text-emerald-200';
                  sign = '+';
                  signColor = 'text-addition font-bold';
                } else if (l.type === 'del') {
                  rowBg = 'bg-deletion/10 text-rose-200 line-through opacity-80';
                  sign = '-';
                  signColor = 'text-deletion font-bold';
                }

                return (
                  <div
                    key={lIdx}
                    className={`flex items-start font-mono text-xs leading-5 hover:bg-white/5 transition-colors ${rowBg}`}
                  >
                    {/* Old Line Gutter */}
                    <span
                      aria-hidden="true"
                      className="w-10 text-right pr-2 select-none text-slate-500 font-mono text-[11px] bg-black/20"
                    >
                      {l.oldLineNumber || ''}
                    </span>

                    {/* New Line Gutter */}
                    <span
                      aria-hidden="true"
                      className="w-10 text-right pr-2 select-none text-slate-500 font-mono text-[11px] bg-black/20 border-r border-border/40"
                    >
                      {l.newLineNumber || ''}
                    </span>

                    {/* Change Sign (+/-) */}
                    <span
                      aria-hidden="true"
                      className={`w-5 text-center select-none ${signColor}`}
                    >
                      {sign}
                    </span>

                    {/* Code Content */}
                    <span className="flex-1 px-1 whitespace-pre-wrap break-all select-text font-mono">
                      {l.content || ' '}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
