import { env } from './config/env.js';
import { childLogger } from './logger.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { WhatsAppService } from './whatsapp/service.js';
import { startHealthServer } from './http/health.js';

const log = childLogger({ mod: 'bootstrap' });

async function main(): Promise<void> {
  const db = createDb(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  const applied = await runMigrations(db);
  log.info({ applied }, 'database ready');

  const wa = new WhatsAppService({
    db,
    onMessages: (chatJid, msgs) => {
      // Consumer layers (AI, social intelligence) plug in here as they land.
      log.info(
        { chatJid, count: msgs.length, first: msgs[0]?.text ?? null },
        'burst received',
      );
    },
  });
  await wa.start();

  const health = await startHealthServer({ isReady: () => wa.isReady() }, env.PORT);

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    try {
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
