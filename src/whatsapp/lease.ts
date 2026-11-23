import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { childLogger } from '../logger.js';

const log = childLogger({ mod: 'whatsapp:lease' });

export type LeaseOptions = {
  /** Lease time-to-live; the holder heartbeats to renew. */
  ttlMs?: number;
  /** How long acquire() waits for a competing holder before giving up. */
  maxWaitMs?: number;
  /** Poll interval while waiting. */
  retryMs?: number;
};

/**
 * Database-backed ownership lease for the WhatsApp socket. When a Koyeb deploy
 * overlaps the old instance, both processes would otherwise open two sockets —
 * duplicate messages, duplicate replies. Only the lease holder connects; the
 * old instance releases on SIGTERM and its lease expires on crash.
 */
export class OwnershipLease {
  readonly holderId = randomUUID();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private released = false;

  constructor(
    private readonly db: Client,
    private readonly resource: string,
    private readonly opts: LeaseOptions = {},
  ) {}

  /**
   * Try to acquire, waiting up to maxWaitMs for a competing holder's lease to
   * expire. Returns false when ownership could not be taken in time.
   */
  async acquire(): Promise<boolean> {
    const ttl = this.opts.ttlMs ?? 60_000;
    const maxWait = this.opts.maxWaitMs ?? 120_000;
    const retry = this.opts.retryMs ?? 5_000;
    const deadline = Date.now() + maxWait;

    for (;;) {
      const now = Date.now();
      const res = await this.db.execute({
        sql: `INSERT INTO instance_lease (resource, holder, expires_at, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT (resource) DO UPDATE SET
                holder = excluded.holder,
                expires_at = excluded.expires_at,
                updated_at = excluded.updated_at
              WHERE instance_lease.expires_at <= ? OR instance_lease.holder = excluded.holder`,
        args: [this.resource, this.holderId, now + ttl, now, now],
      });
      if (res.rowsAffected === 1) {
        this.startHeartbeat(ttl);
        log.info({ resource: this.resource, holder: this.holderId }, 'lease acquired');
        return true;
      }
      if (this.released || Date.now() >= deadline) {
        log.warn({ resource: this.resource }, 'lease not acquired within deadline');
        return false;
      }
      await new Promise((r) => setTimeout(r, retry));
    }
  }

  private startHeartbeat(ttlMs: number): void {
    if (this.heartbeatTimer) return;
    // Renew well within the TTL: at most TTL/2 between renewals (≥2 renewals
    // per TTL), with a 250 ms floor for test-friendly short TTLs.
    const interval = Math.min(Math.max(250, Math.floor(ttlMs / 3)), Math.max(50, Math.floor(ttlMs / 2)));
    this.heartbeatTimer = setInterval(() => {
      void this.db
        .execute({
          sql: `UPDATE instance_lease SET expires_at = ?, updated_at = ?
                WHERE resource = ? AND holder = ?`,
          args: [Date.now() + ttlMs, Date.now(), this.resource, this.holderId],
        })
        .catch((err) => log.warn({ err }, 'lease heartbeat failed'));
    }, interval);
    this.heartbeatTimer.unref?.();
  }

  /** Release the lease if we still hold it (called on graceful shutdown). */
  async release(): Promise<void> {
    this.released = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    await this.db
      .execute({
        sql: 'DELETE FROM instance_lease WHERE resource = ? AND holder = ?',
        args: [this.resource, this.holderId],
      })
      .catch((err) => log.warn({ err }, 'lease release failed'));
  }
}
