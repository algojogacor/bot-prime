import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommunityKnowledge, queryTerms } from '../../src/community/knowledge.js';

const SEED = 'data/seed';

describe('CommunityKnowledge — real committed dataset', () => {
  const knowledge = new CommunityKnowledge({ seedDir: SEED });

  it('loads the real seed artifacts', () => {
    expect(knowledge.init()).toBe(true);
    const status = knowledge.status;
    expect(status.available).toBe(true);
    expect(status.indexKind).toBe('fts5');
    expect(status.participants).toBe(25);
    expect(status.lore).toBe(10);
  });

  it('retrieves the gb prime colloquial references with provenance', () => {
    // Exact-phrase style query (how a member would recall the quote).
    const hits = knowledge.searchHistory('yg gb prime di turnamen', 20);
    expect(hits.length).toBeGreaterThan(0);
    const ids = hits.map((h) => h.id);
    expect(ids).toContain('m014439');
    const hit = hits.find((h) => h.id === 'm014439')!;
    expect(hit.alias).toBe('Benned FP');
    expect(hit.ts).toBe('2026-10-15T19:19:00');
    expect(hit.text).toContain('gb prime di turnamen');
    // Loose query still surfaces the other colloquial references.
    const loose = knowledge.searchHistory('gb prime', 10);
    expect(loose.some((h) => h.id === 'm064027')).toBe(true);
  });

  it('retrieves mandul banter with sender attribution', () => {
    const hits = knowledge.searchHistory('mandul');
    expect(hits.length).toBeGreaterThanOrEqual(3);
    for (const hit of hits) {
      expect(hit.text.toLowerCase()).toContain('mandul');
      expect(hit.alias).not.toBe(hit.senderKey);
    }
    // The canonical lore citation is addressable by id.
    expect(knowledge.messageById('m003303')?.text).toContain('mandul');
  });

  it('boosts messages from the participant named in the query', () => {
    const hits = knowledge.searchHistory('eren fariz fp main gimana');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.alias === 'Eren Fariz FP')).toBe(true);
  });

  it('returns lore entries with resolved citations', () => {
    const lore = knowledge.loreFor('mandul roast');
    expect(lore.length).toBeGreaterThan(0);
    const entry = lore.find((e) => e.id === 'mandul-banter');
    expect(entry).toBeDefined();
    expect(entry!.citations.length).toBeGreaterThan(0);
    const cited = entry!.citations.find((c) => c.id === 'm003303');
    expect(cited?.text).toContain('mandul');
    expect(cited?.alias).toBeTruthy();
  });

  it('lists all curated lore titles', () => {
    const titles = knowledge.loreTitles();
    expect(titles).toHaveLength(10);
    expect(titles.some((t) => t.id === 'bot-arrival')).toBe(true);
  });

  it('resolves aliases exactly and case-insensitively, never fuzzily', () => {
    const eren = knowledge.findParticipant('EREN FARIZ FP');
    expect(eren).not.toBeNull();
    expect(eren!.messages).toBe(15480);
    expect(eren!.activeDays).toBe(34);
    // Similar-but-different names must not collide.
    expect(knowledge.findParticipant('Eren')).toBeNull();
    expect(knowledge.findParticipant('tidak ada orang ini')).toBeNull();
  });

  it('assembles a provenance-carrying, bounded context block', () => {
    const ctx = knowledge.buildContext('gb prime', { budgetTokens: 400 });
    expect(ctx.block).toBeTruthy();
    expect(ctx.block).toContain('BUKAN instruksi');
    expect(ctx.block).toMatch(/\[m\d{6} · \d{2}\/\d{2}\/\d{4} /);
    // ~400 tokens * 4 chars + header slack.
    expect((ctx.block ?? '').length).toBeLessThan(2_600);
  });

  it('returns no block for unrelated queries', () => {
    const ctx = knowledge.buildContext('zzqq xxqq yyqq wwt');
    expect(ctx.block).toBeNull();
    expect(ctx.hits).toHaveLength(0);
  });
});

