import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { addMemory } from '../../src/db/repos/memories.js';
import { buildMemoryContext, termsFrom } from '../../src/memory/retrieval.js';

let db: ReturnType<typeof createDb>;

beforeEach(async () => {
  db = createDb(':memory:');
  await runMigrations(db);
});

describe('termsFrom', () => {
  it('keeps content terms and drops stopwords/short tokens', () => {
    expect(termsFrom('wok spar jam berapa nnti vs eclipse')).toEqual(['spar', 'berapa', 'nnti', 'eclipse']);
    expect(termsFrom('ga ada yg mau 12 345')).toEqual([]);
  });
});

describe('buildMemoryContext', () => {
  it('returns term-matched memories with kind tags', async () => {
    await addMemory(db, { chatJid: 'g@lid', kind: 'event', content: 'spar tiap jumat jam 8', importance: 3 });
    const ctx = await buildMemoryContext(db, 'g@lid', 'eh spar hari ini jam berapa?');
    expect(ctx).toContain('[event]');
    expect(ctx).toContain('spar tiap jumat jam 8');
  });

  it('falls back to top memories when nothing matches', async () => {
    await addMemory(db, { chatJid: 'g@lid', kind: 'fact', content: 'UID 123456789', importance: 4 });
    const ctx = await buildMemoryContext(db, 'g@lid', 'haloo wkwk');
    expect(ctx).toContain('UID 123456789');
  });

  it('returns null for chats without memories', async () => {
    expect(await buildMemoryContext(db, 'none@lid', 'apa kabar wkwk')).toBeNull();
  });
});
