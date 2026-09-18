'use client';

import React, { useState } from 'react';
import { Lock, Zap, Github, Terminal } from 'lucide-react';
import { useFix11y } from '../hooks/useFix11y.js';
import { Toolbar } from '../components/Toolbar.jsx';
import { FileUploader } from '../components/FileUploader.jsx';
import { EditorPane } from '../components/EditorPane.jsx';
import { DiagnosticList } from '../components/DiagnosticList.jsx';
import { Announcer } from '../components/Announcer.jsx';
import { Navbar } from '../components/Navbar.jsx';

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

      {/* Shared Header Navigation */}
      <Navbar activeTab="playground" />

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
