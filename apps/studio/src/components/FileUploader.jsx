'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileCode, CheckCircle2, Layers } from 'lucide-react';

export function FileUploader({ onFilesLoaded, fileCount = 1, currentFileName }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    const readPromises = filesArray.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve({
            name: file.name,
            content: typeof event.target.result === 'string' ? event.target.result : ''
          });
        };
        reader.readAsText(file);
      });
    });

    Promise.all(readPromises).then((loadedFiles) => {
      onFilesLoaded(loadedFiles);
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <section
      aria-label="Multi-file Ingestion Dropzone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-4 transition-all cursor-pointer flex flex-wrap items-center justify-between gap-4 ${
        isDragging
          ? 'border-accent bg-accent-bg scale-[1.005]'
          : 'border-border bg-card/60 hover:bg-card hover:border-muted/50'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".html,.htm,.mustache,.hbs,.handlebars"
        onChange={handleFileInput}
        className="hidden"
        aria-label="Upload multiple HTML or Mustache template files"
      />

      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-canvas border border-border text-accent">
          <UploadCloud className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">
            {fileCount > 1 ? (
              <span className="flex items-center gap-1.5 text-addition">
                <Layers className="w-4 h-4" />
                {fileCount} Template Files Loaded (Batch Mode)
              </span>
            ) : currentFileName ? (
              <span className="flex items-center gap-1.5 text-addition">
                <CheckCircle2 className="w-4 h-4" />
                Loaded: {currentFileName}
              </span>
            ) : (
              'Drop single or batch HTML5 / Mustache templates here, or click to browse'
            )}
          </p>
          <p className="text-xs text-muted">
            Supports batch ingestion of <code className="text-slate-300">.html</code>, <code className="text-slate-300">.mustache</code>, and <code className="text-slate-300">.hbs</code> with 100% format preservation.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs font-medium text-muted bg-canvas px-3 py-1.5 rounded-md border border-border">
        <FileCode className="w-3.5 h-3.5 text-accent" />
        Batch Client-Side Ingestion
      </div>
    </section>
  );
}
