/**
 * Accessible Real-Time Agent Activity Stream Component.
 *
 * Implements:
 * - On-mount state rehydration via GET /api/agent/state.
 * - Live Server-Sent Events (SSE) telemetry via GET /api/agent/stream.
 * - Screen-reader friendly aria-live="polite" status announcer (WCAG 4.1.3).
 * - Keyboard focus management shifting to "Review Pull Request" upon completion.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Terminal, CheckCircle2, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';

export function AgentActivityStream({
  repo = 'acme-corp/storefront',
  targetDir = '.',
  threadId = 'session-default',
  className = '',
}) {
  const [logs, setLogs] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('rehydrating');
  const [announcement, setAnnouncement] = useState('');
  const [prUrl, setPrUrl] = useState(null);
  const [budgetCapReached, setBudgetCapReached] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logContainerRef = useRef(null);
  const prLinkRef = useRef(null);
  const eventSourceRef = useRef(null);

  const formatTimestamp = (ts) => {
    return new Date(ts || Date.now()).toISOString().substring(11, 19);
  };

  const addLog = (level, message, details = null) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: formatTimestamp(),
        level,
        message,
        details,
      },
    ]);
  };

  // 1. On Mount: Fetch historical state and rehydrate
  useEffect(() => {
    let isCancelled = false;

    async function rehydrateState() {
      setConnectionStatus('rehydrating');
      setAnnouncement('Rehydrating past agent activity state...');

      try {
        const res = await fetch(
          `/api/agent/state?repo=${encodeURIComponent(repo)}&threadId=${encodeURIComponent(threadId)}`
        );
        if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

        const data = await res.json();
        if (isCancelled) return;

        if (data.found && Array.isArray(data.events) && data.events.length > 0) {
          const rehydratedLogs = data.events.map((evt) => ({
            id: evt.id,
            timestamp: formatTimestamp(evt.timestamp),
            level:
              evt.type === 'complete'
                ? 'success'
                : evt.type === 'patch_applied'
                ? 'info'
                : evt.type === 'issue_quarantined'
                ? 'warn'
                : 'start',
            message: evt.message,
            details: evt.details,
          }));

          setLogs(rehydratedLogs);
          if (data.prUrl) setPrUrl(data.prUrl);
          if (data.budgetCapReached) setBudgetCapReached(true);
          if (data.status === 'completed') setConnectionStatus('completed');
          setAnnouncement(`Rehydrated ${rehydratedLogs.length} previous execution milestones.`);
        } else {
          addLog('start', `Initialized agent session for ${repo}`);
        }
      } catch (err) {
        if (!isCancelled) {
          addLog('warn', 'Starting fresh session (no past checkpoint found).');
        }
      } finally {
        if (!isCancelled && connectionStatus !== 'completed') {
          connectToSse();
        }
      }
    }

    // 2. Establish SSE streaming connection
    function connectToSse() {
      setConnectionStatus('connected');
      setAnnouncement(`Connected to live agent stream for ${repo}.`);

      const sseUrl = `/api/agent/stream?repo=${encodeURIComponent(repo)}&targetDir=${encodeURIComponent(
        targetDir
      )}&threadId=${encodeURIComponent(threadId)}`;

      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);

          if (payload.type === 'connected') {
            addLog('info', payload.message);
          } else if (payload.type === 'transition') {
            const phase = payload.phase ? payload.phase.toUpperCase() : 'STEP';
            addLog('start', `[${phase}] State transition reached (Step ${payload.step ?? '-'})`);

            if (payload.latestPatch) {
              addLog(
                'info',
                `Surgical patch applied to ${payload.latestPatch.filePath}: ${payload.latestPatch.rationale}`
              );
              setAnnouncement(
                `Surgical fix applied to ${payload.latestPatch.filePath}. ${payload.latestPatch.rationale}`
              );
            }

            if (payload.budgetCapReached) {
              setBudgetCapReached(true);
              addLog('warn', 'Circuit breaker triggered: Budget cap reached.');
              setAnnouncement('Warning: Budget cap reached. Remaining issues quarantined.');
            }
          } else if (payload.type === 'completed') {
            setConnectionStatus('completed');
            if (payload.prUrl) {
              setPrUrl(payload.prUrl);
              addLog('success', `Autonomous remediation complete! Pull Request: ${payload.prUrl}`);
              setAnnouncement('Autonomous remediation complete. Pull request ready for review.');
            } else {
              addLog('success', 'Autonomous remediation cycle finished.');
              setAnnouncement('Remediation cycle finished.');
            }
            es.close();
          }
        } catch {
          // Ignore heartbeats or non-JSON payloads
        }
      };

      es.onerror = () => {
        setConnectionStatus('disconnected');
        es.close();
      };
    }

    rehydrateState();

    return () => {
      isCancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [repo, targetDir, threadId]);

  // 3. Auto-scroll terminal log
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 4. Focus Management: Shift focus to PR Link upon completion
  useEffect(() => {
    if (connectionStatus === 'completed' && prLinkRef.current) {
      prLinkRef.current.focus();
    }
  }, [connectionStatus, prUrl]);

  return (
    <section
      aria-label="Autonomous Agent Live Activity Stream"
      className={`flex flex-col bg-slate-950 text-slate-100 font-mono text-xs rounded-xl border border-slate-800 shadow-2xl overflow-hidden ${className}`}
    >
      {/* Screen reader only live announcer */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Terminal Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-sky-400" aria-hidden="true" />
          <span className="font-semibold text-slate-200">fix11y Agent Activity</span>
          <span className="text-slate-500">({repo})</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5" aria-label={`Status: ${connectionStatus}`}>
            {connectionStatus === 'connected' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                <span className="text-[11px] text-emerald-400 font-medium">Live</span>
              </>
            )}
            {connectionStatus === 'rehydrating' && (
              <>
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" aria-hidden="true" />
                <span className="text-[11px] text-amber-400 font-medium">Rehydrating</span>
              </>
            )}
            {connectionStatus === 'completed' && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span className="text-[11px] text-emerald-400 font-medium">Finished</span>
              </>
            )}
            {connectionStatus === 'disconnected' && (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                <span className="text-[11px] text-slate-400 font-medium">Idle</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
              autoScroll
                ? 'bg-slate-800 border-slate-700 text-sky-400'
                : 'bg-transparent border-slate-800 text-slate-500'
            }`}
          >
            {autoScroll ? 'Auto-scroll: On' : 'Auto-scroll: Off'}
          </button>
        </div>
      </header>

      {/* Budget Cap Notice Banner */}
      {budgetCapReached && (
        <div
          role="alert"
          className="flex items-center gap-2 px-4 py-2 bg-amber-950/40 border-b border-amber-900/50 text-amber-300 text-[11px]"
        >
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span>
            <strong>Circuit Breaker:</strong> Budget cap reached. Remaining violations have been quarantined.
          </span>
        </div>
      )}

      {/* Terminal Log Output Window */}
      <div
        ref={logContainerRef}
        tabIndex={0}
        role="log"
        aria-label="Execution terminal output"
        className="flex-1 p-4 overflow-y-auto space-y-1.5 min-h-[220px] max-h-[380px] select-text focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic py-8 text-center">Waiting for execution telemetry stream...</div>
        ) : (
          logs.map((log) => {
            const prefixColors = {
              start: 'text-cyan-400 font-bold',
              info: 'text-sky-400 font-bold',
              success: 'text-emerald-400 font-bold',
              warn: 'text-amber-400 font-bold',
              error: 'text-rose-400 font-bold',
            };

            const prefixLabels = {
              start: '[START]  ',
              info: '[INFO]   ',
              success: '[SUCCESS]',
              warn: '[WARN]   ',
              error: '[ERROR]  ',
            };

            return (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed break-all">
                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                <span className={`shrink-0 ${prefixColors[log.level] || 'text-slate-400 font-bold'}`}>
                  {prefixLabels[log.level] || '[LOG]    '}
                </span>
                <span className="text-slate-200">{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Action Footer with Review PR Focus Target */}
      {prUrl && (
        <footer className="flex items-center justify-between px-4 py-3 bg-emerald-950/30 border-t border-emerald-900/50">
          <div className="flex items-center gap-2 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Remediation pull request generated successfully!</span>
          </div>

          <a
            ref={prLinkRef}
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-emerald-400 focus:outline-none"
          >
            <span>Review Pull Request</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </footer>
      )}
    </section>
  );
}

export default AgentActivityStream;
