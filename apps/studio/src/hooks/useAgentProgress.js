'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Stage-adaptive liveness thresholds with 25–33% headroom below actual job timeouts.
 * - atomic_file_fix: 10m warning vs 15m patch job ceiling
 * - verify_build: 7m warning vs 10m verify job ceiling
 * - resolve / open_pr: 3m warning vs 5m resolve job ceiling
 * - cold start: 2m warning vs 30-75s normal cold start
 */
export const STAGE_LIVENESS_THRESHOLDS_MS = {
  provisioning_runner: 120_000, // 2 minutes
  init_sandbox: 120_000,        // 2 minutes
  initial_audit: 120_000,       // 2 minutes
  atomic_file_fix: 600_000,     // 10 minutes (5m headroom below 15m timeout)
  verify_build: 420_000,        // 7 minutes (3m headroom below 10m timeout)
  resolve: 180_000,             // 3 minutes (2m headroom below 5m timeout)
  open_pr: 180_000,             // 3 minutes
  default: 300_000,             // 5 minutes
};

/**
 * Custom React hook for polling /api/agent/status with Page Visibility API support
 * and stage-adaptive liveness guardrails.
 */
export function useAgentProgress({ runId, pollInterval = 2500 } = {}) {
  const [status, setStatus] = useState('idle');
  const [step, setStep] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(runId));
  const [error, setError] = useState(null);
  const [isStalled, setIsStalled] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);

  const stageStartTimeRef = useRef(Date.now());
  const currentStepRef = useRef(null);
  const pollTimerRef = useRef(null);

  const dismissWarning = useCallback(() => {
    setWarningDismissed(true);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!runId) return;

    try {
      const res = await fetch(`/api/agent/status?runId=${encodeURIComponent(runId)}`);
      if (!res.ok) {
        if (res.status === 400 || res.status === 404) {
          setError('Run not found or invalid run ID.');
          setLoading(false);
          return;
        }
        if (res.status === 429) {
          // Rate limited — back off quietly
          return;
        }
        throw new Error(`Failed to fetch status (${res.status})`);
      }

      const payload = await res.json();
      setData(payload);
      setStatus(payload.status || 'idle');

      const nextStep = payload.step || null;
      // Reset stage timer if the step has progressed
      if (nextStep !== currentStepRef.current) {
        currentStepRef.current = nextStep;
        stageStartTimeRef.current = Date.now();
        setStep(nextStep);
        setIsStalled(false);
        setWarningDismissed(false);
      }

      // Check stage-adaptive liveness threshold
      const threshold = STAGE_LIVENESS_THRESHOLDS_MS[nextStep] || STAGE_LIVENESS_THRESHOLDS_MS.default;
      const elapsed = Date.now() - stageStartTimeRef.current;
      if (payload.status === 'running' && elapsed > threshold) {
        setIsStalled(true);
      } else {
        setIsStalled(false);
      }

      setLoading(false);
      setError(null);
    } catch (err) {
      console.warn('[WARNING] Failed polling agent status:', err.message);
      setError(err.message);
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) {
      setStatus('idle');
      setStep(null);
      setData(null);
      setLoading(false);
      setIsStalled(false);
      return;
    }

    setLoading(true);
    fetchStatus();

    // Setup polling interval
    const startPolling = () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        // Only poll when terminal state has not been reached
        if (status !== 'success' && status !== 'failed' && status !== 'failure') {
          fetchStatus();
        }
      }, pollInterval);
    };

    startPolling();

    // Page Visibility API: pause polling when tab is hidden, resume on active
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      } else {
        fetchStatus();
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runId, fetchStatus, pollInterval, status]);

  // Terminal state reached: stop polling
  useEffect(() => {
    if (status === 'success' || status === 'failed' || status === 'failure') {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
  }, [status]);

  return {
    status,
    step,
    data,
    loading,
    error,
    isStalled,
    warningDismissed,
    dismissWarning,
    refetch: fetchStatus,
  };
}
