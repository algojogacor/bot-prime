import type { Client } from '@libsql/client';
import { env, parseList } from '../config/env.js';
import { childLogger } from '../logger.js';
import type { AIRouter } from '../ai/router.js';
import { buildSystemPrompt } from '../ai/prompt-builder.js';
import { validateReply } from '../ai/validator.js';
import { getDailyCalls } from '../ai/usage.js';
import type { ShortTermStore } from '../memory/short-term.js';
import { heuristicExtract } from '../memory/extractor.js';
import { addMemory } from '../db/repos/memories.js';
import { buildMemoryContext } from '../memory/retrieval.js';
import { getGroupMeta } from '../db/repos/groups.js';
import { getGroupSettings } from '../db/repos/settings.js';
import type { GroupSettings } from '../db/repos/settings.js';
import { getMessageById } from '../db/repos/messages.js';
import { shouldReply } from './participation.js';
import type { ChatReplyState } from './participation.js';
import { analyzeBurst } from './context-analyzer.js';
import { RageBaitLimiter, isRageBaitRequest, RAGE_BAIT_DEFLECTIONS } from './rage-bait.js';
import { localRoast, ROAST_GUIDELINES } from './roast.js';
import { hasUnverifiableClaim, TRUTH_FALLBACK } from './personality.js';
import type { CommunityKnowledge } from '../community/knowledge.js';
import type { NormalizedMessage } from '../whatsapp/normalize.js';
import type { WAMessage } from '@whiskeysockets/baileys';
import type { CommandRegistry } from '../commands/registry.js';

const log = childLogger({ mod: 'social' });

export type Sender = { sendText(jid: string, text: string): Promise<void> };

export type OrchestratorDeps = {
  db: Client;
  /** null = AI disabled; the bot then only uses grounded local responses. */
  router: AIRouter | null;
  sender: Sender;
  shortTerm: ShortTermStore;
  /** Cheap, non-AI sticker match by text; returns a sticker name or null. */
  matchSticker?: (text: string) => Promise<string | null>;
  sendStickerByName?: (chatJid: string, name: string) => Promise<void>;
  /** Group commands (handled before any participation logic). */
  commands?: CommandRegistry;
  getRecentRaw?: (chatJid: string, n?: number) => WAMessage[];
  /** Static community-dataset retrieval (data/seed), optional and fail-soft. */
  community?: CommunityKnowledge | null;
};

function displayName(m: NormalizedMessage): string {
  if (m.pushName) return m.pushName;
  return m.senderJid.split('@')[0] ?? m.senderJid;
}

/**
 * The reaction pipeline for one chat burst:
 * context + memory → participation decision → rage-bait guard → sticker hook
 * → AI reply (persona prompt, validator, truth boundary) → sender.
 * When anything upstream fails the bot simply stays quiet — a bot that
 * always answers is the loudest person in the room.
 */
export class SocialOrchestrator {
  private readonly replyStates = new Map<string, ChatReplyState & { replyTimes: number[] }>();
  private readonly rageBait = new RageBaitLimiter();
  private readonly mentionTokens: string[];
  /** Short TTL cache so bursts don't hit the settings table every time. */
  private readonly settingsCache = new Map<string, { settings: GroupSettings; at: number }>();

  constructor(private readonly deps: OrchestratorDeps) {
    this.mentionTokens = parseList(env.OMAK_MENTION_TOKENS);
  }

  private async settingsFor(chatJid: string): Promise<GroupSettings> {
    const cached = this.settingsCache.get(chatJid);
    if (cached && Date.now() - cached.at < 30_000) return cached.settings;
    const settings = await getGroupSettings(this.deps.db, chatJid).catch(() => {
      return { groupJid: chatJid, mode: 'balanced' as const, paused: false };
    });
    this.settingsCache.set(chatJid, { settings, at: Date.now() });
    return settings;
  }

