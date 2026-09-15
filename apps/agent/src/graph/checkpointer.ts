/**
 * SQLite Checkpointer for LangGraph Orchestration.
 *
 * Persists graph state transitions to a durable SQLite database (.checkpoints.db)
 * using better-sqlite3 with WAL journal mode.
 */

import Database from 'better-sqlite3';
import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  SerializerProtocol,
} from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';

function cleanCircular(obj: any, seen = new WeakSet()): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return undefined;
  seen.add(obj);

  // Omit non-serializable instances
  if (obj.constructor && obj.constructor.name === 'SandboxManager') {
    return undefined;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => cleanCircular(item, seen)).filter((x) => x !== undefined);
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Strip parent pointer in AST/CST nodes
    if (key === 'parent' && typeof value === 'object' && value !== null) {
      continue;
    }
    const cleaned = cleanCircular(value, seen);
    if (cleaned !== undefined) {
      result[key] = cleaned;
    }
  }
  return result;
}

export class SqliteSaver extends BaseCheckpointSaver {
  public readonly db: Database.Database;

  constructor(dbPath: string = '.checkpoints.db', serde?: SerializerProtocol<any>) {
    super(serde);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.setupSchema();
  }

  private setupSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        checkpoint TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_id)
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_created
      ON checkpoints (thread_id, created_at DESC);
    `);
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_id = config.configurable?.checkpoint_id;
    if (!thread_id) return undefined;

    let row: any;
    if (checkpoint_id) {
      const stmt = this.db.prepare(
        'SELECT checkpoint, metadata, checkpoint_id FROM checkpoints WHERE thread_id = ? AND checkpoint_id = ?'
      );
      row = stmt.get(thread_id, checkpoint_id);
    } else {
      const stmt = this.db.prepare(
        'SELECT checkpoint, metadata, checkpoint_id FROM checkpoints WHERE thread_id = ? ORDER BY checkpoint_id DESC LIMIT 1'
      );
      row = stmt.get(thread_id);
    }

    if (!row) return undefined;

    const parsedCheckpoint = (await this.serde.parse(row.checkpoint)) as Checkpoint;
    const parsedMetadata = (await this.serde.parse(row.metadata)) as CheckpointMetadata;

    return {
      config: {
        configurable: {
          thread_id,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint: parsedCheckpoint,
      metadata: parsedMetadata,
    };
  }

  async *list(
    config: RunnableConfig,
    limit?: number,
    before?: RunnableConfig
  ): AsyncGenerator<CheckpointTuple> {
    const thread_id = config.configurable?.thread_id;
    if (!thread_id) return;

    let query = 'SELECT checkpoint_id, checkpoint, metadata FROM checkpoints WHERE thread_id = ?';
    const params: any[] = [thread_id];

    if (before?.configurable?.checkpoint_id) {
      query += ' AND checkpoint_id < ?';
      params.push(before.configurable.checkpoint_id);
    }

    query += ' ORDER BY checkpoint_id DESC';
    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    for (const row of rows) {
      yield {
        config: { configurable: { thread_id, checkpoint_id: row.checkpoint_id } },
        checkpoint: (await this.serde.parse(row.checkpoint)) as Checkpoint,
        metadata: (await this.serde.parse(row.metadata)) as CheckpointMetadata,
      };
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const thread_id = config.configurable?.thread_id;
    if (!thread_id) {
      throw new Error('Missing thread_id in RunnableConfig configurable');
    }

    const cleanedCheckpoint = cleanCircular(checkpoint);
    const cleanedMetadata = cleanCircular(metadata);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints (thread_id, checkpoint_id, checkpoint, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      thread_id,
      checkpoint.id,
      await this.serde.stringify(cleanedCheckpoint),
      await this.serde.stringify(cleanedMetadata),
      Date.now()
    );

    return {
      configurable: {
        thread_id,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  close(): void {
    if (this.db && this.db.open) {
      this.db.close();
    }
  }
}
