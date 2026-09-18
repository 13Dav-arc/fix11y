import { NextResponse } from 'next/server.js';
import { UpstashClient } from '../../lib/upstash.js';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Agent Run Status Polling API Route (Architecture v2.2).
 *
 * GET /api/agent/status?runId=<uuid>
 * Queries Upstash Redis REST progress record for live runner state.
 * Rate limited to 60 req/min per IP.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');

    // 1. Validate required parameter
    if (!runId) {
      return NextResponse.json(
        { error: 'Missing required query parameter "runId"' },
        { status: 400 }
      );
    }

    // 2. Validate UUID format
    if (!UUID_REGEX.test(runId)) {
      return NextResponse.json(
        { error: 'Invalid runId format: must be a valid UUID' },
        { status: 400 }
      );
    }

    // 3. Rate limiting check (60 req/min per IP)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               req.headers.get('x-real-ip') ||
               '127.0.0.1';

    const upstash = new UpstashClient();
    const rateLimit = await upstash.checkRateLimit({
      key: `status:${ip}`,
      limit: 60,
      windowSec: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before polling again.' },
        { status: 429 }
      );
    }

    // 4. Retrieve run progress from Upstash
    const progress = await upstash.getRunProgress(runId);

    if (!progress) {
      const res = NextResponse.json(
        {
          found: false,
          runId,
          status: 'idle',
          step: null,
          message: 'No active or recent run found for this ID',
        },
        { status: 200 }
      );
      if (rateLimit?.degraded) {
        res.headers.set('X-RateLimit-Degraded', 'true');
      }
      return res;
    }

    const res = NextResponse.json(
      {
        found: true,
        runId,
        ...progress,
      },
      { status: 200 }
    );
    if (rateLimit?.degraded) {
      res.headers.set('X-RateLimit-Degraded', 'true');
    }
    return res;
  } catch (error) {
    console.error('[ERROR] Agent status endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error while fetching run status',
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
