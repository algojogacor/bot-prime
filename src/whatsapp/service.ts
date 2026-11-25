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
import { isChatAllowed } from '../config/group-filter.js';
import { childLogger } from '../logger.js';
import { insertMessages, DuplicateMessageError } from '../db/repos/messages.js';
import { getMessageById } from '../db/repos/messages.js';
import {
  replaceParticipants,
  upsertGroupMeta,
  getGroupMeta,
  listParticipants,
} from '../db/repos/groups.js';
import { useDbAuthState, clearAuthStore } from '../db/auth-store.js';
import { BurstCollector } from './burst.js';
import { splitIntoBubbles } from './bubbles.js';
import { MessageDeduper } from './dedupe.js';
import { normalizeMessage } from './normalize.js';
import type { NormalizedMessage } from './normalize.js';
import { classifyJidPair, persistJidPair } from './participants.js';
import { OwnershipLease } from './lease.js';
import { GatewayClient } from './gateway-client.js';
import type { GatewayMessageEvent } from './gateway-client.js';

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
    pushName: m.pushName,
  };
}

/**
 * Gateway events carry Baileys' messageTimestamp in SECONDS (the gateway
 * forwards it verbatim); some fallback paths produce milliseconds instead.
 * normalizeMessage multiplies by 1000, so this layer must always pass
 * SECONDS. Observed live as the "1970 timestamps" bug: every inbound message
 * was persisted with a garbage epoch, never surfaced in time-ordered
 * history, and was purged by the daily retention pass as ancient.
 */
function gatewayTsToSeconds(ts: number): number {
  return ts >= 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
}

type GatewayRawKey = {
  remoteJid?: string;
  remoteJidAlt?: string;
  fromMe?: boolean;
  id?: string;
  participant?: string;
  participantAlt?: string;
};

/**
 * Rebuild a WAMessage from a gateway `msg` event. Fidelity matters — the
 * previous adapter rebuilt a bare key and dropped everything else:
 *  - `raw.key` (when present) keeps participantAlt/remoteJidAlt, the PN↔LID
 *    alternates the normalizer needs for sender identity (sender_pn);
 *  - pushName is mapped so history renders names instead of 15-digit LIDs;
 *  - the timestamp unit is normalized (see gatewayTsToSeconds).
 */
