import type { Client, InStatement } from '@libsql/client';

export type StoredMessage = {
  id: string;
  chatJid: string;
  senderJid: string;
  senderPn?: string;
  text?: string;
  msgType: string;
  isFromMe: boolean;
  /** ms epoch */
  timestamp: number;
};

export type StoredMessageRow = StoredMessage & { createdAt: number };

/** Insert messages in one write transaction; duplicate ids are ignored. */
export async function insertMessages(db: Client, msgs: StoredMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  const stmts: InStatement[] = msgs.map((m) => ({
    sql: `INSERT INTO messages (id, chat_jid, sender_jid, sender_pn, text, msg_type, is_from_me, timestamp, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ],
  }));
  await db.batch(stmts, 'write');
}

/** Newest-first page of a chat's messages (indexed by (chat_jid, timestamp)). */
export async function listRecentMessages(
  db: Client,
  chatJid: string,
  limit: number,
): Promise<StoredMessageRow[]> {
  const res = await db.execute({
    sql: `SELECT id, chat_jid, sender_jid, sender_pn, text, msg_type, is_from_me, timestamp, created_at
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
  }));
}

/** Delete messages older than cutoff (ms epoch); returns rows removed. */
export async function pruneMessagesBefore(db: Client, cutoffMs: number): Promise<number> {
  const res = await db.execute({
    sql: 'DELETE FROM messages WHERE timestamp < ?',
    args: [cutoffMs],
  });
  return res.rowsAffected;
}
