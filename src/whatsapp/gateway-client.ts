import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { childLogger } from '../logger.js';

const log = childLogger({ mod: 'wa:gateway-client' });

/**
 * Transport client for the wa-gateway Unix socket (NDJSON protocol).
 *
 * Owns ZERO WhatsApp logic: connects to the gateway socket, speaks the
 * hello/handshake, receives normalized `msg` events, and turns consumer
 * `send` requests into per-bubble lines. Everything above this layer
 * (burst collection, dedupe, commands, AI) is untouched — this file only
 * replaces the socket plumbing that used to live in WhatsAppService.
 */

export type GatewayMessageEvent = {
  t: 'msg';
  id: string;
  /** Epoch — SECONDS when the gateway forwards Baileys' messageTimestamp
   * verbatim (its documented behavior), milliseconds on the fallback path.
   * Consumers must normalize the unit before use. */
  ts: number;
  from: string;
  sender: string;
  isGroup: boolean;
  fromMe: boolean;
  text?: string;
  quoted?: { id: string; text?: string };
  /** WhatsApp display name of the sender (mapped to WAMessage.pushName). */
  pushName?: string;
  raw?: { key?: unknown; message?: unknown; pushName?: unknown };
};

export type GatewayStatusEvent = {
  t: 'status';
  wa: 'connected' | 'connecting' | 'reconnecting' | 'logged_out';
};

export type GatewayClientEvents = {
  message: (ev: GatewayMessageEvent) => void;
  status: (ev: GatewayStatusEvent) => void;
  connected: () => void;
  closed: () => void;
};

export class GatewayClient extends EventEmitter {
  private socket: Socket | null = null;
  private buf = '';
  private stopped = false;
  private backoffMs = 200;
  private connected = false;
  private helloAcked = false;

  constructor(private readonly socketPath: string) {
    super();
    this.setMaxListeners(20);
  }

  get isConnected(): boolean {
    return this.connected && this.helloAcked && this.socket !== null;
  }

  start(): void {
    this.stopped = false;
    void this.connectLoop();
  }

  stop(): void {
    this.stopped = true;
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  /** Send one bubble. Resolves with the gateway ack (message id or error). */
  async sendText(to: string, text: string, typingMs?: number): Promise<{ id?: string; ts?: number }> {
    if (!this.socket || !this.connected) throw new Error('gateway not connected');
    const rid = `bp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const line = `${JSON.stringify({ t: 'send', rid, to, text, typingMs })}\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('ack', onAck as never);
        reject(new Error('gateway send timeout'));
      }, 30_000);
      const onAck = (ack: { rid: string; ok: boolean; id?: string; ts?: number; err?: string }): void => {
        if (ack.rid !== rid) return;
        clearTimeout(timer);
        this.off('ack', onAck as never);
        if (ack.ok) resolve({ id: ack.id, ts: ack.ts });
        else reject(new Error(ack.err ?? 'gateway send failed'));
      };
      this.on('ack', onAck as never);
      this.socket?.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.off('ack', onAck as never);
          reject(err);
        }
      });
    });
  }

  private async connectLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.dial();
        this.backoffMs = 200; // success resets backoff
        return; // dial() resolves only when the socket later closes
      } catch (err) {
        if (this.stopped) return;
        log.debug({ err: String(err).slice(0, 80) }, 'gateway dial failed; retrying');
        await sleep(this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, 2_000);
      }
    }
  }

  private dial(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = connect(this.socketPath);
      let helloed = false;
      const fail = (err: Error): void => {
        cleanup();
        reject(err);
      };
      const cleanup = (): void => {
        sock.removeAllListeners();
      };

      sock.setEncoding('utf8');
      sock.once('error', (err) => {
        if (!helloed) fail(err as Error);
      });

      sock.once('connect', () => {
        this.socket = sock;
        this.connected = true; // transport-up; hello_ack gates full readiness
        // handshake
        sock.write(`${JSON.stringify({ t: 'hello', consumer: 'bot-prime' })}\n`);
      });

      sock.on('data', (chunk: string) => {
        this.buf += chunk;
        let idx: number;
        while ((idx = this.buf.indexOf('\n')) !== -1) {
          const line = this.buf.slice(0, idx);
          this.buf = this.buf.slice(idx + 1);
          if (!line.trim()) continue;
          let obj: { t: string } & Record<string, unknown>;
          try {
            obj = JSON.parse(line) as { t: string } & Record<string, unknown>;
          } catch {
            continue;
          }
          if (obj.t === 'hello_ack') {
            const ok = (obj as { ok?: boolean }).ok === true;
            if (ok) {
              helloed = true;
              this.helloAcked = true;
              this.emit('connected');
              resolve();
            } else {
              this.helloAcked = false;
              this.connected = false;
              fail(new Error((obj as { err?: string }).err ?? 'hello rejected'));
            }
            continue;
          }
          if (obj.t === 'msg') {
            this.emit('message', obj as unknown as GatewayMessageEvent);
            continue;
          }
          if (obj.t === 'status') {
            this.emit('status', obj as unknown as GatewayStatusEvent);
            continue;
          }
          if (obj.t === 'ack') {
            this.emit('ack', obj as unknown as { rid: string; ok: boolean; id?: string; ts?: number; err?: string });
            continue;
          }
          if (obj.t === 'pong') continue;
        }
      });

      sock.on('close', () => {
        const was = this.connected;
        this.connected = false;
        this.socket = null;
        cleanup();
        if (was) this.emit('closed');
        if (this.stopped) return;
        // reconnect with backoff, then keep looping
        void sleep(this.backoffMs).then(() => {
          this.backoffMs = Math.min(this.backoffMs * 2, 2_000);
          void this.connectLoop();
        });
      });
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
