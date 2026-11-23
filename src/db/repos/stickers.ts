import type { Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';

export type Sticker = {
  id: string;
  name: string;
  tags: string[];
  pack?: string;
  blobId: string;
  addedBy?: string;
  createdAt: number;
};

/** Store binary content in the DB — Koyeb's disk is ephemeral, blobs are not. */
export async function putBlob(db: Client, data: Buffer, mime: string): Promise<string> {
  const id = randomUUID();
  await db.execute({
    sql: 'INSERT INTO blobs (id, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [id, mime, data, data.length, Date.now()],
  });
  return id;
}

export async function getBlob(
  db: Client,
  id: string,
): Promise<{ mime: string; data: Buffer } | null> {
  const res = await db.execute({
    sql: 'SELECT mime, data FROM blobs WHERE id = ?',
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;
  const data = row.data;
  const buf = data instanceof Buffer ? data : Buffer.from(data as unknown as Uint8Array);
  return { mime: String(row.mime), data: buf };
}

export async function addSticker(
  db: Client,
  s: { name: string; tags?: string[]; pack?: string; blobId: string; addedBy?: string },
): Promise<string> {
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO stickers (id, name, tags, pack, blob_id, added_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, s.name, (s.tags ?? []).join(',').toLowerCase(), s.pack ?? null, s.blobId, s.addedBy ?? null, Date.now()],
  });
  return id;
}

export async function findStickerByName(db: Client, name: string): Promise<Sticker | null> {
  const res = await db.execute({
    sql: 'SELECT id, name, tags, pack, blob_id, added_by, created_at FROM stickers WHERE LOWER(name) = ? LIMIT 1',
    args: [name.toLowerCase()],
  });
  const row = res.rows[0];
  return row ? rowToSticker(row) : null;
}

export async function listStickers(db: Client, limit = 100): Promise<Sticker[]> {
  const res = await db.execute({
    sql: `SELECT id, name, tags, pack, blob_id, added_by, created_at
          FROM stickers ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows.map(rowToSticker);
}

export async function deleteSticker(db: Client, name: string): Promise<boolean> {
  const found = await findStickerByName(db, name);
  if (!found) return false;
  await db.execute({ sql: 'DELETE FROM stickers WHERE id = ?', args: [found.id] });
  await db.execute({ sql: 'DELETE FROM blobs WHERE id = ?', args: [found.blobId] });
  return true;
}

/**
 * Text → sticker matcher: a single chat token equal to the sticker's name or
 * one of its tags (case-insensitive). Exact-token only on purpose — substring
 * matching on chat noise produces false positives.
 */
export async function matchStickerByText(db: Client, text: string): Promise<string | null> {
  // Keep emoji and hyphens inside tokens (names like 'moai-gag', tags like '🗿').
  const tokens = text
    .toLowerCase()
    .split(/[^\w🗿😭😹🤣😈-]+/u)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;
  const stickers = await listStickers(db, 500);
  for (const sticker of stickers) {
    const keys = new Set([sticker.name.toLowerCase(), ...sticker.tags]);
    if (tokens.some((t) => keys.has(t))) return sticker.name;
  }
  return null;
}

function rowToSticker(row: Record<string, unknown>): Sticker {
  return {
    id: String(row.id),
    name: String(row.name),
    tags: String(row.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
    pack: row.pack == null ? undefined : String(row.pack),
    blobId: String(row.blob_id),
    addedBy: row.added_by == null ? undefined : String(row.added_by),
    createdAt: Number(row.created_at),
  };
}
