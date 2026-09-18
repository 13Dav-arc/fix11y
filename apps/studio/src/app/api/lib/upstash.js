/**
 * Zero-dependency Upstash Redis REST Client & Sliding-Window Rate Limiter.
 * Compatible with Vercel Serverless and Edge runtimes.
 */

export class UpstashClient {
  constructor({ url, token, fetchFn = globalThis.fetch } = {}) {
    const rawUrl = url !== undefined ? url : (process.env.UPSTASH_REDIS_REST_URL || '');
    this.url = rawUrl.replace(/\/$/, '');
    this.token = token !== undefined ? token : (process.env.UPSTASH_REDIS_REST_TOKEN || '');
    this.fetch = fetchFn;
  }

  get isConfigured() {
    return Boolean(this.url && this.token);
  }

  /**
   * Executes a command against Upstash Redis REST endpoint.
   */
  async command(args = []) {
    if (!this.isConfigured) {
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
        return null;
      }

      const data = await res.json();
      return data?.result ?? null;
    } catch (err) {
      console.warn(`[WARNING] Upstash command failed: ${err?.message || err}`);
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
   */
  async checkRateLimit({ key, limit = 60, windowSec = 60 }) {
    if (!this.isConfigured) {
      return { allowed: true, remaining: limit, resetInSec: 0 };
    }

    try {
      const rateKey = `fix11y:rate:${key}`;
      const count = await this.command(['INCR', rateKey]);

      if (typeof count !== 'number') {
        return { allowed: true, remaining: limit, resetInSec: 0 };
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
      };
    } catch {
      return { allowed: true, remaining: limit, resetInSec: 0 };
    }
  }
}
