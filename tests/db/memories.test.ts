import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import {
  addMemory,
  deleteMemory,
  listMemories,
  listTopMemories,
  pruneMemories,
  searchMemories,
} from '../../src/db/repos/memories.js';

let db: ReturnType<typeof createDb>;

beforeEach(async () => {
  db = createDb(':memory:');
  await runMigrations(db);
});

describe('memories repo (FTS5-backed)', () => {
  it('stores memories and finds them lexically', async () => {
    await addMemory(db, { chatJid: 'g@lid', kind: 'event', content: 'spar tiap jumat jam 8 malam', importance: 3 });
    await addMemory(db, { chatJid: 'g@lid', kind: 'fact', content: 'UID avo benned 123456789', importance: 3 });

    const hits = await searchMemories(db, 'g@lid', ['spar', 'jumat'], 5);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toBe('spar tiap jumat jam 8 malam');
  });

  it('isolates memories per chat', async () => {
    await addMemory(db, { chatJid: 'g1@lid', kind: 'fact', content: 'turnamen desember 2026', importance: 4 });
    expect(await searchMemories(db, 'g2@lid', ['turnamen'], 5)).toHaveLength(0);
    expect(await searchMemories(db, 'g1@lid', ['turnamen'], 5)).toHaveLength(1);
  });

  it('lists top memories by importance then recency', async () => {
    await addMemory(db, { chatJid: 'g@lid', kind: 'fact', content: 'low', importance: 1 });
    await addMemory(db, { chatJid: 'g@lid', kind: 'event', content: 'high', importance: 5 });
    const top = await listTopMemories(db, 'g@lid', 5);
    expect(top[0]?.content).toBe('high');
    expect(top).toHaveLength(2);
  });

  it('deletes memories and keeps FTS in sync via trigger', async () => {
    const id = await addMemory(db, { chatJid: 'g@lid', kind: 'fact', content: 'hapus gue yok', importance: 2 });
    expect(await deleteMemory(db, id)).toBe(true);
    expect(await searchMemories(db, 'g@lid', ['yok'], 5)).toHaveLength(0);
    expect(await listMemories(db, 'g@lid')).toHaveLength(0);
  });

  it('prunes old low-importance memories but keeps important ones', async () => {
    const id = await addMemory(db, { chatJid: 'g@lid', kind: 'fact', content: 'ancient low', importance: 1 });
    await db.execute({ sql: 'UPDATE memories SET created_at = ? WHERE id = ?', args: [Date.now() - 40 * 86_400_000, id] });
    const importantId = await addMemory(db, { chatJid: 'g@lid', kind: 'fact', content: 'ancient important', importance: 4 });
    await db.execute({ sql: 'UPDATE memories SET created_at = ? WHERE id = ?', args: [Date.now() - 90 * 86_400_000, importantId] });

    const deleted = await pruneMemories(db, { olderThanMs: 30 * 86_400_000, keepImportanceFrom: 3 });
    expect(deleted).toBe(1);
    expect(await searchMemories(db, 'g@lid', ['ancient', 'important'], 5)).toHaveLength(1);
  });

  it('ignores terms made of only FTS special characters', async () => {
    await addMemory(db, { chatJid: 'g@lid', kind: 'fact', content: 'aman', importance: 1 });
    expect(await searchMemories(db, 'g@lid', ['""', "''"], 5)).toHaveLength(0);
  });
});
