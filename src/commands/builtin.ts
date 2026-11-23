import type { Client } from '@libsql/client';
import { env } from '../config/env.js';
import { getDailyCalls } from '../ai/usage.js';
import { listMemories } from '../db/repos/memories.js';
import { deleteSticker, listStickers } from '../db/repos/stickers.js';
import { getGroupSettings, setGroupMode, setGroupPaused } from '../db/repos/settings.js';
import type { GroupMode } from '../db/repos/settings.js';
import type { ShortTermStore } from '../memory/short-term.js';
import { buildMemoryContext } from '../memory/retrieval.js';
import { buildSystemPrompt } from '../ai/prompt-builder.js';
import { validateReply } from '../ai/validator.js';
import { hasUnverifiableClaim } from '../social/personality.js';
import { ROAST_GUIDELINES } from '../social/roast.js';
import type { AIRouter } from '../ai/router.js';
import type { CommunityKnowledge } from '../community/knowledge.js';
import { downloadMediaBuffer } from '../whatsapp/media.js';
import type { WhatsAppService } from '../whatsapp/service.js';
import { addStickerFromImage } from '../stickers/manager.js';
import type { CommandRegistry } from './registry.js';

export type BuiltinDeps = {
  db: Client;
  wa: WhatsAppService;
  shortTerm: ShortTermStore;
  /** null = AI disabled; !ai then answers from grounded local facts only. */
  router: AIRouter | null;
  /** Static community dataset retrieval; null when seeds are unavailable. */
  knowledge: CommunityKnowledge | null;
};

