import { NextResponse } from 'next/server.js';
import { handleGitHubWebhook } from '@fix11y/agent';

export const dynamic = 'force-dynamic';

/**
 * GitHub Webhook Ingestion API Route Handler.
 *
 * Receives GitHub App / repository webhook events at POST /api/webhooks/github.
 * Extracts the raw unparsed payload to preserve HMAC-SHA256 signature integrity,
 * verifies the signature, and delegates to the BullMQ job queue.
 *
 * @param {import('next/server').NextRequest} req
 */
export async function POST(req) {
  try {
    // Critical: Read raw text first to preserve exact HMAC-SHA256 payload bytes
    const rawPayload = await req.text();

    const signature = req.headers.get('x-hub-signature-256');
    const event = req.headers.get('x-github-event');
    const delivery = req.headers.get('x-github-delivery');

    const result = await handleGitHubWebhook(rawPayload, {
      signature,
      event,
      delivery,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Error processing GitHub webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error while processing webhook' },
      { status: 500 }
    );
  }
}
