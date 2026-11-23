import { describe, expect, it } from 'vitest';
import { MessageDeduper } from '../../src/whatsapp/dedupe.js';

describe('MessageDeduper', () => {
  it('flags duplicates and passes new ids', () => {
    const d = new MessageDeduper();
    expect(d.check('a')).toBe(false);
    expect(d.check('a')).toBe(true);
    expect(d.check('b')).toBe(false);
    expect(d.size).toBe(2);
  });

  it('evicts the oldest entry once capacity is exceeded', () => {
    const d = new MessageDeduper(3);
    d.check('1');
    d.check('2');
    d.check('3');
    d.check('4');
    expect(d.size).toBe(3);
    expect(d.check('1')).toBe(false); // evicted → seen again as new
    expect(d.check('4')).toBe(true);
  });
});
