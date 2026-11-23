import { sleep } from '../util/sleep.js';
import type { Client } from '@libsql/client';
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
} from '@whiskeysockets/baileys';
import type { MessageUpsertType, WAMessage } from '@whiskeysockets/baileys';
import { env } from '../config/env.js';
import { childLogger } from '../logger.js';
import { insertMessages } from '../db/repos/messages.js';
import { replaceParticipants, upsertGroupMeta } from '../db/repos/groups.js';
import { useDbAuthState, clearAuthStore } from '../db/auth-store.js';
import { BurstCollector } from './burst.js';
import { MessageDeduper } from './dedupe.js';
import { normalizeMessage } from './normalize.js';
import type { NormalizedMessage } from './normalize.js';
import { classifyJidPair, persistJidPair } from './participants.js';
import { OwnershipLease } from './lease.js';

const log = childLogger({ mod: 'whatsapp' });
const baileysLog = childLogger({ mod: 'baileys' });

type Socket = ReturnType<typeof makeWASocket>;

type Upsert = { messages: WAMessage[]; type: MessageUpsertType };

type ConnUpdate = {
  connection?: 'connecting' | 'open' | 'close';
  lastDisconnect?: { error?: unknown };
  qr?: string;
};

export type WhatsAppStatus =
  | 'starting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'logged_out'
  | 'stopped';

export type WhatsAppServiceOptions = {
  db: Client;
  /** Called once per burst (chat + window) with the normalized messages to process. */
  onMessages: (chatJid: string, msgs: NormalizedMessage[]) => void | Promise<void>;
  /** Burst collection window per chat (ms). */
  burstWindowMs?: number;
};

function toStored(m: NormalizedMessage) {
  return {
    id: m.id,
    chatJid: m.chatJid,
    senderJid: m.senderJid,
    senderPn: m.senderJidAlt,
    text: m.text ?? undefined,
    msgType: m.type,
    isFromMe: m.isFromMe,
    timestamp: m.timestamp,
  };
}

/** Persist PN↔LID pairs the moment we observe them; Baileys cannot reverse-resolve later. */
async function persistMessageJidPair(db: Client, m: NormalizedMessage): Promise<void> {
  const pair = classifyJidPair(m.senderJid, m.senderJidAlt ?? m.chatJidAlt);
  await persistJidPair(db, pair);
}

/**
 * Owns the Baileys socket lifecycle: DB-backed auth, reconnect with backoff,
 * pairing (QR + optional pairing code), dedupe, burst collection and persistence.
 */
export class WhatsAppService {
  status: WhatsAppStatus = 'starting';
  private sock: Socket | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs = 2_000;
  private pairingRequested = false;
  private readonly deduper = new MessageDeduper();
  private readonly rawRecent = new Map<string, WAMessage[]>();
  private readonly collector: BurstCollector<NormalizedMessage>;
  private readonly lease: OwnershipLease;

  constructor(private readonly opts: WhatsAppServiceOptions) {
    this.collector = new BurstCollector<NormalizedMessage>(
      opts.burstWindowMs ?? 2_500,
      (chatJid, msgs) => this.opts.onMessages(chatJid, msgs),
    );
    this.lease = new OwnershipLease(opts.db, 'whatsapp-socket');
  }

  isReady(): boolean {
    return this.status === 'connected' && this.sock !== null;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const sock = this.sock;
    this.sock = null;
    this.status = 'stopped';
    if (sock) {
      try {
        sock.end(new Error('shutdown'));
      } catch {
        // socket already dead — nothing to do
      }
    }
    await this.collector.stop();
    await this.lease.release().catch(() => undefined);
  }

  /** Send a text message with a human-like typing pause. */
  async sendText(jid: string, text: string, typingMs?: number): Promise<void> {
    const sock = this.sock;
    if (!sock || this.status !== 'connected') throw new Error('WhatsApp not connected');
    const pause = typingMs ?? Math.min(2_500, 300 + text.length * 25);
    if (pause > 0) {
      await sock.sendPresenceUpdate('composing', jid);
      await sleep(pause);
    }
    await sock.sendMessage(jid, { text });
    log.info({ jid, length: text.length }, 'text sent');
  }

  /** Send a sticker (WEBP bytes). */
  async sendSticker(jid: string, sticker: Buffer): Promise<void> {
    const sock = this.sock;
    if (!sock || this.status !== 'connected') throw new Error('WhatsApp not connected');
    await sock.sendMessage(jid, { sticker });
    log.info({ jid, size: sticker.length }, 'sticker sent');
  }

  /** Last raw messages per chat — used by admin commands (sticker intake). */
  recentRaw(chatJid: string, n = 10): WAMessage[] {
    return (this.rawRecent.get(chatJid) ?? []).slice(-n);
  }

