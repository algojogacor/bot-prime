import { pruneMessagesBefore } from '../db/repos/messages.js';
import { pruneMemories } from '../db/repos/memories.js';
import type { Client } from '@libsql/client';

export const MESSAGE_RETENTION_DAYS = 60;
export const LOW_MEMORY_RETENTION_DAYS = 30;
export const KEEP_IMPORTANCE_FROM = 3;

/**
 * Retention pass, run daily by the scheduler. Turso bills row scans and
 * storage, and unbounded chat history is both — so old low-value rows go.
 * High-importance memories (>= 3) survive regardless of age.
 */
export async function runRetention(db: Client): Promise<{
  messagesDeleted: number;
  memoriesDeleted: number;
}> {
  const now = Date.now();
  const messagesDeleted = await pruneMessagesBefore(
    db,
    now - MESSAGE_RETENTION_DAYS * 86_400_000,
  );
  const memoriesDeleted = await pruneMemories(db, {
    olderThanMs: LOW_MEMORY_RETENTION_DAYS * 86_400_000,
    keepImportanceFrom: KEEP_IMPORTANCE_FROM,
  });
  return { messagesDeleted, memoriesDeleted };
}
