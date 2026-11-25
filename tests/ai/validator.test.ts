import { describe, expect, it } from 'vitest';
import { parseJsonReply, validateReply } from '../../src/ai/validator.js';

describe('validateReply', () => {
  it('rejects empty replies', () => {
    expect(validateReply('   ')).toMatchObject({ ok: false });
  });

  it('strips leaked markdown fences', () => {
    const res = validateReply('```\nwkwk gas\n```');
    expect(res).toEqual({ ok: true, text: 'wkwk gas' });
  });

  it('caps extremely long replies with an ellipsis', () => {
    const res = validateReply('a'.repeat(2_000));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.text.length).toBeGreaterThan(0);
  });

  it('collapses 3+ newlines to 2', () => {
    const res = validateReply('jir\n\n\n\nwok');
    expect(res.ok && res.text === 'jir\n\nwok').toBe(true);
  });

  it('strips a leaked "omak:" self-label (live regression)', () => {
    // The model occasionally opens with the transcript label it saw in the
    // history section; it must never reach the group verbatim.
    const res = validateReply('omak: wkwk, lu ketawa kayak glitch');
    expect(res.ok && res.text === 'wkwk, lu ketawa kayak glitch').toBe(true);
    const res2 = validateReply('Omak :gas dah');
    expect(res2.ok && res2.text === 'gas dah').toBe(true);
    // Other speakers' labels are NOT stripped — only the bot's own.
    const res3 = validateReply('arya: bentar');
    expect(res3.ok && res3.text === 'arya: bentar').toBe(true);
  });

  it('strips control characters but keeps newlines (live NUL-byte regression)', () => {
    const res = validateReply('ke oper di match selanjutnya?\u0000');
    expect(res.ok && res.text === 'ke oper di match selanjutnya?').toBe(true);
    const res2 = validateReply('paragraf\u000B satu\nparagraf dua');
    expect(res2.ok && res2.text === 'paragraf satu\nparagraf dua').toBe(true);
  });
});

describe('parseJsonReply', () => {
  it('parses plain json', () => {
    expect(parseJsonReply<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced json and returns null for garbage', () => {
    expect(parseJsonReply<{ b: string }>('```json\n{"b":"x"}\n```')).toEqual({ b: 'x' });
    expect(parseJsonReply('not json')).toBeNull();
  });
});