  private async connect(): Promise<void> {
    this.status = 'connecting';
    // Fencing: a Koyeb deploy overlap must not produce two live sockets.
    const acquired = await this.lease.acquire();
    if (!acquired) {
      this.status = 'stopped';
      throw new Error('another instance holds the WhatsApp socket lease');
    }
    const { state, saveCreds } = await useDbAuthState(this.opts.db, env.AUTH_ENCRYPTION_KEY);

    // fetchLatestBaileysVersion hits the network; fall back to the bundled version offline.
    let version: [number, number, number] | undefined;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch (err) {
      log.warn({ err }, 'could not fetch latest WhatsApp version; using bundled');
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: baileysLog,
      browser: Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => this.onConnectionUpdate(u as ConnUpdate));
    sock.ev.on('messages.upsert', (u) => void this.onUpsert(u as Upsert));
    sock.ev.on('groups.update', (updates) => {
      for (const g of updates) {
        if (!g.id) continue;
        void upsertGroupMeta(this.opts.db, {
          groupJid: g.id,
          name: g.subject ?? undefined,
          description: g.desc ?? undefined,
          announce: g.announce,
        }).catch((err) => log.warn({ err }, 'group meta upsert failed'));
      }
    });
    sock.ev.on('group-participants.update', (u) => {
      void this.refreshParticipants(u.id).catch((err) =>
        log.warn({ err, group: u.id }, 'participant refresh failed'),
      );
    });
  }

  /** Pull fresh metadata and snapshot participants into the DB. */
  async refreshParticipants(groupJid: string): Promise<void> {
    const sock = this.sock;
    if (!sock) return;
    const meta = await sock.groupMetadata(groupJid);
    await replaceParticipants(
      this.opts.db,
      groupJid,
      meta.participants.map((p) => ({
        jid: p.id,
        pn: p.phoneNumber ?? p.id,
        role: p.admin ?? undefined,
      })),
    );
  }

  private onConnectionUpdate(u: ConnUpdate): void {
    if (u.qr && this.status !== 'connected') {
      log.info('QR received — scan it, or set OMAK_PAIRING_NUMBER for a pairing code');
      const pairingNumber = env.OMAK_PAIRING_NUMBER;
      if (pairingNumber && !this.pairingRequested) {
        this.pairingRequested = true;
        void this.sock
          ?.requestPairingCode(pairingNumber)
          .then((code) => log.info({ pairingCode: code }, 'pairing code issued'))
          .catch((err) => log.error({ err }, 'pairing code request failed'));
      }
    }

    if (u.connection === 'open') {
      this.status = 'connected';
      this.reconnectDelayMs = 2_000;
      log.info({ user: this.sock?.user?.id }, 'WhatsApp connected');
    } else if (u.connection === 'close') {
      const code = (
        u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
      )?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        this.status = 'logged_out';
        log.warn('logged out by WhatsApp; clearing stored auth so next start can re-pair');
        void clearAuthStore(this.opts.db).catch((err) =>
          log.error({ err }, 'failed to clear auth store'),
        );
        return;
      }
      if (this.stopped) return;
      this.status = 'reconnecting';
      log.warn({ code }, 'connection closed; reconnecting with backoff');
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.stopped) void this.connect();
      }, this.reconnectDelayMs);
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 60_000);
    }
  }

  private async onUpsert(upsert: Upsert): Promise<void> {
    // 'append' = offline/reconnect replay of older messages. Processing those
    // would make the bot react to stale conversations after every redeploy.
    if (upsert.type === 'append') {
      return;
    }
    const selfJid = this.sock?.user?.id;
    const batch: NormalizedMessage[] = [];
    for (const waMsg of upsert.messages as WAMessage[]) {
      const norm = normalizeMessage(waMsg);
      if (!norm || norm.type === 'protocolMessage') continue;
      if (this.deduper.check(norm.id)) continue;
      if (selfJid && norm.mentionedJids?.length) {
        norm.mentionsMe = norm.mentionedJids.some((j) => sameJidUser(j, selfJid));
      }
      this.storeRaw(norm.chatJid, waMsg);
      batch.push(norm);
    }
    if (batch.length === 0) return;

    try {
      await insertMessages(
        this.opts.db,
        batch.map(toStored),
      );
    } catch (err) {
      log.error({ err }, 'message persistence failed');
    }
    for (const m of batch) {
      await persistMessageJidPair(this.opts.db, m).catch((err) =>
        log.warn({ err }, 'lid mapping persist failed'),
      );
    }
    for (const m of batch) {
      this.collector.push(m.chatJid, m);
    }
  }

  private storeRaw(chatJid: string, msg: WAMessage): void {
    const ring = this.rawRecent.get(chatJid) ?? [];
    ring.push(msg);
    if (ring.length > 10) ring.splice(0, ring.length - 10);
    this.rawRecent.set(chatJid, ring);
  }
}

/**
 * Loose JID identity match for mention detection: compares digit bodies,
 * tolerating device suffixes (`:12`) and PN↔LID alternates via their last
 * 9 digits (same convention as the admin matcher).
 */
export function sameJidUser(a: string, b: string): boolean {
  const clean = (j: string) => (j.split(':')[0] ?? '').replace(/\D/g, '');
  const da = clean(a);
  const dbb = clean(b);
  if (da.length === 0 || dbb.length === 0) return false;
  if (da === dbb) return true;
  return da.length >= 9 && dbb.length >= 9 && da.slice(-9) === dbb.slice(-9);
}
