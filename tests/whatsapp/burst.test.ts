import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BurstCollector } from '../../src/whatsapp/burst.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('BurstCollector', () => {
  it('collects a chat burst and flushes once per window', async () => {
    const flushed: Array<{ chat: string; items: number[] }> = [];
    const collector = new BurstCollector<number>(1_000, (chat, items) => {
      flushed.push({ chat, items });
    });

    collector.push('g1', 1);
    collector.push('g1', 2);
    collector.push('g2', 9);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(flushed).toEqual([
      { chat: 'g1', items: [1, 2] },
      { chat: 'g2', items: [9] },
    ]);
  });

  it('does not double-flush when more messages arrive during the window', async () => {
    const flushed: Array<{ chat: string; items: number[] }> = [];
    const collector = new BurstCollector<number>(500, (chat, items) => {
      flushed.push({ chat, items });
    });

    collector.push('g1', 1);
    await vi.advanceTimersByTimeAsync(250);
    collector.push('g1', 2);
    await vi.advanceTimersByTimeAsync(250);

    expect(flushed).toEqual([{ chat: 'g1', items: [1, 2] }]);
  });

  it('stop() flushes everything pending immediately', async () => {
    const flushed: Array<{ chat: string; items: string[] }> = [];
    const collector = new BurstCollector<string>(60_000, (chat, items) => {
      flushed.push({ chat, items });
    });

    collector.push('g1', 'wkwk');
    collector.push('g1', 'jir');
    await collector.stop();

    expect(flushed).toEqual([{ chat: 'g1', items: ['wkwk', 'jir'] }]);
  });
});