export function gatewayEventToWAMessage(ev: GatewayMessageEvent): WAMessage {
  const rawKey = (ev.raw?.key ?? undefined) as GatewayRawKey | undefined;
  const fallbackKey = {
    remoteJid: ev.from,
    fromMe: ev.fromMe,
    id: ev.id,
    participant: ev.isGroup ? ev.sender : undefined,
  };
  const message =
    ev.text !== undefined
      ? ((ev.raw?.message as object | undefined) ?? { conversation: ev.text })
      : (ev.raw?.message as object | undefined);
  const rawPush = (ev.raw as { pushName?: unknown } | undefined)?.pushName;
  const pushName =
    typeof ev.pushName === 'string' && ev.pushName.length > 0
      ? ev.pushName
      : typeof rawPush === 'string' && rawPush.length > 0
        ? rawPush
        : undefined;
  return {
    key: { ...fallbackKey, ...(rawKey ?? {}) },
    message,
    messageTimestamp: gatewayTsToSeconds(ev.ts),
    pushName,
  } as WAMessage;
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
  private gateway: GatewayClient | null = null;
  private reconnectDelayMs = 2_000;
  private pairingRequested = false;
  /**
   * Our own JID as learned from gateway echoes. In gateway mode this.sock is
   * null, so Baileys' user.id is unavailable — without it mention detection
   * (mentionsMe) silently never fired.
   */
  private gatewaySelfJid: string | null = null;
  private readonly deduper = new MessageDeduper();
  private readonly rawRecent = new Map<string, WAMessage[]>();
  private readonly collector: BurstCollector<NormalizedMessage>;
  private readonly lease: OwnershipLease;
  /** Chats already reported as filtered this process (log noise bound). */
  private readonly filterLogged = new Set<string>();

  constructor(private readonly opts: WhatsAppServiceOptions) {
    this.collector = new BurstCollector<NormalizedMessage>(
      opts.burstWindowMs ?? 2_500,
      (chatJid, msgs) => this.opts.onMessages(chatJid, msgs),
    );
    this.lease = new OwnershipLease(opts.db, 'whatsapp-socket');
  }

  isReady(): boolean {
    // Gateway transport: readiness is the gateway's WhatsApp status (sock is
    // always null there — the old `sock !== null` check made /health report
    // 'starting' forever in gateway mode).
    if (this.gateway) return this.status === 'connected';
    return this.status === 'connected' && this.sock !== null;
  }

  async start(): Promise<void> {
    this.stopped = false;
    if (env.WA_TRANSPORT === 'gateway') {
      await this.connectViaGateway();
      return;
    }
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.gateway) {
      this.gateway.stop();
      this.gateway = null;
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
    if (this.gateway) {
      if (this.status !== 'connected') throw new Error('WhatsApp not connected (gateway)');
      const bubbles = splitIntoBubbles(text);
      for (let i = 0; i < bubbles.length; i++) {
        const bubble = bubbles[i] as string;
        const isLast = i === bubbles.length - 1;
        const pause = typingMs ?? Math.min(2_500, 300 + bubble.length * 12);
        const ack = await this.gateway.sendText(jid, bubble, pause > 0 ? pause : undefined);
        const id = ack.id;
        log.info({ jid, length: bubble.length, bubble: i + 1, of: bubbles.length }, 'text sent via gateway');
        if (id) {
          void insertMessages(this.opts.db, [
            {
              id,
              chatJid: jid,
              senderJid: 'me',
              text: bubble,
              msgType: 'text',
              isFromMe: true,
              timestamp: Date.now(),
            },
          ]).catch((err: unknown) => {
            if (!(err instanceof DuplicateMessageError)) {
              log.warn({ err }, 'self-message persist failed');
            }
          });
        }
        if (!isLast) await sleep(400);
      }
      return;
    }
    const sock = this.sock;
    if (!sock || this.status !== 'connected') throw new Error('WhatsApp not connected');
    // Long answers are split at paragraph/sentence boundaries into ordered
    // bubbles — nothing is cut, and the group sees them arrive in order.
    const bubbles = splitIntoBubbles(text);
    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i] as string;
      const isLast = i === bubbles.length - 1;
      const pause = typingMs ?? Math.min(2_500, 300 + bubble.length * 12);
      if (pause > 0) {
        await sock.sendPresenceUpdate('composing', jid);
        await sleep(pause);
      }
      const sent = await sock.sendMessage(jid, { text: bubble });
      log.info({ jid, length: bubble.length, bubble: i + 1, of: bubbles.length }, 'text sent');
      // Persist our own outbound message so reply-to-me detection and the
      // conversation history stay complete (previous gap: only 2/510 rows).
      const id = sent?.key?.id;
      if (id) {
        void insertMessages(this.opts.db, [
          {
            id,
            chatJid: jid,
            senderJid: this.sock?.user?.id ?? 'me',
            text: bubble,
            msgType: 'text',
            isFromMe: true,
            timestamp: Date.now(),
          },
        ]).catch((err: unknown) => {
          // A redelivered echo may race with messages.upsert — duplicates are
          // expected and harmless; anything else is logged, never thrown.
          if (!(err instanceof DuplicateMessageError)) {
            log.warn({ err }, 'self-message persist failed');
          }
        });
      }
      if (!isLast) await sleep(400);
    }
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

  /**
   * Gateway transport (WA_TRANSPORT=gateway): no Baileys here at all. The
   * gateway process owns the single socket + auth; we subscribe over the
   * Unix socket and reuse the EXACT same downstream pipeline (normalize →
   * dedupe → persist → burst) by adapting gateway events into the same
   * shapes the pipeline already consumes.
   */
  private async connectViaGateway(): Promise<void> {
    this.status = 'connecting';
    const gw = new GatewayClient(env.WA_GATEWAY_SOCKET);
    this.gateway = gw;

    gw.on('status', (st) => {
      if (st.wa === 'connected') {
        this.status = 'connected';
        this.reconnectDelayMs = 2_000;
        log.info('gateway says WhatsApp connected');
        void this.bootstrapGroupRoster().catch((err) =>
          log.warn({ err }, 'group roster bootstrap failed'),
        );
      } else if (st.wa === 'logged_out') {
        this.status = 'logged_out';
        log.warn('gateway reports WhatsApp logged out');
      } else {
        this.status = 'reconnecting';
        log.info({ wa: st.wa }, 'gateway reports WhatsApp state');
      }
    });

    gw.on('message', (ev) => {
      // Learn our own JID from any fromMe event: group echoes carry it as
      // `participant`, DM echoes as the chat address. Needed for
      // mentionsMe; see the gatewaySelfJid field note.
      if (ev.fromMe && this.gatewaySelfJid === null) {
        const self = ev.isGroup ? ev.sender : ev.from;
        if (self && !self.endsWith('@broadcast')) {
          this.gatewaySelfJid = self;
          log.info({ selfJid: self }, 'self jid learned from gateway echo');
        }
      }
      // Build a WAMessage-shaped object from the gateway event so the
      // existing normalizer/dedupe/persist path runs unchanged.
      const waMsg = gatewayEventToWAMessage(ev);
      void this.onUpsert({ messages: [waMsg], type: 'notify' } as Upsert);
    });

    gw.start();
    // The gateway client reconnects on its own; mark ourselves 'reconnecting'
    // until the first status event arrives.
    log.info({ path: env.WA_GATEWAY_SOCKET }, 'attaching to wa-gateway');
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
      // Resolve quoted replies from our persisted copy instead of Baileys'
      // in-memory store (README: avoid in-memory stores on small VMs).
      getMessage: async (key) => {
        if (!key.remoteJid || !key.id) return undefined;
        const stored = await getMessageById(this.opts.db, key.remoteJid, key.id).catch(
          () => null,
        );
        if (!stored?.text) return undefined;
        return { conversation: stored.text };
      },
      // Group metadata served from our DB snapshot; falls back to a network
      // fetch when unknown, so Baileys needn't keep its own growing cache.
      cachedGroupMetadata: async (jid) => {
        const meta = await getGroupMeta(this.opts.db, jid).catch(() => null);
        if (!meta) return undefined;
        const participants = await listParticipants(this.opts.db, jid).catch(() => []);
        return {
          id: jid,
          subject: meta.name ?? '',
          desc: meta.description,
          owner: undefined,
          participants: participants.map((p) => ({ id: p.jid, admin: p.role as 'admin' | undefined })),
        };
      },
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
    // The group NAME lives in group_meta — without it the AI prompt has no
    // chat context (observed live: participants bootstrapped but group_meta
    // stayed empty because only 'groups.update' events ever wrote names).
    await upsertGroupMeta(this.opts.db, {
      groupJid,
      name: meta.subject ?? undefined,
      description: meta.desc ?? undefined,
      announce: meta.announce,
    }).catch((err) => log.warn({ err, group: groupJid }, 'group meta upsert failed'));
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

  /**
   * On (re)connect, refresh group metadata for every group we have messages
   * from. Bounded to the distinct chat jids already persisted, sequential to
   * stay gentle on the 1GB VM, and fail-soft per group.
   */
  private async bootstrapGroupRoster(): Promise<void> {
    const sock = this.sock;
    if (!sock) return;
    const res = await this.opts.db.execute(
      "SELECT DISTINCT chat_jid FROM messages WHERE chat_jid LIKE '%@g.us' LIMIT 50",
    );
    const groupJids = res.rows.map((r) => String(r.chat_jid));
    for (const gid of groupJids) {
      try {
        await this.refreshParticipants(gid);
      } catch (err) {
        log.warn({ err, group: gid }, 'roster bootstrap: group metadata fetch failed');
      }
    }
    if (groupJids.length > 0) {
      log.info({ groups: groupJids.length }, 'group roster bootstrapped');
    }
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
      // Bootstrap the roster for every group we know from persisted messages:
      // 'group-participants.update' only fires on join/leave, so a fresh
      // process would otherwise never populate group_meta / participants
      // (observed live: both tables stayed empty after pairing until a
      // member joined/left). Group names drive the AI prompt's chat context
      // and admin checks rely on participant data.
      void this.bootstrapGroupRoster().catch((err) =>
        log.warn({ err }, 'group roster bootstrap failed'),
      );
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
    const selfJid = this.sock?.user?.id ?? this.gatewaySelfJid ?? undefined;
    const batch: NormalizedMessage[] = [];
    for (const waMsg of upsert.messages as WAMessage[]) {
      const norm = normalizeMessage(waMsg);
      if (!norm || norm.type === 'protocolMessage') continue;
      // Allow-list gate — the FIRST check in the pipeline: groups not on
      // OMAK_ALLOWED_GROUP_JIDS are dropped before dedupe, persistence,
      // burst collection, commands or ANY AI/provider call. DMs and other
      // non-group chats always pass (personal usage keeps working).
      if (!isChatAllowed(norm.chatJid)) {
        if (!this.filterLogged.has(norm.chatJid)) {
          this.filterLogged.add(norm.chatJid);
          log.info(
            { chatJid: norm.chatJid },
            'group not on allow-list; dropping all messages from this chat',
          );
        }
        continue;
      }
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
      // Durable dedupe: a redelivered message whose id is already in the DB
      // (e.g. after LRU eviction or a process restart) must not be processed
      // twice — the unique (id) constraint is the source of truth.
      if (err instanceof DuplicateMessageError) {
        log.info(
          { chatJid: batch[0]?.chatJid, inserted: err.inserted, attempted: err.attempted },
          'duplicate delivery suppressed',
        );
        return;
      }
      // A genuine persistence failure is NOT safe to swallow: persisting first
      // means a crash before processing still leaves the ids in place, so
      // redelivery is suppressed after restart. Dropping the batch here only
      // risks losing one burst, never double-replying.
      log.error({ err }, 'message persistence failed');
      return;
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
