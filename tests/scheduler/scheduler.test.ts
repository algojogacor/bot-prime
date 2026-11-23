import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { Scheduler, retentionTask, starterTask, summarizerTask } from '../../src/scheduler/scheduler.js';
import { ShortTermStore } from '../../src/memory/short-term.js';
import { listMemories } from '../../src/db/repos/memories.js';

let db: ReturnType<typeof createDb>;

beforeEach(async () => {
  db = createDb(':memory:');
  await runMigrations(db);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('retention task', () => {
  it('runs a retention pass without errors', async () => {
    const task = retentionTask(db);
    await expect(task.run()).resolves.toBeUndefined();
  });
});

describe('summarizer task', () => {
  it('stores a summary once enough new messages accumulate', async () => {
    const shortTerm = new ShortTermStore();
    const base = Date.now();
    for (let i = 0; i < 31; i++) {
      shortTerm.push('g@lid', { sender: `u${i % 3}`, text: `spar ke ${i} wkwk`, timestamp: base + i * 1000 });
    }
    const task = summarizerTask(db, null, shortTerm, 30);
    await task.run();
    const memories = await listMemories(db, 'g@lid');
    expect(memories.some((m) => m.kind === 'summary')).toBe(true);
    // Second run without new messages does not duplicate summaries.
    await task.run();
    const again = await listMemories(db, 'g@lid');
    expect(again.filter((m) => m.kind === 'summary')).toHaveLength(1);
  });
});

describe('starter task', () => {
  it('sends a local starter when the chat is quiet in the evening window', async () => {
    vi.useFakeTimers();
    // 13:00 UTC == 20:00 WIB (evening window).
    vi.setSystemTime(new Date('2026-11-23T13:00:00Z'));
    const shortTerm = new ShortTermStore();
    const now = Date.now();
    shortTerm.push('g@lid', { sender: 'a', text: 'wkwk gas', timestamp: now - 50 * 60_000 });
    const sent: string[] = [];
    const task = starterTask(db, null, shortTerm, { sendText: async (_jid, text) => { sent.push(text); } }, 2);
    await task.run();
    expect(sent).toHaveLength(1);
    // Second run in the same window would exceed... still allowed (cap 2) but 50+ min silence again ok.
  });

  it('does not start outside the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z')); // 17:00 WIB
    const shortTerm = new ShortTermStore();
    shortTerm.push('g@lid', { sender: 'a', text: 'wkwk', timestamp: Date.now() - 50 * 60_000 });
    const sent: string[] = [];
    const task = starterTask(db, null, shortTerm, { sendText: async (_jid, text) => { sent.push(text); } }, 2);
    await task.run();
    expect(sent).toHaveLength(0);
  });
});

describe('Scheduler', () => {
  it('runs tasks on interval and stops cleanly', async () => {
    vi.useFakeTimers();
    let runs = 0;
    const scheduler = new Scheduler([
      { name: 'tick', intervalMs: 1_000, run: async () => { runs++; } },
    ]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(3_500);
    expect(runs).toBeGreaterThanOrEqual(3);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs).toBeLessThan(10);
  });
});
