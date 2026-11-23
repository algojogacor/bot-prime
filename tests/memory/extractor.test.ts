import { describe, expect, it } from 'vitest';
import { heuristicExtract } from '../../src/memory/extractor.js';

describe('heuristicExtract', () => {
  it('extracts birthdays, UIDs, events, nicknames and preferences', () => {
    const out = heuristicExtract([
{ id: 'x', text: 'ultah gua 12 desember wkwk' },
{ id: 'x', text: 'cb uid 987654321 jangan lupa' },
{ id: 'x', text: 'spar jam 8 malam tanggal 5' },
{ id: 'x', text: 'panggil aja bang zul' },
{ id: 'x', text: 'jangan tag gue pas turnamen' },
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
{ id: 'x', text: 'uid 111111111' },
{ id: 'x', text: 'uid 111111111' },
{ id: 'x', text: 'uid 111111111' },
{ id: 'x', text: 'jangan spam' },
{ id: 'x', text: 'jangan tag' },
{ id: 'x', text: 'rank legendary' },
{ id: 'x', text: 'rank epic' },
]);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it('returns nothing for idle banter', () => {
    expect(heuristicExtract([{ id: 'a', text: 'wkwkwk' }, { id: 'b', text: 'jir 🗿' }, { id: 'c', text: 'gas lah' }])).toEqual([]);
  });
});
