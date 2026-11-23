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
    if (res.ok) expect(res.text.length).toBeLessThanOrEqual(1_001);
  });

  it('collapses 3+ newlines to 2', () => {
    const res = validateReply('jir\n\n\n\nwok');
    expect(res.ok && res.text === 'jir\n\nwok').toBe(true);
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
