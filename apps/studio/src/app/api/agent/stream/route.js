/**
 * Server-Sent Events (SSE) Telemetry Stream API Route.
 *
 * Next.js App Router GET /api/agent/stream?repo={repo}&targetDir={targetDir}&threadId={threadId}
 * Establishes a persistent SSE connection, streaming live LangGraph state transitions,
 * patch applications, and build verification milestones directly to the browser.
 */

import path from 'node:path';
import fs from 'node:fs';

export const dynamic = 'force-dynamic';

function findCheckpointsDatabase() {
  const candidatePaths = [
    path.resolve(process.cwd(), 'apps/agent/.checkpoints.db'),
    path.resolve(process.cwd(), '../agent/.checkpoints.db'),
    path.resolve(process.cwd(), '.checkpoints.db'),
    path.resolve(process.cwd(), '../../apps/agent/.checkpoints.db'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo') || 'unknown-repository';
  const targetDir = searchParams.get('targetDir') || '.';
  const threadId = searchParams.get('threadId') || `session-${Date.now()}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Initial connection milestone
      const initialPayload = {
        type: 'connected',
        threadId,
        repo,
        targetDir,
        timestamp: Date.now(),
        message: `Connected to autonomous remediation stream for ${repo}`,
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialPayload)}\n\n`));

      let lastSeenCheckpointId = null;
      let isStreamClosed = false;

      // Handle client abort / disconnect
      request.signal.addEventListener('abort', () => {
        isStreamClosed = true;
        try {
          controller.close();
        } catch {
          // Ignore if already closed
        }
      });

      const pollInterval = setInterval(async () => {
        if (isStreamClosed || request.signal.aborted) {
          clearInterval(pollInterval);
          return;
        }

        const dbPath = findCheckpointsDatabase();
        if (!dbPath) {
          // Send keep-alive comment
          try {
            controller.enqueue(encoder.encode(`: keep-alive (${Date.now()})\n\n`));
          } catch {
            clearInterval(pollInterval);
          }
          return;
        }

        try {
          let row = null;

          try {
            const { DatabaseSync } = await import('node:sqlite');
            const db = new DatabaseSync(dbPath, { readOnly: true });
            const stmt = db.prepare(
              'SELECT checkpoint_id, checkpoint, metadata, created_at FROM checkpoints WHERE thread_id = ? ORDER BY checkpoint_id DESC LIMIT 1'
            );
            row = stmt.get(threadId);
            db.close();
          } catch {
            try {
              const { createRequire } = await import('node:module');
              const req = createRequire(import.meta.url);
              const Database = req('better-sqlite3');
              const db = new Database(dbPath, { readonly: true, fileMustExist: false });
              row = db
                .prepare(
                  'SELECT checkpoint_id, checkpoint, metadata, created_at FROM checkpoints WHERE thread_id = ? ORDER BY checkpoint_id DESC LIMIT 1'
                )
                .get(threadId);
              db.close();
            } catch {
              // Ignore if neither driver is available
            }
          }

          if (row && row.checkpoint_id !== lastSeenCheckpointId) {
            lastSeenCheckpointId = row.checkpoint_id;
            const checkpoint = JSON.parse(row.checkpoint);
            const cv = checkpoint.channel_values || {};
            const meta = JSON.parse(row.metadata || '{}');

            const eventPayload = {
              type: 'transition',
              threadId,
              checkpointId: row.checkpoint_id,
              phase: cv.phase || 'in_progress',
              step: meta.step,
              timestamp: row.created_at,
              appliedPatchesCount: cv.appliedPatches?.length || 0,
              latestPatch:
                cv.appliedPatches && cv.appliedPatches.length > 0
                  ? cv.appliedPatches[cv.appliedPatches.length - 1]
                  : null,
              quarantinedCount: cv.quarantinedIssues?.length || 0,
              llmCallCount: cv.llmCallCount || 0,
              budgetCapReached: Boolean(cv.budgetCapReached),
              verificationPassed: cv.verificationPassed,
              prUrl: cv.prUrl,
            };

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventPayload)}\n\n`));

            // If workflow has reached terminal state, send completed event and close
            if (cv.phase === 'complete' || cv.phase === 'failed') {
              const completePayload = {
                type: 'completed',
                status: cv.phase,
                prUrl: cv.prUrl,
                appliedPatchesCount: cv.appliedPatches?.length || 0,
                verificationPassed: cv.verificationPassed,
                timestamp: Date.now(),
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(completePayload)}\n\n`));
              clearInterval(pollInterval);
              isStreamClosed = true;
              controller.close();
            }
          } else {
            // Heartbeat comment to prevent client socket timeout
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          }
        } catch {
          // Graceful handling of transient SQLite read locks
        }
      }, 1000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
