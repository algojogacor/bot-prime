import type { Client } from '@libsql/client';
import { getDailyCalls } from '../ai/usage.js';
import { listMemories } from '../db/repos/memories.js';
import { deleteSticker, listStickers } from '../db/repos/stickers.js';
import type { ShortTermStore } from '../memory/short-term.js';
import { downloadMediaBuffer } from '../whatsapp/media.js';
import type { WhatsAppService } from '../whatsapp/service.js';
import { addStickerFromImage } from '../stickers/manager.js';
import type { CommandRegistry } from './registry.js';

export type BuiltinDeps = {
  db: Client;
  wa: WhatsAppService;
  shortTerm: ShortTermStore;
};

/** Group-facing commands. Sticker/memory management is admin-only. */
export function registerBuiltinCommands(registry: CommandRegistry, deps: BuiltinDeps): void {
  registry.register('ping', {
    run: async ({ reply }) => reply('pong wkwk'),
  });

  registry.register('help', {
    run: async ({ reply }) =>
      reply(
        '!ping, !stats, !sticker add <nama>, !sticker list, !sticker del <nama>, !memory list, !memory del <id>',
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
}
