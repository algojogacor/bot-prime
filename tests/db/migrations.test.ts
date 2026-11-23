import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

let db: ReturnType<typeof createDb>;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('runMigrations', () => {
  it('applies migrations once and is idempotent', async () => {
    expect(await runMigrations(db)).toBeGreaterThanOrEqual(1);
    const afterFirst = await runMigrations(db);
    expect(afterFirst).toBe(0);
  });

  it('creates the expected tables and indexes', async () => {
    await runMigrations(db);
    const res = await db.execute(
      `SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    );
    const names = res.rows.map((r) => String(r.name));
    for (const expected of [
      '_schema_version',
      'auth_keys',
      'messages',
      'lid_map',
      'group_meta',
      'group_participants',
      'ai_usage',
      'idx_messages_chat_ts',
      'idx_messages_ts',
      'idx_ai_usage_day',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('stamps the applied version', async () => {
    await runMigrations(db);
    const res = await db.execute('SELECT MAX(version) AS v FROM _schema_version');
    const v = res.rows[0]?.v;
    expect(Number(v)).toBe(1);
  });
});
