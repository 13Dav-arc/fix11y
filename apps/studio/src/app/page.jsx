'use client';

import React, { useState } from 'react';
import { ShieldCheck, Zap, Github, Terminal, Layers, Sparkles } from 'lucide-react';
import { useFix11y } from '../hooks/useFix11y.js';
import { Toolbar } from '../components/Toolbar.jsx';
import { FileUploader } from '../components/FileUploader.jsx';
import { EditorPane } from '../components/EditorPane.jsx';
import { DiagnosticList } from '../components/DiagnosticList.jsx';
import { Announcer } from '../components/Announcer.jsx';

export default function StudioPage() {
  const [highlightLine, setHighlightLine] = useState(null);

  const {
    files,
    activeFileId,
    setActiveFileId,
    activeFile,
    updateActiveRawCode,
    safetyMode,
    setSafetyMode,
    isEvaluating,
    activePreset,
    loadPreset,
    addFiles,
    removeFile,
    resetAll,
    exportZip,
    exportSingleFile,
    totalStats,
    announcement
  } = useFix11y('broken-form');

  const handleFilesLoaded = (loadedFiles) => {
    addFiles(loadedFiles);
  };

  const handleJumpToLine = (line) => {
    setHighlightLine(line);
    // Reset highlight state after brief animation
    setTimeout(() => {
      setHighlightLine(null);
    }, 2000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-canvas text-slate-100">
      {/* Screen Reader Live Status Announcer */}
      <Announcer message={announcement} />

      {/* Header Landmark */}
      <header className="border-b border-border bg-card/80 backdrop-blur px-6 py-4 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-accent to-addition flex items-center justify-center shadow-lg shadow-accent/10">
            <Zap className="w-5 h-5 text-canvas fill-canvas" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                fix11y <span className="text-accent font-semibold text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30">Studio</span>
              </h1>
              <span className="text-[11px] font-mono text-muted bg-canvas px-2 py-0.5 rounded border border-border">v0.1.0</span>
            </div>
            <p className="text-xs text-muted">Zero-dependency automated WCAG 2.1 AA accessibility remediation engine</p>
          </div>
        </div>

        {/* Header Badges & Links */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-addition/10 border border-addition-border text-addition text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            Pure Client-Side AST Engine
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
        </div>
      </header>

      {/* Main Workspace Landmark */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Multi-file Ingestion Dropzone */}
        <FileUploader
          onFilesLoaded={handleFilesLoaded}
          fileCount={files.length}
          currentFileName={activeFile?.name}
        />

        {/* Workspace Toolbar & File Switcher */}
        <div className="rounded-xl border border-border overflow-hidden shadow-md">
          <Toolbar
            files={files}
            activeFileId={activeFileId}
            setActiveFileId={setActiveFileId}
            onRemoveFile={removeFile}
            safetyMode={safetyMode}
            setSafetyMode={setSafetyMode}
            activePreset={activePreset}
            loadPreset={loadPreset}
            onReset={resetAll}
            onExportZip={exportZip}
            onExportCurrentFile={exportSingleFile}
            activeFixedCode={activeFile?.fixedCode}
            totalStats={totalStats}
          />

          {/* Dual Split Code & Diff Editor */}
          <div className="p-4 bg-canvas/30">
            <EditorPane
              rawCode={activeFile?.rawCode || ''}
              setRawCode={updateActiveRawCode}
              fixedCode={activeFile?.fixedCode || ''}
              diff={activeFile?.diff || ''}
              stats={activeFile?.stats || { totalViolations: 0, appliedCount: 0, isClean: true }}
              isEvaluating={isEvaluating}
              highlightLine={highlightLine}
            />
          </div>
        </div>

        {/* WCAG Diagnostics & Rule Details Panel */}
        <DiagnosticList
          diagnostics={activeFile?.diagnostics || []}
          onJumpToLine={handleJumpToLine}
        />
      </main>

      {/* Footer Landmark */}
      <footer className="border-t border-border bg-card/40 px-6 py-4 text-xs text-muted flex flex-wrap items-center justify-between gap-4 mt-auto">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent" aria-hidden="true" />
          <span>CLI available via <code className="font-mono text-slate-200">npx fix11y ./src --fix</code></span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400">WCAG 2.1 AA Compliant Rules</span>
          <span className="text-slate-600">•</span>
          <span className="text-addition">0 npm Runtime Dependencies in Engine</span>
        </div>
      </footer>
    </div>
  );
}
