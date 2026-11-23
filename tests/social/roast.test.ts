import { describe, expect, it } from 'vitest';
import { localRoast } from '../../src/social/roast.js';
import { analyzeBurst } from '../../src/social/context-analyzer.js';

describe('localRoast', () => {
  it('roasts spam repetition with the real content', () => {
    const ctx = analyzeBurst([
      { sender: 'a', text: 'gas' },
      { sender: 'a', text: 'gas' },
      { sender: 'a', text: 'gas' },
    ]);
    const roast = localRoast({ senderName: 'Arya', context: ctx, lastSenderText: 'gas' });
    expect(roast).toContain('"gas"');
    expect(roast).toContain('3x');
  });

  it('roasts observed inactivity only (mandul banter)', () => {
    const roast = localRoast({
      senderName: 'Benned',
      context: analyzeBurst([{ sender: 'b', text: 'halo' }]),
      senderIdleMinutes: 130,
    });
    expect(roast).toContain('2 jam');
    expect(roast).toContain('mandul');
  });

  it('returns null instead of inventing material', () => {
    const roast = localRoast({
      senderName: 'X',
      context: analyzeBurst([{ sender: 'x', text: 'halo' }]),
    });
    expect(roast).toBeNull();
  });
});