  async handleBurst(chatJid: string, burst: NormalizedMessage[]): Promise<void> {
    const humanMessages = burst.filter((m) => !m.isFromMe);
    const last = humanMessages[humanMessages.length - 1];
    if (!last) return;

    // Context: short-term store + durable memory extraction (heuristic only,
    // always grounded in verbatim chat content).
    for (const m of humanMessages) {
      this.deps.shortTerm.push(chatJid, {
        sender: displayName(m),
        text: m.text ?? '',
        timestamp: m.timestamp,
      });
    }
    await this.extractMemories(chatJid, humanMessages);

    const lastText = last.text ?? '';
    if (!lastText) return;

    // Commands bypass every social gate (admins must always reach the bot).
    if (lastText.startsWith('!') && this.deps.commands) {
      await this.deps.commands.handle(lastText, {
        chatJid,
        senderJid: last.senderJid,
        senderName: displayName(last),
        isAdmin: this.isSenderAdmin(last),
        recentRaw: () => this.deps.getRecentRaw?.(chatJid, 10) ?? [],
        reply: (text) => this.deps.sender.sendText(chatJid, text),
      });
      return;
    }

    // Pause: autonomous participation is off, commands still work (handled above).
    const settings = await this.settingsFor(chatJid);
    if (settings.paused) {
      log.debug({ chatJid }, 'paused; skipping autonomous participation');
      return;
    }

    // Rage-bait: register escalating demands before anything else.
    if (isRageBaitRequest(lastText)) {
      const allowed = this.rageBait.registerAttempt(last.senderJid, Date.now());
      if (!allowed) {
        await this.send(chatJid, RAGE_BAIT_DEFLECTIONS[0] ?? 'gapapa 🗿');
        return;
      }
    }

    // Stickers: cheap non-AI path first.
    if (this.deps.matchSticker && this.deps.sendStickerByName) {
      const stickerName = await this.deps.matchSticker(lastText).catch(() => null);
      if (stickerName) {
        log.info({ chatJid, stickerName }, 'sticker reaction');
        await this.deps.sendStickerByName(chatJid, stickerName);
        this.noteReply(chatJid);
        return;
      }
    }

    // Participation decision.
    const state = this.replyState(chatJid);
    const now = Date.now();
    const dailyAiUsed = await getDailyCalls(this.deps.db).catch(() => 0);
    // Reply-to-me: quoted reply to one of our messages, or an @-mention by JID
    // (set by the service from contextInfo.mentionedJid).
    const quotedReplyToMe =
      last.mentionsMe === true ||
      (last.quotedId
        ? (await getMessageById(this.deps.db, chatJid, last.quotedId).catch(() => null))?.isFromMe ===
          true
        : false);
    const decision = shouldReply({
      burst: humanMessages.map((m) => ({
        sender: m.senderJid,
        text: m.text ?? '',
        isFromMe: m.isFromMe,
      })),
      state,
      config: {
        mentionTokens: this.mentionTokens,
        maxRepliesPerHourPerChat: env.OMAK_MAX_REPLIES_PER_HOUR,
        minGapMs: env.OMAK_MIN_REPLY_GAP_MS,
        ambientReplyRate: env.OMAK_AMBIENT_REPLY_RATE,
        dailyAiQuota: env.OMAK_MAX_DAILY_AI_CALLS,
        dailyAiUsed,
        mode: settings.mode,
        replyToMe: quotedReplyToMe,
      },
      now,
    });
    if (decision.act === 'ignore') {
      log.debug({ chatJid, reason: decision.reason }, 'staying quiet');
      return;
    }
    log.info({ chatJid, reason: decision.reason }, 'joining in');

    // Grounded local roast when AI is unavailable but facts exist.
    const context = analyzeBurst(humanMessages.map((m) => ({ sender: displayName(m), text: m.text ?? '' })));
    if (!this.deps.router) {
      const roast = localRoast({
        senderName: displayName(last),
        context,
        senderIdleMinutes: this.deps.shortTerm.minutesSinceLastMessage(chatJid) ?? undefined,
        lastSenderText: lastText,
      });
      if (roast) await this.send(chatJid, roast);
      return;
    }

    // AI reply.
    const recent = this.deps.shortTerm.recent(chatJid, 20);
    const memoryBlock = await buildMemoryContext(this.deps.db, chatJid, lastText);
    const communityBlock = (() => {
      try {
        return this.deps.community?.buildContext(lastText).block ?? null;
      } catch {
        return null;
      }
    })();
    const chatName = (await getGroupMeta(this.deps.db, chatJid).catch(() => null))?.name;
    const system =
      buildSystemPrompt({
        chatName,
        isGroup: last.isGroup,
        recentMessages: recent.slice(0, Math.max(0, recent.length - burst.length)),
        incoming: humanMessages.map((m) => ({ sender: displayName(m), text: m.text ?? '' })),
        webResults: memoryBlock ? `Fakta grup terkait:\n${memoryBlock}` : undefined,
        community: communityBlock ?? undefined,
      }) + `\n\n## Roast rules\n${ROAST_GUIDELINES}`;

    try {
      const result = await this.deps.router.generate({
        system,
        messages: [{ role: 'user', content: lastText }],
        maxTokens: env.AI_MAX_OUTPUT_TOKENS,
        temperature: 1,
      });
      const validation = validateReply(result.text);
      if (!validation.ok) {
        log.info({ reason: validation.reason }, 'reply rejected by validator');
        return;
      }
      const contextText = recent.map((m) => `${m.sender}: ${m.text}`).join('\n');
      const reply = hasUnverifiableClaim(validation.text, contextText)
        ? TRUTH_FALLBACK
        : validation.text;
      await this.send(chatJid, reply);
    } catch (err) {
      log.warn({ err }, 'AI reply failed; staying quiet');
    }
  }

