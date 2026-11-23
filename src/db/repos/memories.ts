import type { Client } from '@libsql/client';

export type MemoryKind = 'fact' | 'event' | 'inside_joke' | 'preference' | 'summary';
export const MEMORY_KINDS: MemoryKind[] = [
  'fact',
  'event',
  'inside_joke',
  'preference',
  'summary',
];

export type Memory = {
  id: number;
  chatJid: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  createdAt: number;
  lastUsedAt?: number;
};

function isMemoryKind(v: unknown): v is MemoryKind {
  return typeof v === 'string' && (MEMORY_KINDS as string[]).includes(v);
}

export async function addMemory(
  db: Client,
  m: { chatJid: string; kind: MemoryKind; content: string; importance?: number; sourceMsgId?: string },
): Promise<number> {
  const res = await db.execute({
    sql: `INSERT INTO memories (chat_jid, kind, content, source_msg_id, importance, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [m.chatJid, m.kind, m.content, m.sourceMsgId ?? null, m.importance ?? 1, Date.now()],
  });
  return Number(res.lastInsertRowid);
}

/** Quote terms for FTS5 MATCH and join them with OR so any term hits. */
function ftsQuery(terms: string[]): string {
  return terms
    .map((t) => t.replace(/["']/g, '').trim())
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"`)
    .join(' OR ');
}

/** Lexical (FTS5) retrieval of chat memories, best-match first. */
export async function searchMemories(
  db: Client,
  chatJid: string,
  terms: string[],
  limit = 5,
): Promise<Memory[]> {
  const query = ftsQuery(terms);
  if (!query) return [];
  const res = await db.execute({
    sql: `SELECT m.id, m.chat_jid, m.kind, m.content, m.importance, m.created_at, m.last_used_at
          FROM memories m
          JOIN memories_fts ON memories_fts.rowid = m.id
          WHERE memories_fts MATCH ? AND m.chat_jid = ?
          ORDER BY m.importance DESC, m.created_at DESC
          LIMIT ?`,
    args: [query, chatJid, limit],
  });
  return res.rows.map(rowToMemory);
}

export async function listTopMemories(db: Client, chatJid: string, limit = 3): Promise<Memory[]> {
  const res = await db.execute({
    sql: `SELECT id, chat_jid, kind, content, importance, created_at, last_used_at
          FROM memories WHERE chat_jid = ?
          ORDER BY importance DESC, created_at DESC LIMIT ?`,
    args: [chatJid, limit],
  });
  return res.rows.map(rowToMemory);
}

export async function touchMemory(db: Client, id: number): Promise<void> {
  await db.execute({
    sql: 'UPDATE memories SET last_used_at = ? WHERE id = ?',
    args: [Date.now(), id],
  });
}

export async function deleteMemory(db: Client, id: number): Promise<boolean> {
  const res = await db.execute({ sql: 'DELETE FROM memories WHERE id = ?', args: [id] });
  return res.rowsAffected > 0;
}

export async function listMemories(db: Client, chatJid: string, limit = 50): Promise<Memory[]> {
  const res = await db.execute({
    sql: `SELECT id, chat_jid, kind, content, importance, created_at, last_used_at
          FROM memories WHERE chat_jid = ? ORDER BY created_at DESC LIMIT ?`,
    args: [chatJid, limit],
  });
  return res.rows.map(rowToMemory);
}

/** Retention: drop low-importance memories older than the cutoff. */
export async function pruneMemories(
  db: Client,
  opts: { olderThanMs: number; keepImportanceFrom: number },
): Promise<number> {
  const cutoff = Date.now() - opts.olderThanMs;
  const res = await db.execute({
    sql: 'DELETE FROM memories WHERE created_at < ? AND importance < ?',
    args: [cutoff, opts.keepImportanceFrom],
  });
  return res.rowsAffected;
}

function rowToMemory(row: Record<string, unknown>): Memory {
  const kind: MemoryKind = isMemoryKind(row.kind) ? row.kind : 'fact';
  return {
    id: Number(row.id),
    chatJid: String(row.chat_jid),
    kind,
    content: String(row.content),
    importance: Number(row.importance),
    createdAt: Number(row.created_at),
    lastUsedAt: row.last_used_at == null ? undefined : Number(row.last_used_at),
  };
}
