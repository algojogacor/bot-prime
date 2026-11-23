import type { Client } from '@libsql/client';

export type GroupMode = 'passive' | 'balanced' | 'active';

export type GroupSettings = {
  groupJid: string;
  mode: GroupMode;
  paused: boolean;
};

/**
 * Per-group participation settings. Persisted so pause/mode survive restarts
 * (Koyeb redeploys are routine, and a pause that forgets itself is spam).
 */
export async function getGroupSettings(db: Client, groupJid: string): Promise<GroupSettings> {
  const res = await db.execute({
    sql: 'SELECT mode, paused FROM group_settings WHERE group_jid = ?',
    args: [groupJid],
  });
  const row = res.rows[0];
  if (!row) return { groupJid, mode: 'balanced', paused: false };
  return {
    groupJid,
    mode: parseMode(row.mode),
    paused: Number(row.paused) === 1,
  };
}

export async function setGroupMode(db: Client, groupJid: string, mode: GroupMode): Promise<void> {
  await db.execute({
    sql: `INSERT INTO group_settings (group_jid, mode, paused, updated_at) VALUES (?, ?, 0, ?)
          ON CONFLICT (group_jid) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at`,
    args: [groupJid, mode, Date.now()],
  });
}

export async function setGroupPaused(db: Client, groupJid: string, paused: boolean): Promise<void> {
  await db.execute({
    sql: `INSERT INTO group_settings (group_jid, mode, paused, updated_at) VALUES (?, 'balanced', ?, ?)
          ON CONFLICT (group_jid) DO UPDATE SET paused = excluded.paused, updated_at = excluded.updated_at`,
    args: [groupJid, paused ? 1 : 0, Date.now()],
  });
}

function parseMode(value: unknown): GroupMode {
  return value === 'passive' || value === 'active' ? value : 'balanced';
}
