/**
 * Agent State Rehydration API Route.
 *
 * Next.js App Router GET /api/agent/state?repo={repo}&threadId={threadId}
 * Connects read-only to the LangGraph SQLite checkpointer (.checkpoints.db),
 * retrieves the latest state for threadId, and returns structured past events.
 */

import fs from 'node:fs';
import path from 'node:path';

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
  const repo = searchParams.get('repo') || '';
  const threadId = searchParams.get('threadId');

  if (!threadId) {
    return Response.json(
      { error: 'Missing required query parameter "threadId"' },
      { status: 400 }
    );
  }

  const dbPath = findCheckpointsDatabase();

  // If database has not been initialized yet, return empty idle rehydration state
  if (!dbPath) {
    return Response.json({
      threadId,
      repo,
      found: false,
      status: 'idle',
      phase: 'idle',
      appliedPatches: [],
      quarantinedIssues: [],
      verificationPassed: false,
      prUrl: null,
      events: [],
    });
  }

  try {
    let row = null;
    let allRows = [];

    // Query checkpoint database using native Node.js SQLite
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });

      const stmt = db.prepare(
        'SELECT checkpoint, metadata, created_at FROM checkpoints WHERE thread_id = ? ORDER BY checkpoint_id DESC LIMIT 1'
      );
      row = stmt.get(threadId);

      const allStmt = db.prepare(
        'SELECT checkpoint_id, checkpoint, metadata, created_at FROM checkpoints WHERE thread_id = ? ORDER BY created_at ASC'
      );
      allRows = allStmt.all(threadId);

      db.close();
    } catch {
      // Fallback via dynamic require if node:sqlite is unavailable
      try {
        const { createRequire } = await import('node:module');
        const req = createRequire(import.meta.url);
        const Database = req('better-sqlite3');
        const db = new Database(dbPath, { readonly: true, fileMustExist: false });

        row = db
          .prepare(
            'SELECT checkpoint, metadata, created_at FROM checkpoints WHERE thread_id = ? ORDER BY checkpoint_id DESC LIMIT 1'
          )
          .get(threadId);

        allRows = db
          .prepare(
            'SELECT checkpoint_id, checkpoint, metadata, created_at FROM checkpoints WHERE thread_id = ? ORDER BY created_at ASC'
          )
          .all(threadId);

        db.close();
      } catch {
        // Both drivers unavailable or failed
      }
    }

    if (!row) {
      return Response.json({
        threadId,
        repo,
        found: false,
        status: 'idle',
        phase: 'idle',
        appliedPatches: [],
        quarantinedIssues: [],
        verificationPassed: false,
        prUrl: null,
        events: [],
      });
    }

    const checkpoint = JSON.parse(row.checkpoint);
    const channelValues = checkpoint.channel_values || {};

    const phase = channelValues.phase || 'unknown';
    const status =
      phase === 'complete'
        ? 'completed'
        : phase === 'failed'
        ? 'failed'
        : 'in_progress';

    // Reconstruct sequential event stream from historical checkpoints
    const events = [];

    for (const r of allRows) {
      try {
        const cp = JSON.parse(r.checkpoint);
        const cv = cp.channel_values || {};
        const meta = JSON.parse(r.metadata || '{}');

        if (cv.phase) {
          events.push({
            id: `evt-phase-${r.checkpoint_id}`,
            type: 'phase_change',
            timestamp: r.created_at,
            message: `Transitioned to state: [${cv.phase.toUpperCase()}]`,
            details: { phase: cv.phase, step: meta.step },
          });
        }
      } catch {
        // Skip malformed rows
      }
    }

    // Append individual patch applied events
    if (Array.isArray(channelValues.appliedPatches)) {
      channelValues.appliedPatches.forEach((patch, idx) => {
        events.push({
          id: `evt-patch-${idx}`,
          type: 'patch_applied',
          timestamp: patch.timestamp || row.created_at,
          message: `Surgically patched: ${patch.filePath}`,
          details: {
            filePath: patch.filePath,
            diff: patch.diff,
            rationale: patch.rationale,
          },
        });
      });
    }

    // Append quarantined events
    if (Array.isArray(channelValues.quarantinedIssues)) {
      channelValues.quarantinedIssues.forEach((q, idx) => {
        events.push({
          id: `evt-quarantine-${idx}`,
          type: 'issue_quarantined',
          timestamp: row.created_at,
          message: `Quarantined issue in ${q.filePath}: ${q.reason}`,
          details: q,
        });
      });
    }

    // Append verification event
    if (channelValues.verificationPassed !== undefined) {
      events.push({
        id: 'evt-verification',
        type: 'verification',
        timestamp: row.created_at,
        message: channelValues.verificationPassed
          ? 'Sandbox verification build and tests passed cleanly'
          : `Sandbox verification failed: ${channelValues.buildErrors || 'Unknown build error'}`,
        details: {
          passed: channelValues.verificationPassed,
          errors: channelValues.buildErrors,
        },
      });
    }

    // Append final completion event
    if (channelValues.prUrl) {
      events.push({
        id: 'evt-pr-opened',
        type: 'complete',
        timestamp: row.created_at,
        message: `Autonomous PR opened: ${channelValues.prUrl}`,
        details: { prUrl: channelValues.prUrl },
      });
    }

    return Response.json({
      threadId,
      repo: channelValues.repoUrl || repo,
      found: true,
      status,
      phase,
      targetDirectory: channelValues.targetDirectory || '.',
      appliedPatches: channelValues.appliedPatches || [],
      quarantinedIssues: channelValues.quarantinedIssues || [],
      llmCallCount: channelValues.llmCallCount || 0,
      budgetCapReached: Boolean(channelValues.budgetCapReached),
      verificationPassed: Boolean(channelValues.verificationPassed),
      buildErrors: channelValues.buildErrors || null,
      prUrl: channelValues.prUrl || null,
      events,
    });
  } catch (err) {
    return Response.json(
      {
        error: 'Failed to rehydrate state from checkpointer database',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
