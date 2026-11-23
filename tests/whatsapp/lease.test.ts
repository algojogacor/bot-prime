import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../src/db/migrate.js';
import { OwnershipLease } from '../../src/whatsapp/lease.js';

describe('OwnershipLease (migration 6 fencing)', () => {
  let db: Client;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'omak-lease-'));
    db = createClient({ url: `file:${join(dir, 'lease.db')}` });
    await runMigrations(db);
  });

  afterAll(async () => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lets the first holder acquire, blocks the second, releases cleanly', async () => {
    const first = new OwnershipLease(db, 'test', { ttlMs: 60_000 });
    expect(await first.acquire()).toBe(true);

    const second = new OwnershipLease(db, 'test', { ttlMs: 60_000, maxWaitMs: 300, retryMs: 50 });
    expect(await second.acquire()).toBe(false);

    await first.release();
    expect(await second.acquire()).toBe(true);
    await second.release();
  });

  it('hands over the lease once its TTL lapses (dead holder)', async () => {
    const holder = new OwnershipLease(db, 'short', { ttlMs: 60_000 });
    expect(await holder.acquire()).toBe(true);
    // Simulate the holder crashing: no more heartbeats, TTL long past.
    await db.execute({
      sql: 'UPDATE instance_lease SET expires_at = ? WHERE resource = ?',
      args: [Date.now() - 10, 'short'],
    });
    const rival = new OwnershipLease(db, 'short', { ttlMs: 60_000, maxWaitMs: 500, retryMs: 50 });
    expect(await rival.acquire()).toBe(true);
    await rival.release();
  }, 10_000);

  it('heartbeat renews an actively held lease so rivals cannot steal it', async () => {
    const holder = new OwnershipLease(db, 'heart', { ttlMs: 200 });
    expect(await holder.acquire()).toBe(true);
    // TTL 200ms, renewal every ~100ms; wait past one full TTL.
    await new Promise((r) => setTimeout(r, 350));
    const rival = new OwnershipLease(db, 'heart', { ttlMs: 60_000, maxWaitMs: 300, retryMs: 50 });
    expect(await rival.acquire()).toBe(false);
    await holder.release();
  }, 10_000);

  it('expiry handover works when the old holder crashed without release', async () => {
    const crashed = new OwnershipLease(db, 'crash', { ttlMs: 60_000 });
    expect(await crashed.acquire()).toBe(true);
    // Crash: heartbeat stops, expires_at lapses.
    await db.execute({
      sql: 'UPDATE instance_lease SET expires_at = ? WHERE resource = ?',
      args: [Date.now() - 10, 'crash'],
    });
    const takeover = new OwnershipLease(db, 'crash', { ttlMs: 60_000, maxWaitMs: 500, retryMs: 50 });
    expect(await takeover.acquire()).toBe(true);
    await takeover.release();
  }, 10_000);
});
