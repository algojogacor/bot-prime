import { describe, expect, it } from 'vitest';
import { ShortTermStore } from '../../src/memory/short-term.js';

describe('ShortTermStore', () => {
  it('keeps the latest messages per chat in order', () => {
    const store = new ShortTermStore();
    store.push('g1', { sender: 'a', text: 'wok', timestamp: 1 });
    store.push('g1', { sender: 'b', text: 'gas', timestamp: 2 });
    expect(store.recent('g1')).toEqual([
      { sender: 'a', text: 'wok', timestamp: 1 },
      { sender: 'b', text: 'gas', timestamp: 2 },
    ]);
  });

  it('evicts the oldest message beyond per-chat capacity', () => {
    const store = new ShortTermStore(2);
    store.push('g1', { sender: 'a', text: '1', timestamp: 1 });
    store.push('g1', { sender: 'a', text: '2', timestamp: 2 });
    store.push('g1', { sender: 'a', text: '3', timestamp: 3 });
    expect(store.recent('g1').map((m) => m.text)).toEqual(['2', '3']);
  });

  it('evicts whole chats beyond the chat capacity', () => {
    const store = new ShortTermStore(5, 2);
    store.push('a', { sender: 'x', text: '1', timestamp: 1 });
    store.push('b', { sender: 'x', text: '2', timestamp: 2 });
    store.push('c', { sender: 'x', text: '3', timestamp: 3 });
    expect(store.activeChats()).toEqual(['b', 'c']);
    expect(store.recent('a')).toEqual([]);
  });

  it('reports minutes since the last message', () => {
    const store = new ShortTermStore();
    store.push('g1', { sender: 'a', text: 'wkwk', timestamp: 1_000 });
    expect(store.minutesSinceLastMessage('g1', 61_000)).toBe(1);
    expect(store.minutesSinceLastMessage('g1', 10_000)).toBe(0);
    expect(store.minutesSinceLastMessage('unknown')).toBeNull();
    expect(store.lastMessage('g1')?.text).toBe('wkwk');
  });
});