/** Group-facing commands. Sticker/memory management is admin-only. */
export function registerBuiltinCommands(registry: CommandRegistry, deps: BuiltinDeps): void {
  registry.register('ping', {
    run: async ({ reply }) => reply('pong wkwk'),
  });

  registry.register('help', {
    run: async ({ reply }) =>
      reply(
        '!ping, !stats, !ai <tanya>, !ai lore [topik], !ai status, !ai ejek <nama>, ' +
          '!sticker add/list/del, !memory list/del, !prime mode|pause|resume|config (admin)',
      ),
  });

  registry.register('stats', {
    run: async ({ reply }) => {
      const calls = await getDailyCalls(deps.db).catch(() => 0);
      const stickers = await listStickers(deps.db, 500).catch(() => []);
      const uptimeMin = Math.floor(process.uptime() / 60);
      await reply(`uptime ${uptimeMin}m, ai hari ini ${calls}x, sticker ${stickers.length} 🗿`);
    },
  });

  registry.register('sticker', {
    adminOnly: true,
    run: async ({ args, recentRaw, reply, senderJid }) => {
      const sub = args[0]?.toLowerCase();
      if (sub === 'add') {
        const name = args[1]?.toLowerCase().replace(/\s+/g, '-');
        if (!name) {
          await reply('format: !sticker add <nama> (reply gambarnya dulu)');
          return;
        }
        const raw = recentRaw()
          .slice()
          .reverse()
          .find((m) => m.message && (m.message.imageMessage || m.message.stickerMessage));
        if (!raw) {
          await reply('ga ada gambar/sticker baru di chat ini wkwk');
          return;
        }
        const buffer = await downloadMediaBuffer(raw);
        if (!buffer) {
          await reply('gagal download medianya wkwk');
          return;
        }
        const added = await addStickerFromImage(deps.db, {
          image: buffer,
          name,
          addedBy: senderJid,
        });
        await reply(`sticker ${added.name} masuk wkwk (${added.size}b)`);
      } else if (sub === 'list') {
        const list = await listStickers(deps.db, 50);
        await reply(list.length > 0 ? list.map((s) => s.name).join(', ') : 'masih kosong 🗿');
      } else if (sub === 'del') {
        const removed = await deleteSticker(deps.db, args[1] ?? '');
        await reply(removed ? 'udah gue buang wkwk' : 'ga ketemu 🗿');
      } else {
        await reply('format: !sticker add|list|del');
      }
    },
  });

  registry.register('memory', {
    adminOnly: true,
    run: async ({ chatJid, args, reply }) => {
      if (args[0] === 'del') {
        const id = Number(args[1]);
        if (!Number.isInteger(id)) {
          await reply('format: !memory del <id>');
          return;
        }
        const { deleteMemory } = await import('../db/repos/memories.js');
        const removed = await deleteMemory(deps.db, id);
        await reply(removed ? 'memori dihapus wkwk' : 'ga ada itu 🗿');
        return;
      }
      const list = await listMemories(deps.db, chatJid, 15);
      await reply(
        list.length > 0
          ? list.map((m) => `#${m.id} [${m.kind}] ${m.content}`).join('\n')
          : 'masih kosong 🗿',
      );
    },
  });

  // !ai <tanya> | !ai lore [topik] | !ai status | !ai ejek <nama> | !ai help
  registry.register('ai', {
    run: async ({ args, chatJid, senderName, reply }) => {
      const sub = args[0]?.toLowerCase();
      const rest = args.slice(1).join(' ').trim();

      if (!sub || sub === 'help') {
        await reply(
          '!ai <pertanyaan> (tanya apa aja)\n!ai lore [topik] (cerita lore grup)\n!ai status (info dataset)\n!ai ejek <nama> (roast pendek, grounded)',
        );
        return;
      }

      if (sub === 'status') {
        const calls = await getDailyCalls(deps.db).catch(() => 0);
        await reply(`${deps.knowledge?.digest() ?? 'arsip komunitas ga aktif 🗿'} | ai hari ini ${calls}x`);
        return;
      }

      if (sub === 'lore') {
        if (!deps.knowledge) {
          await reply('arsip komunitas ga kebaca 🗿');
          return;
        }
        if (!rest) {
          const titles = deps.knowledge.loreTitles();
          await reply(
            titles.length > 0
              ? `lore yg ada:\n${titles.map((t) => `- ${t.title}`).join('\n')}\n\n!ai lore <topik> buat cerita`
              : 'lore masih kosong 🗿',
          );
          return;
        }
        const entries = deps.knowledge.loreFor(rest, 2);
        if (entries.length === 0) {
          await reply('ga nemu lore itu 🗿 coba topik lain');
          return;
        }
        const lines: string[] = [];
        for (const entry of entries) {
          lines.push(`*${entry.title}*`, entry.summary);
          for (const c of entry.citations.slice(0, 2)) {
            lines.push(`> [${c.id} ${c.alias ?? ''}] ${c.text ?? c.note}`);
          }
        }
        await reply(lines.join('\n').slice(0, 1_500));
        return;
      }

      if (sub === 'ejek') {
        const target = rest.split(/\s+/)[0] ?? '';
        if (!target) {
          await reply('format: !ai ejek <nama>');
          return;
        }
        const info = deps.knowledge?.findParticipant(target) ?? null;
        if (!deps.router) {
          // Grounded local fallback: only observable dataset facts, no invention.
          await reply(
            info
              ? `${info.aliases[0]}: ${info.messages} pesan, ${info.activeDays} hari aktif — rajin bener wkwk 🗿`
              : 'ga kenal siapa itu, cek nama dulu wkwk',
          );
          return;
        }
        if (!info) {
          await reply(`ga ada "${target}" di profil grup, cek ejaan nama wkwk`);
          return;
        }
        const facts =
          `Fakta dataset: ${info.aliases[0]} — ${info.messages} pesan, aktif ${info.activeDays} hari` +
          (info.firstSeen && info.lastSeen ? `, ${info.firstSeen.slice(0, 10)} s/d ${info.lastSeen.slice(0, 10)}` : '') +
          '. Roast SINGKAT (1-2 kalimat), huruf kecil, HANYA dari fakta itu, tanpa SARA, tanpa mengarang kejadian.';
        try {
          const result = await deps.router.generate({
            system:
              buildSystemPrompt({
                isGroup: true,
                recentMessages: [],
                incoming: [{ sender: senderName, text: `!ai ejek ${target}` }],
              }) +
              `\n\n## Roast rules\n${ROAST_GUIDELINES}\n\n## Fakta\n${facts}`,
            messages: [{ role: 'user', content: `ejek ${info.aliases[0]} wkwk` }],
            maxTokens: env.AI_MAX_OUTPUT_TOKENS,
            temperature: 1,
          });
          const validation = validateReply(result.text);
          await reply(
            validation.ok
              ? validation.text.slice(0, 400)
              : `${info.aliases[0]} ${info.messages} pesan wkwk keras banget 🗿`,
          );
        } catch {
          await reply('ai lagi macet, coba lagi nnti 🗿');
        }
        return;
      }

      // Default: !ai <question> — persona reply with live + archive context.
      if (!deps.router) {
        await reply('ai lagi off 🗿');
        return;
      }
      if (!rest) {
        await reply('tanya apa? format: !ai <pertanyaan>');
        return;
      }
      try {
        const communityBlock = (() => {
          try {
            return deps.knowledge?.buildContext(rest).block ?? null;
          } catch {
            return null;
          }
        })();
        const memoryBlock = await buildMemoryContext(deps.db, chatJid, rest);
        const result = await deps.router.generate({
          system:
            buildSystemPrompt({
              isGroup: true,
              recentMessages: [],
              incoming: [{ sender: senderName, text: rest }],
              webResults: memoryBlock ? `Fakta grup terkait:\n${memoryBlock}` : undefined,
              community: communityBlock ?? undefined,
            }) + `\n\n## Roast rules\n${ROAST_GUIDELINES}`,
          messages: [{ role: 'user', content: rest }],
          maxTokens: Math.min(800, env.AI_MAX_OUTPUT_TOKENS * 2),
          temperature: 1,
        });
        const validation = validateReply(result.text);
        await reply(validation.ok ? validation.text : 'hm, ga bisa gw jawab sekarang 🗿');
      } catch {
        await reply('ai lagi macet, coba lagi nnti 🗿');
      }
    },
  });

  // !prime mode|pause|resume|config — admin-only, persisted per group.
  registry.register('prime', {
    adminOnly: true,
    run: async ({ chatJid, args, reply }) => {
      const sub = args[0]?.toLowerCase();
      if (sub === 'mode') {
        const mode = args[1]?.toLowerCase() as GroupMode | undefined;
        if (mode !== 'passive' && mode !== 'balanced' && mode !== 'active') {
          await reply('format: !prime mode passive|balanced|active');
          return;
        }
        await setGroupMode(deps.db, chatJid, mode);
        await reply(`mode: ${mode} (berlaku dalam 30 detik) wkwk`);
        return;
      }
      if (sub === 'pause') {
        await setGroupPaused(deps.db, chatJid, true);
        await reply('bot pause dulu. !prime resume buat balikin 🗿');
        return;
      }
      if (sub === 'resume') {
        await setGroupPaused(deps.db, chatJid, false);
        await reply('gas balik lag wkwk');
        return;
      }
      if (sub === 'config') {
        const settings = await getGroupSettings(deps.db, chatJid).catch(() => null);
        const ks = deps.knowledge?.status;
        await reply(
          `mode: ${settings?.mode ?? 'balanced'}, paused: ${settings?.paused ?? false}, ` +
            `ai/days: ${env.OMAK_MAX_DAILY_AI_CALLS}, starters/days: ${env.OMAK_MAX_STARTERS_PER_DAY}, ` +
            `arsip: ${ks?.available ? ks.indexKind : 'off'}`,
        );
        return;
      }
      await reply('format: !prime mode|pause|resume|config');
    },
  });
}