  private async extractMemories(chatJid: string, burst: NormalizedMessage[]): Promise<void> {
    const extracted = heuristicExtract(
      burst
        .map((m) => ({ id: m.id, text: m.text ?? '' }))
        .filter((m) => m.text.length > 0),
    );
    for (const m of extracted) {
      await addMemory(this.deps.db, {
        chatJid,
        kind: m.kind,
        content: m.content,
        importance: m.importance,
        sourceMsgId: m.sourceMsgId,
      }).catch((err) => log.warn({ err }, 'memory write failed'));
    }
  }

  private replyState(chatJid: string): ChatReplyState & { replyTimes: number[] } {
    const now = Date.now();
    let state = this.replyStates.get(chatJid);
    if (!state) {
      state = { lastReplyAtMs: null, repliesLastHour: 0, replyTimes: [] };
      this.replyStates.set(chatJid, state);
    }
    state.replyTimes = state.replyTimes.filter((t) => now - t < 3_600_000);
    state.repliesLastHour = state.replyTimes.length;
    return state;
  }

  private noteReply(chatJid: string): void {
    const state = this.replyState(chatJid);
    state.lastReplyAtMs = Date.now();
    state.replyTimes.push(state.lastReplyAtMs);
  }

  private async send(chatJid: string, text: string): Promise<void> {
    await this.deps.sender.sendText(chatJid, text);
    this.noteReply(chatJid);
  }

  /**
   * Admin match by exact JID or by the last 9 digits of the phone number
   * (admins may be configured with either the PN or the LID form).
   */
  private isSenderAdmin(m: NormalizedMessage): boolean {
    const admins = parseList(env.OMAK_ADMIN_JIDS);
    if (admins.length === 0) return false;
    const senderForms = [m.senderJid, m.senderJidAlt ?? ''];
    const senderDigits = senderForms.map((j) => j.replace(/\D/g, ''));
    return admins.some((admin) => {
      const adminDigits = admin.replace(/\D/g, '');
      return (
        senderForms.includes(admin) ||
        (adminDigits.length >= 8 &&
          senderDigits.some((d) => d.endsWith(adminDigits.slice(-9))))
      );
    });
  }
}
