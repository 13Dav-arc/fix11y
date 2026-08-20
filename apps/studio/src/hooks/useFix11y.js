'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { remediate, createUnifiedDiff } from '@fix11y/core';
import JSZip from 'jszip';

export const PRESETS = {
  'broken-form': {
    name: 'Broken Form & Inputs',
    fileName: 'form.html',
    description: 'Unlinked labels, missing IDs, and unlabelled text controls',
    code: `<form class="checkout-form">
  <h2>Billing Information</h2>
  <label>Cardholder Name</label>
  <input type="text" name="cardholder" placeholder="Jane Doe">

  <label>Email Address</label>
  <input type="email" name="email">

  <input type="tel" name="phone-number" placeholder="Enter phone">
  <button class="submit-btn">Pay Now</button>
</form>`
  },
  'broken-media': {
    name: 'Missing Alt & Div Buttons',
    fileName: 'profile.html',
    description: 'Images without alt text, div/span click triggers, and unlabelled icon buttons',
    code: `<section class="user-profile">
  <div class="avatar-container">
    <img src="avatar.jpg" title="User Profile Photo">
    <img src="badge-verified.svg">
  </div>
  
  <div onclick="toggleFollow()" class="btn-follow">Follow User</div>
  <span onclick="openShareModal()" class="share-trigger">Share Profile</span>
  
  <button class="close-btn"></button>
</section>`
  },
  'mustache-auth': {
    name: 'Mustache Dynamic Template',
    fileName: 'auth.mustache',
    description: 'Handlebars conditional directives, live status feedback, and action handlers',
    code: `<div class="auth-card {{#if isNewUser}}animate-fade-in{{/if}}">
  <img src="{{app.logoUrl}}">
  
  {{#if requires2FA}}
    <div class="alert-box">
      <p>Two-factor authentication code sent to {{user.maskedPhone}}</p>
    </div>
    
    <label>Verification Code</label>
    <input type="text" name="two-factor-code" placeholder="123456">
  {{/if}}
  
  <div onclick="resendCode('{{user.id}}')" class="btn-resend"></div>
</div>`
  }
};

function remediateFile(code, fileName, safetyMode) {
  if (!code || typeof code !== 'string') {
    return {
      fixedCode: '',
      diff: '',
      diagnostics: [],
      patches: [],
      stats: { totalViolations: 0, safeCount: 0, cautionCount: 0, appliedCount: 0, isClean: true }
    };
  }

  const safetyLevels = safetyMode === 'safe' ? ['safe'] : ['safe', 'caution'];
  const result = remediate(code, { safetyLevels });
  const unifiedDiff = createUnifiedDiff(code, result.patched, {
    fromFile: fileName || 'original.html',
    toFile: fileName ? `remediated_${fileName}` : 'remediated.html',
    color: false
  });

  const diagnostics = result.diagnostics || [];
  const patches = result.patches || [];
  const safeCount = diagnostics.filter((d) => d.safety === 'safe').length;
  const cautionCount = diagnostics.filter((d) => d.safety === 'caution').length;

  return {
    fixedCode: result.patched,
    diff: unifiedDiff,
    diagnostics,
    patches,
    stats: {
      totalViolations: diagnostics.length,
      safeCount,
      cautionCount,
      appliedCount: patches.length,
      isClean: diagnostics.length === 0 && code.trim().length > 0
    }
  };
}

