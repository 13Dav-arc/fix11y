/**
 * Pre-flight environment variable & alias validator for Vercel serverless routes.
 */

export function getVercelConfig() {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const appId = process.env.FIX11Y_APP_ID || process.env.GITHUB_APP_ID;
  const privateKey = process.env.FIX11Y_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY;
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const runnerRepo = process.env.FIX11Y_RUNNER_REPO || '13Dav-arc/fix11y-runner';
  const runnerToken = process.env.FIX11Y_RUNNER_TOKEN || null;
  const actionRef = process.env.FIX11Y_ACTION_REF || '5144ef5';

  const missing = [];
  if (!webhookSecret) missing.push('GITHUB_WEBHOOK_SECRET');
  if (!appId) missing.push('FIX11Y_APP_ID (or GITHUB_APP_ID)');
  if (!privateKey) missing.push('FIX11Y_APP_PRIVATE_KEY (or GITHUB_APP_PRIVATE_KEY)');
  if (!upstashUrl) missing.push('UPSTASH_REDIS_REST_URL');
  if (!upstashToken) missing.push('UPSTASH_REDIS_REST_TOKEN');

  return {
    ok: missing.length === 0,
    missing,
    config: {
      webhookSecret,
      appId,
      privateKey,
      upstashUrl,
      upstashToken,
      runnerRepo,
      runnerToken,
      actionRef,
    },
  };
}

export function validateVercelEnv() {
  const { ok, missing, config } = getVercelConfig();
  if (!ok) {
    const errorMsg = `[Configuration Error] Missing required Vercel environment variables: ${missing.join(', ')}`;
    console.error(errorMsg);
    const error = new Error(errorMsg);
    error.status = 500;
    error.missing = missing;
    throw error;
  }
  return config;
}
