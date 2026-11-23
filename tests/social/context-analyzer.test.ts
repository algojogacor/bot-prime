import { describe, expect, it } from 'vitest';
import { analyzeBurst } from '../../src/social/context-analyzer.js';

describe('analyzeBurst', () => {
  it('detects banter and positive sentiment', () => {
    const ctx = analyzeBurst([
      { sender: 'a', text: 'wkwkwk gas lah siap' },
      { sender: 'b', text: 'jir gokil 🗿' },
    ]);
    expect(ctx.isBanter).toBe(true);
    expect(ctx.sentiment).toBe('positive');
  });

  it('detects negative sentiment and gaming topics', () => {
    const ctx = analyzeBurst([{ sender: 'a', text: 'kalah lagi mandul banget spar lapar' }]);
    expect(ctx.sentiment).toBe('negative');
    expect(ctx.topics).toContain('spar');
    expect(ctx.topics).toContain('mandul');
  });

  it('counts repeated identical texts', () => {
    const ctx = analyzeBurst([
      { sender: 'a', text: 'gas' },
      { sender: 'a', text: 'gas' },
      { sender: 'a', text: 'gas' },
    ]);
    expect(ctx.repeatCount).toBe(3);
    expect(ctx.senders).toEqual(['a']);
  });

  it('detects questions and links', () => {
    const q = analyzeBurst([{ sender: 'a', text: 'jam berapa spar?' }]);
    expect(q.isQuestion).toBe(true);
    const link = analyzeBurst([
      { sender: 'a', text: 'cek https://vt.tiktok.com/abc/' },
    ]);
    expect(link.hasLinks).toBe(true);
  });
});
