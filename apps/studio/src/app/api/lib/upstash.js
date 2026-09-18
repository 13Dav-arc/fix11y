/**
 * Zero-dependency Upstash Redis REST Client & Sliding-Window Rate Limiter.
 * Compatible with Vercel Serverless and Edge runtimes.
 */

export class UpstashClient {
  constructor({ url, token, alertWebhookUrl, fetchFn = globalThis.fetch } = {}) {
    const rawUrl = url !== undefined ? url : (process.env.UPSTASH_REDIS_REST_URL || '');
    this.url = rawUrl.replace(/\/$/, '');
    this.token = token !== undefined ? token : (process.env.UPSTASH_REDIS_REST_TOKEN || '');
    this.alertWebhookUrl = alertWebhookUrl !== undefined ? alertWebhookUrl : (process.env.ALERT_WEBHOOK_URL || '');
    this.fetch = fetchFn;
    this.lastAlertTime = 0;
    this.isDegraded = false;
  }

  get isConfigured() {
    return Boolean(this.url && this.token);
  }

  /**
   * Throttled alarm dispatcher.
   * If alertWebhookUrl is unset or empty, safely and silently no-ops
   * without attempting fetch or throwing an error.
   */
  async notifyDegraded({ status, message, error } = {}) {
    this.isDegraded = true;

    if (!this.alertWebhookUrl || typeof this.alertWebhookUrl !== 'string' || !this.alertWebhookUrl.trim()) {
      return;
    }

    const now = Date.now();
    const THROTTLE_MS = 15 * 60 * 1000; // 15-minute alert throttle
    if (now - this.lastAlertTime < THROTTLE_MS) {
      return;
    }

    this.lastAlertTime = now;

    try {
      await this.fetch(this.alertWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'fix11y-alert-monitor/1.0',
        },
        body: JSON.stringify({
          event: 'UPSTASH_RATE_LIMIT_DEGRADED',
          severity: 'high',
          status: status || 500,
          message: message || 'Upstash Redis command failed. Rate limiting has failed open.',
          error: error || null,
          timestamp: new Date().toISOString(),
          impact: 'Rate limiting failed open; requests are unthrottled.',
        }),
      });
    } catch (err) {
      // Swallowed: alerting must never crash request handling
      console.warn(`[WARNING] Failed dispatching alert webhook: ${err?.message || err}`);
    }
  }

  /**
   * Executes a command against Upstash Redis REST endpoint.
   */
  async command(args = []) {
    if (!this.isConfigured) {
      this.isDegraded = true;
      return null;
    }

    try {
      const res = await this.fetch(`${this.url}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[WARNING] Upstash command returned ${res.status}: ${errText}`);
        await this.notifyDegraded({
          status: res.status,
          message: `Upstash command returned ${res.status}`,
          error: errText,
        });
        return null;
      }

      const data = await res.json();
      return data?.result ?? null;
    } catch (err) {
      console.warn(`[WARNING] Upstash command failed: ${err?.message || err}`);
      await this.notifyDegraded({
        status: 500,
        message: 'Upstash command failed with network or parsing error',
        error: err?.message || String(err),
      });
      return null;
    }
  }

  /**
   * Seeds initial run progress with 1-hour TTL.
   */
  async seedRunProgress({ runId, repo, sha, targetVisibility, step = 'provisioning_runner' }) {
    if (!this.isConfigured) {
      console.log(`[INFO] Upstash unconfigured — skipping progress seed for ${runId}.`);
      return;
    }

    const payload = {
      status: 'running',
      repo,
      sha,
      targetVisibility,
      step,
      file: null,
      filesDone: 0,
      filesTotal: 0,
      prUrl: null,
      actionsLogUrl: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // SETEX key seconds value
    await this.command(['SETEX', `fix11y:run:${runId}`, '3600', JSON.stringify(payload)]);
    console.log(`[SUCCESS] Seeded Upstash progress record: fix11y:run:${runId} (step: ${step})`);
  }

  /**
   * Gets run progress record by runId.
   */
  async getRunProgress(runId) {
    if (!this.isConfigured) {
      return null;
    }

    const res = await this.command(['GET', `fix11y:run:${runId}`]);
    if (!res) return null;

    try {
      return typeof res === 'string' ? JSON.parse(res) : res;
    } catch {
      return null;
    }
  }

  /**
   * Sliding-window rate limiter using Redis INCR and EXPIRE.
   * Fails open gracefully if Upstash is unavailable or quota is exhausted.
   */
  async checkRateLimit({ key, limit = 60, windowSec = 60 }) {
    if (!this.isConfigured) {
      return { allowed: true, remaining: limit, resetInSec: 0, degraded: true };
    }

    try {
      const rateKey = `fix11y:rate:${key}`;
      const count = await this.command(['INCR', rateKey]);

      if (typeof count !== 'number') {
        return { allowed: true, remaining: limit, resetInSec: 0, degraded: true };
      }

      if (count === 1) {
        await this.command(['EXPIRE', rateKey, String(windowSec)]);
      }

      const remaining = Math.max(0, limit - count);
      const allowed = count <= limit;

      return {
        allowed,
        remaining,
        resetInSec: windowSec,
        count,
        degraded: this.isDegraded,
      };
    } catch {
      return { allowed: true, remaining: limit, resetInSec: 0, degraded: true };
    }
  }
}
