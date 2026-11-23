import { describe, expect, it } from 'vitest';
import { heuristicExtract } from '../../src/memory/extractor.js';

describe('heuristicExtract', () => {
  it('extracts birthdays, UIDs, events, nicknames and preferences', () => {
    const out = heuristicExtract([
      'ultah gua 12 desember wkwk',
      'cb uid 987654321 jangan lupa',
      'spar jam 8 malam tanggal 5',
      'panggil aja bang zul',
      'jangan tag gue pas turnamen',
    ]);
    const facts = out.filter((m) => m.kind === 'fact').map((m) => m.content);
    expect(facts.some((c) => c.startsWith('Ultah'))).toBe(true);
    expect(facts.some((c) => c.startsWith('UID'))).toBe(true);
    expect(out.some((m) => m.kind === 'event' && m.content.length > 0)).toBe(true);
    expect(out.some((m) => m.content.includes('Panggilan'))).toBe(true);
    expect(out.some((m) => m.kind === 'preference')).toBe(true);
    expect(out.every((m) => m.importance >= 1 && m.importance <= 5)).toBe(true);
  });

  it('deduplicates repeated facts and caps at 5', () => {
    const out = heuristicExtract([
      'uid 111111111',
      'uid 111111111',
      'uid 111111111',
      'jangan spam',
      'jangan tag',
      'rank legendary',
      'rank epic',
    ]);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it('returns nothing for idle banter', () => {
    expect(heuristicExtract(['wkwkwk', 'jir 🗿', 'gas lah'])).toEqual([]);
  });
});