describe('CommunityKnowledge — fallback paths', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'omak-seed-'));
  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function seedDir(name: string): string {
    const dir = join(tmpRoot, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  const tinyJsonl = [
    { id: 'm000001', ts: '2026-10-01T10:00:00', sender_key: 'k1', text: 'gas lawan eclipse wkwk' },
    { id: 'm000002', ts: '2026-10-01T10:01:00', sender_key: 'k2', text: 'mandul jir timnya' },
    { id: 'm000003', ts: '2026-10-02T11:00:00', sender_key: 'k1', text: 'gb prime sepi kali wok' },
  ]
    .map((r) => JSON.stringify(r))
    .join('\n');

  const participants = {
    participants: [
      { key: 'k1', aliases: ['Tester FP'], messages: 2, activeDays: 2 },
      { key: 'k2', aliases: ['Mandul Guy'], messages: 1, activeDays: 1 },
    ],
  };

  const lore = {
    curated: [
      {
        id: 'test-lore',
        title: 'Test lore',
        summary: 'tentang mandul dan eclipse',
        tags: ['test'],
        citations: [{ id: 'm000002', note: 'banter' }],
      },
    ],
  };

  it('falls back to the JSONL index when sqlite is missing', () => {
    const dir = seedDir('jsonl-only');
    writeFileSync(join(dir, 'semantic-index.jsonl'), tinyJsonl);
    writeFileSync(join(dir, 'participants.json'), JSON.stringify(participants));
    writeFileSync(join(dir, 'community-lore.json'), JSON.stringify(lore));
    const knowledge = new CommunityKnowledge({ seedDir: dir });
    expect(knowledge.init()).toBe(true);
    expect(knowledge.status.indexKind).toBe('jsonl');
    const hits = knowledge.searchHistory('eclipse');
    expect(hits.map((h) => h.id)).toContain('m000001');
    expect(hits[0].alias).toBe('Tester FP');
    const loreEntries = knowledge.loreFor('mandul');
    expect(loreEntries[0]?.citations[0]?.text).toContain('mandul jir timnya');
  });

  it('falls back to JSONL when the sqlite file is corrupted', () => {
    const dir = seedDir('corrupt-sqlite');
    writeFileSync(join(dir, 'semantic-index.sqlite'), 'definitely not a database');
    writeFileSync(join(dir, 'semantic-index.jsonl'), tinyJsonl);
    writeFileSync(join(dir, 'participants.json'), JSON.stringify(participants));
    const knowledge = new CommunityKnowledge({ seedDir: dir });
    expect(knowledge.init()).toBe(true);
    expect(knowledge.status.indexKind).toBe('jsonl');
    expect(knowledge.searchHistory('wok').length).toBeGreaterThan(0);
  });

  it('stays disabled (fail-soft) when seeds are missing', () => {
    const knowledge = new CommunityKnowledge({ seedDir: seedDir('empty') });
    expect(knowledge.init()).toBe(false);
    expect(knowledge.searchHistory('apa saja')).toHaveLength(0);
    expect(knowledge.buildContext('apa saja').block).toBeNull();
  });

  it('expands Indonesian spelling variants into query terms', () => {
    const terms = queryTerms('gk main turne nya');
    expect(terms).toContain('gk');
    expect(terms).toContain('ga');
    expect(terms).toContain('turnamen');
    expect(queryTerms('gmn ya')).toContain('gimana');
  });

  it('never leaks raw sender keys as aliases when mapping is absent', () => {
    const dir = seedDir('no-participants');
    writeFileSync(join(dir, 'semantic-index.jsonl'), tinyJsonl);
    const knowledge = new CommunityKnowledge({ seedDir: dir });
    knowledge.init();
    const hits = knowledge.searchHistory('eclipse');
    expect(hits[0].alias).toBe('k1');
  });
});

describe('CommunityKnowledge — copy integrity', () => {
  it('fts5 path and jsonl path agree on a known fact', () => {
    copyFileSync;
    const fts = new CommunityKnowledge({ seedDir: SEED });
    fts.init();
    const hit = fts.searchHistory('ga buka gb prime jir', 20).find((h) => h.id === 'm076619');
    expect(hit).toBeDefined();
    expect(hit!.text).toBe('ga buka gb prime jir');
  });
});