export function useFix11y(initialPreset = 'broken-form') {
  const [safetyMode, setSafetyMode] = useState('all'); // 'all' | 'safe'
  const [activePreset, setActivePreset] = useState(initialPreset);
  const [activeFileId, setActiveFileId] = useState('default');
  const [announcement, setAnnouncement] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [files, setFiles] = useState(() => {
    const preset = PRESETS[initialPreset];
    const initialRemediation = remediateFile(preset.code, preset.fileName, 'all');
    return [
      {
        id: 'default',
        name: preset.fileName,
        rawCode: preset.code,
        ...initialRemediation
      }
    ];
  });

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  const debounceTimerRef = useRef(null);

  // Recalculate remediation when safety mode or active raw code changes
  const runEvaluation = useCallback((code, fileId, mode) => {
    setFiles((prevFiles) =>
      prevFiles.map((file) => {
        if (file.id !== fileId) return file;
        const result = remediateFile(code, file.name, mode);
        return {
          ...file,
          rawCode: code,
          ...result
        };
      })
    );
    setIsEvaluating(false);
  }, []);

  const updateActiveRawCode = useCallback((newCode) => {
    if (!activeFile) return;
    setIsEvaluating(true);

    // Optimistically update rawCode immediately for responsive typing
    setFiles((prevFiles) =>
      prevFiles.map((f) => (f.id === activeFile.id ? { ...f, rawCode: newCode } : f))
    );

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      runEvaluation(newCode, activeFile.id, safetyMode);
    }, 150);
  }, [activeFile, safetyMode, runEvaluation]);

  // When safety mode changes, re-evaluate all loaded files
  useEffect(() => {
    setFiles((prevFiles) =>
      prevFiles.map((file) => {
        const result = remediateFile(file.rawCode, file.name, safetyMode);
        return {
          ...file,
          ...result
        };
      })
    );
  }, [safetyMode]);

  // Update screen-reader announcement based on active file stats
  useEffect(() => {
    if (!activeFile) return;
    const total = activeFile.diagnostics.length;
    if (total === 0) {
      setAnnouncement(`Audit complete for ${activeFile.name}: markup is 100% WCAG compliant.`);
    } else {
      setAnnouncement(
        `Audit complete for ${activeFile.name}: ${total} violations found (${activeFile.stats.safeCount} safe, ${activeFile.stats.cautionCount} review-advised).`
      );
    }
  }, [activeFile?.diagnostics?.length, activeFile?.name, activeFile?.stats]);

  const loadPreset = useCallback((presetKey) => {
    if (PRESETS[presetKey]) {
      setActivePreset(presetKey);
      const preset = PRESETS[presetKey];
      const result = remediateFile(preset.code, preset.fileName, safetyMode);
      const newFile = {
        id: `preset-${Date.now()}`,
        name: preset.fileName,
        rawCode: preset.code,
        ...result
      };
      setFiles([newFile]);
      setActiveFileId(newFile.id);
    }
  }, [safetyMode]);

  const addFiles = useCallback((fileList) => {
    if (!fileList || fileList.length === 0) return;
    setActivePreset(null);

    const newEntries = fileList.map((f, index) => {
      const result = remediateFile(f.content, f.name, safetyMode);
      return {
        id: `file-${Date.now()}-${index}`,
        name: f.name,
        rawCode: f.content,
        ...result
      };
    });

    setFiles((prev) => [...newEntries, ...prev]);
    setActiveFileId(newEntries[0].id);
  }, [safetyMode]);

  const removeFile = useCallback((fileId) => {
    setFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== fileId);
      if (filtered.length === 0) {
        const preset = PRESETS['broken-form'];
        const res = remediateFile(preset.code, preset.fileName, safetyMode);
        const fallback = {
          id: 'default',
          name: preset.fileName,
          rawCode: preset.code,
          ...res
        };
        setActiveFileId(fallback.id);
        return [fallback];
      }
      if (activeFileId === fileId) {
        setActiveFileId(filtered[0].id);
      }
      return filtered;
    });
  }, [activeFileId, safetyMode]);

  const resetAll = useCallback(() => {
    setActivePreset(null);
    const emptyFile = {
      id: `empty-${Date.now()}`,
      name: 'index.html',
      rawCode: '',
      ...remediateFile('', 'index.html', safetyMode)
    };
    setFiles([emptyFile]);
    setActiveFileId(emptyFile.id);
  }, [safetyMode]);

  // Export all remediated files as a single ZIP
  const exportZip = useCallback(async () => {
    if (!files || files.length === 0) return;
    try {
      const zip = new JSZip();
      files.forEach((f) => {
        const content = f.fixedCode || f.rawCode || '';
        zip.file(f.name, content);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fix11y-remediated-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export ZIP:', err);
    }
  }, [files]);

  // Export active single file
  const exportSingleFile = useCallback(() => {
    if (!activeFile) return;
    const content = activeFile.fixedCode || activeFile.rawCode || '';
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remediated_${activeFile.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeFile]);

  // Aggregated total batch statistics
  const totalStats = {
    fileCount: files.length,
    totalViolations: files.reduce((acc, f) => acc + (f.diagnostics?.length || 0), 0),
    totalSafe: files.reduce((acc, f) => acc + (f.stats?.safeCount || 0), 0),
    totalCaution: files.reduce((acc, f) => acc + (f.stats?.cautionCount || 0), 0),
    totalApplied: files.reduce((acc, f) => acc + (f.stats?.appliedCount || 0), 0)
  };

  return {
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
  };
}
