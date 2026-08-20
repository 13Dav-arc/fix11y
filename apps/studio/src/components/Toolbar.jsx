'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Archive,
  Download,
  FileText,
  X
} from 'lucide-react';
import { PRESETS } from '../hooks/useFix11y.js';

export function Toolbar({
  files = [],
  activeFileId,
  setActiveFileId,
  onRemoveFile,
  safetyMode,
  setSafetyMode,
  activePreset,
  loadPreset,
  onReset,
  onExportZip,
  onExportCurrentFile,
  activeFixedCode,
  totalStats
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!activeFixedCode) return;
    try {
      await navigator.clipboard.writeText(activeFixedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <nav
      aria-label="Studio Actions & File Management Toolbar"
      className="flex flex-col gap-3 p-4 bg-card border-b border-border text-sm"
    >
      {/* Top Row: Presets & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Quick Presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted font-medium flex items-center gap-1.5 mr-1 text-xs">
            <Sparkles className="w-4 h-4 text-accent" aria-hidden="true" />
            Quick Presets:
          </span>
          {Object.entries(PRESETS).map(([key, item]) => {
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                onClick={() => loadPreset(key)}
                className={`px-3 py-1.5 rounded-md font-medium text-xs transition-all border ${
                  isActive
                    ? 'bg-accent-bg border-accent text-accent font-semibold shadow-sm'
                    : 'bg-canvas/50 border-border text-muted hover:text-white hover:border-muted/50'
                }`}
                aria-pressed={isActive}
              >
                {item.name}
              </button>
            );
          })}
        </div>

        {/* Right: Actions & Exports */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Safety Filter Toggle */}
          <div
            role="group"
            aria-label="Safety Confidence Filter"
            className="flex items-center bg-canvas p-1 rounded-lg border border-border"
          >
            <button
              onClick={() => setSafetyMode('all')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-all ${
                safetyMode === 'all'
                  ? 'bg-card text-white font-medium shadow-sm border border-border'
                  : 'text-muted hover:text-white'
              }`}
              aria-pressed={safetyMode === 'all'}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-caution" aria-hidden="true" />
              All Fixes
            </button>
            <button
              onClick={() => setSafetyMode('safe')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-all ${
                safetyMode === 'safe'
                  ? 'bg-card text-addition font-medium shadow-sm border border-addition-border'
                  : 'text-muted hover:text-white'
              }`}
              aria-pressed={safetyMode === 'safe'}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-addition" aria-hidden="true" />
              Safe Only
            </button>
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            disabled={!activeFixedCode}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              copied
                ? 'bg-addition/20 border-addition text-addition'
                : 'bg-canvas border-border hover:border-accent/60 text-slate-200 hover:text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={copied ? 'Markup copied to clipboard' : 'Copy remediated markup to clipboard'}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                Copy Markup
              </>
            )}
          </button>

          {/* Single File Export */}
          <button
            onClick={onExportCurrentFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-canvas hover:bg-cardHover text-slate-200 transition-colors"
            title="Download active remediated file"
            aria-label="Download active remediated file"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">Export File</span>
          </button>

          {/* ZIP Batch Export (Highlighted when multiple files) */}
          <button
            onClick={onExportZip}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-canvas border border-accent transition-all shadow-sm"
            title="Export all files as a ZIP archive"
            aria-label="Export all files as a ZIP archive"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Download ZIP ({files.length})</span>
          </button>

          {/* Reset Button */}
          <button
            onClick={onReset}
            className="p-1.5 rounded-lg border border-border text-muted hover:text-white hover:bg-cardHover transition-colors"
            title="Reset workspace"
            aria-label="Reset workspace and clear loaded templates"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Bottom Row: File Switcher Tabs (when 1 or more files exist) */}
      <div
        role="tablist"
        aria-label="Loaded Template Files"
        className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-border/50 pb-1"
      >
        <span className="text-muted text-xs font-mono pr-2 flex items-center gap-1">
          <FileText className="w-3.5 h-3.5 text-accent" />
          Files:
        </span>
        {files.map((file) => {
          const isSelected = file.id === activeFileId;
          const issueCount = file.diagnostics?.length || 0;

          return (
            <div
              key={file.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveFileId(file.id)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-all cursor-pointer border select-none ${
                isSelected
                  ? 'bg-canvas text-white border-accent shadow-sm'
                  : 'bg-canvas/40 text-muted border-border hover:text-slate-200 hover:border-border/80'
              }`}
            >
              <span>{file.name}</span>
              {issueCount > 0 ? (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-caution/10 text-caution border border-caution-border">
                  {issueCount}
                </span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-addition" title="100% Compliant" />
              )}

              {files.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(file.id);
                  }}
                  className="opacity-40 group-hover:opacity-100 hover:text-deletion p-0.5 rounded transition-all"
                  aria-label={`Remove file ${file.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
