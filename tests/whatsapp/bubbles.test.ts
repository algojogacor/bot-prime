import { describe, expect, it } from 'vitest';
import { splitIntoBubbles } from '../../src/whatsapp/bubbles.js';

const PARA = (n: number): string => Array.from({ length: n }, (_, i) => `kalimat nomor ${i} dengan isi yang cukup panjang supaya menghitung.`).join(' ');

describe('splitIntoBubbles', () => {
  it('short replies stay a single bubble', () => {
    expect(splitIntoBubbles('gas aja bro')).toEqual(['gas aja bro']);
  });

  it('splits at paragraph boundaries first, in order, losing nothing', () => {
    const p1 = PARA(20); // ~700 chars each → separate bubbles
    const p2 = PARA(20);
    const p3 = PARA(20);
    const out = splitIntoBubbles([p1, p2, p3].join('\n\n'));
    expect(out.length).toBe(3);
    expect(out.join('\n\n')).toBe([p1, p2, p3].join('\n\n'));
  });

  it('sentence-splits one huge paragraph without cutting words', () => {
    const one = PARA(80); // ~2.4k chars, single paragraph
    const out = splitIntoBubbles(one);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((b) => b.length <= 1_500 + 40)).toBe(true);
    // no word was cut: every bubble ends at a sentence end or word boundary
    expect(out.join(' ').replace(/\s+/g, ' ').trim()).toBe(one.replace(/\s+/g, ' ').trim());
  });

  it('never leaves a tiny orphan bubble', () => {
    const one = PARA(50) + ' iya.';
    const out = splitIntoBubbles(one);
    const last = out[out.length - 1] as string;
    expect(last.length).toBeGreaterThanOrEqual(80);
  });

  it('empty text produces no bubbles', () => {
    expect(splitIntoBubbles('   ')).toEqual([]);
  });
});
