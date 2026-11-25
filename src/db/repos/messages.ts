import type { Client, InStatement } from '@libsql/client';

export type StoredMessage = {
  id: string;
  chatJid: string;
  senderJid: string;
  senderPn?: string;
  /** WhatsApp display name (pushName) — kept so history context stays readable. */
  pushName?: string;
  text?: string;
  msgType: string;
  isFromMe: boolean;
  /** ms epoch */
  timestamp: number;
};

export type StoredMessageRow = StoredMessage & { createdAt: number };

/**
 * Insert messages in one write transaction; duplicate ids are ignored.
 * Throws DuplicateMessageError when some ids were already stored, so callers
 * can suppress duplicate processing (durable idempotency beyond the in-memory
 * LRU dedupe, which evicts after 4_096 ids).
 */
export async function insertMessages(db: Client, msgs: StoredMessage[]): Promise<void> {
  const inserted = await insertMessagesCounting(db, msgs);
  if (inserted !== msgs.length) {
    throw new DuplicateMessageError(inserted, msgs.length);
  }
}

/** Thrown when some messages in a batch were already stored (duplicate ids). */
export class DuplicateMessageError extends Error {
  constructor(readonly inserted: number, readonly attempted: number) {
    super(`${inserted}/${attempted} messages were duplicates`);
    this.name = 'DuplicateMessageError';
  }
}

/**
 * Insert and report how many rows were actually written. Rows whose id is
 * already present are skipped by `ON CONFLICT DO NOTHING`; `rowsAffected`
 * from libsql's per-statement batch results distinguishes inserted from
 * skipped, giving an idempotency check that survives LRU eviction and
 * process restarts.
 */
export async function insertMessagesCounting(
  db: Client,
  msgs: StoredMessage[],
): Promise<number> {
  if (msgs.length === 0) return 0;
  const stmts: InStatement[] = msgs.map((m) => ({
    sql: `INSERT INTO messages (id, chat_jid, sender_jid, sender_pn, text, msg_type, is_from_me, timestamp, created_at, push_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO NOTHING`,
    args: [
      m.id,
      m.chatJid,
      m.senderJid,
      m.senderPn ?? null,
      m.text ?? null,
      m.msgType,
      m.isFromMe ? 1 : 0,
      m.timestamp,
      Date.now(),
      m.pushName ?? null,
    ],
  }));
  const results = await db.batch(stmts, 'write');
  let inserted = 0;
  for (const r of results) inserted += r?.rowsAffected ?? 0;
  return inserted;
}

/** Newest-first page of a chat's messages (indexed by (chat_jid, timestamp)). */
export async function listRecentMessages(
  db: Client,
  chatJid: string,
  limit: number,
): Promise<StoredMessageRow[]> {
  const res = await db.execute({
    sql: `SELECT id, chat_jid, sender_jid, sender_pn, text, msg_type, is_from_me, timestamp, created_at, push_name
          FROM messages WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT ?`,
    args: [chatJid, limit],
  });
  return res.rows.map((row) => ({
    id: String(row.id),
    chatJid: String(row.chat_jid),
    senderJid: String(row.sender_jid),
    senderPn: row.sender_pn == null ? undefined : String(row.sender_pn),
    text: row.text == null ? undefined : String(row.text),
    msgType: String(row.msg_type),
    isFromMe: Number(row.is_from_me) === 1,
    timestamp: Number(row.timestamp),
    createdAt: Number(row.created_at),
    pushName: row.push_name == null ? undefined : String(row.push_name),
  }));
}

/** One message by (chat, id) — used for quoted-reply resolution. */
export async function getMessageById(
  db: Client,
  chatJid: string,
  id: string,
): Promise<StoredMessage | null> {
  const res = await db.execute({
    sql: `SELECT id, chat_jid, sender_jid, sender_pn, text, msg_type, is_from_me, timestamp
          FROM messages WHERE id = ? AND chat_jid = ? LIMIT 1`,
    args: [id, chatJid],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    chatJid: String(row.chat_jid),
    senderJid: String(row.sender_jid),
    senderPn: row.sender_pn == null ? undefined : String(row.sender_pn),
    text: row.text == null ? undefined : String(row.text),
    msgType: String(row.msg_type),
    isFromMe: Number(row.is_from_me) === 1,
    timestamp: Number(row.timestamp),
  };
}

/** Delete messages older than cutoff (ms epoch); returns rows removed. */
export async function pruneMessagesBefore(db: Client, cutoffMs: number): Promise<number> {
  const res = await db.execute({
    sql: 'DELETE FROM messages WHERE timestamp < ?',
    args: [cutoffMs],
  });
  return res.rowsAffected;
}
