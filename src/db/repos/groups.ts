import type { Client, InStatement } from '@libsql/client';

/**
 * LID ↔ PN mappings. Baileys v7 resolves PN → LID one-way; the reverse direction
 * only works for previously cached pairs, so every mapping we see gets persisted here.
 */
export async function upsertLidMapping(db: Client, lid: string, pn: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO lid_map (lid, pn, updated_at) VALUES (?, ?, ?)
          ON CONFLICT (lid) DO UPDATE SET pn = excluded.pn, updated_at = excluded.updated_at`,
    args: [lid, pn, Date.now()],
  });
}

export async function getPnForLid(db: Client, lid: string): Promise<string | null> {
  const res = await db.execute({ sql: 'SELECT pn FROM lid_map WHERE lid = ?', args: [lid] });
  const pn = res.rows[0]?.pn;
  return typeof pn === 'string' ? pn : null;
}

export async function getLidForPn(db: Client, pn: string): Promise<string | null> {
  const res = await db.execute({ sql: 'SELECT lid FROM lid_map WHERE pn = ?', args: [pn] });
  const lid = res.rows[0]?.lid;
  return typeof lid === 'string' ? lid : null;
}

export type GroupMeta = {
  groupJid: string;
  name?: string;
  description?: string;
  announce?: boolean;
};

export async function upsertGroupMeta(db: Client, meta: GroupMeta): Promise<void> {
  await db.execute({
    sql: `INSERT INTO group_meta (group_jid, name, description, announce, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (group_jid) DO UPDATE SET
            name = COALESCE(excluded.name, group_meta.name),
            description = COALESCE(excluded.description, group_meta.description),
            announce = COALESCE(excluded.announce, group_meta.announce),
            updated_at = excluded.updated_at`,
    args: [
      meta.groupJid,
      meta.name ?? null,
      meta.description ?? null,
      meta.announce === undefined ? null : meta.announce ? 1 : 0,
      Date.now(),
    ],
  });
}

export async function getGroupMeta(db: Client, groupJid: string): Promise<GroupMeta | null> {
  const res = await db.execute({
    sql: 'SELECT group_jid, name, description, announce FROM group_meta WHERE group_jid = ?',
    args: [groupJid],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    groupJid: String(row.group_jid),
    name: row.name == null ? undefined : String(row.name),
    description: row.description == null ? undefined : String(row.description),
    announce: row.announce == null ? undefined : Number(row.announce) === 1,
  };
}

export type Participant = {
  /** LID or PN as reported by Baileys */
  jid: string;
  pn?: string;
  role?: string;
};

/** Replace a group's participant snapshot in one transaction. */
export async function replaceParticipants(
  db: Client,
  groupJid: string,
  participants: Participant[],
): Promise<void> {
  const now = Date.now();
  const stmts: InStatement[] = [
    { sql: 'DELETE FROM group_participants WHERE group_jid = ?', args: [groupJid] },
    ...participants.map((p) => ({
      sql: `INSERT INTO group_participants (group_jid, jid, pn, role, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [groupJid, p.jid, p.pn ?? null, p.role ?? null, now],
    })),
  ];
  await db.batch(stmts, 'write');
}

export async function listParticipants(db: Client, groupJid: string): Promise<Participant[]> {
  const res = await db.execute({
    sql: `SELECT jid, pn, role FROM group_participants WHERE group_jid = ? ORDER BY jid`,
    args: [groupJid],
  });
  return res.rows.map((row) => ({
    jid: String(row.jid),
    pn: row.pn == null ? undefined : String(row.pn),
    role: row.role == null ? undefined : String(row.role),
  }));
}
