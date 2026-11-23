import type { Client } from '@libsql/client';
import { childLogger } from '../logger.js';
import { MIGRATIONS } from './migrations.js';

const log = childLogger({ mod: 'db:migrate' });

/**
 * Apply pending migrations. Each migration + its version stamp run in one
 * implicit write transaction (libSQL batch = all-or-nothing), so a failed
 * migration never leaves a half-applied schema behind.
 * Returns the number of migrations applied.
 */
export async function runMigrations(db: Client): Promise<number> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const res = await db.execute(
    'SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1',
  );
  const row = res.rows[0];
  const current = typeof row?.version === 'number' ? row.version : 0;

  let applied = 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await db.batch(
      [
        ...migration.up.map((sql) => ({ sql, args: [] as [] })),
        {
          sql: 'INSERT INTO _schema_version (version, name, applied_at) VALUES (?, ?, ?)',
          args: [migration.version, migration.name, Date.now()],
        },
      ],
      'write',
    );
    log.info({ version: migration.version, name: migration.name }, 'migration applied');
    applied++;
  }
  return applied;
}
