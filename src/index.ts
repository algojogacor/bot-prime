import { env } from './config/env.js';
import { childLogger } from './logger.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { AIRouter } from './ai/router.js';
import { buildProviders } from './ai/factory.js';
import { recordUsage } from './ai/usage.js';
import { ShortTermStore } from './memory/short-term.js';
import { WhatsAppService } from './whatsapp/service.js';
import type { NormalizedMessage } from './whatsapp/normalize.js';
import { SocialOrchestrator } from './social/orchestrator.js';
import { CommandRegistry } from './commands/registry.js';
import { registerBuiltinCommands } from './commands/builtin.js';
import { CommunityKnowledge } from './community/knowledge.js';
import { matchStickerByText } from './db/repos/stickers.js';
import { loadStickerBytes } from './stickers/manager.js';
import {
  Scheduler,
  retentionTask,
  summarizerTask,
  starterTask,
} from './scheduler/scheduler.js';
import { startHealthServer } from './http/health.js';

const log = childLogger({ mod: 'bootstrap' });

async function main(): Promise<void> {
  const db = createDb(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const applied = await runMigrations(db);
  log.info({ applied }, 'database ready');

  // AI router with usage accounting persisted to the ai_usage table.
  const router = new AIRouter(buildProviders(), (usage) => {
    void recordUsage(db, usage).catch((err) => log.warn({ err }, 'usage write failed'));
  });

  const shortTerm = new ShortTermStore();

  // Static community dataset (data/seed): read-only retrieval, never imported
  // into Turso. Fail-soft: missing/corrupt seeds only disable archive features.
  const community = new CommunityKnowledge({
    seedDir: env.OMAK_SEED_DIR,
    maxHits: env.OMAK_ARCHIVE_MAX_HITS,
    budgetTokens: env.OMAK_ARCHIVE_BUDGET_TOKENS,
  });
  community.init();

  // The burst handler is bound once the orchestrator exists (below).
  let burstHandler: ((chatJid: string, msgs: NormalizedMessage[]) => Promise<void>) | null = null;
  const wa = new WhatsAppService({
    db,
    onMessages: (chatJid, msgs) => {
      void burstHandler?.(chatJid, msgs).catch((err) =>
        log.error({ err, chatJid }, 'burst handling failed'),
      );
    },
  });

  const commands = new CommandRegistry();
  registerBuiltinCommands(commands, { db, wa, shortTerm, router, knowledge: community });

  const orchestrator = new SocialOrchestrator({
    db,
    router,
    sender: wa,
    shortTerm,
    matchSticker: (text) => matchStickerByText(db, text),
    sendStickerByName: async (jid, name) => {
      const bytes = await loadStickerBytes(db, name);
      if (bytes) await wa.sendSticker(jid, bytes);
    },
    commands,
    getRecentRaw: (chatJid, n) => wa.recentRaw(chatJid, n),
    community,
  });
  burstHandler = (chatJid, msgs) => orchestrator.handleBurst(chatJid, msgs);

  const scheduler = new Scheduler([
    retentionTask(db),
    summarizerTask(db, router, shortTerm),
    starterTask(db, router, shortTerm, wa, env.OMAK_MAX_STARTERS_PER_DAY),
  ]);
  scheduler.start();

  await wa.start();
  const health = await startHealthServer({ isReady: () => wa.isReady() }, env.PORT);

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    try {
      scheduler.stop();
      await wa.stop();
      health.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'unhandled rejection');
  });
  process.on('uncaughtException', (err) => {
    log.error({ err }, 'uncaught exception; exiting');
    process.exit(1);
  });
}

main().catch((err) => {
  log.error({ err }, 'fatal bootstrap error');
  process.exit(1);
});
