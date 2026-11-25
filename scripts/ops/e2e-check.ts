/**
 * E2E smoke check for the AI reply path (run on the VM, against a COPY of
 * the live DB so nothing real is touched):
 *   cp /home/azureuser/bot-prime/data/bot.db /tmp/e2e.db
 *   set -a; . /home/azureuser/bot-prime/.env; set +a
 *   TURSO_DATABASE_URL=file:/tmp/e2e.db npx tsx scripts/ops/e2e-check.ts
 *
 * Wires the real orchestrator + real provider chain and fires one synthetic
 * mention burst through the FULL AI path — durable history assembly,
 * community retrieval, provider call, validation. No WhatsApp traffic.
 * Prints the reply and the usage record; exits non-zero if the bot stays
 * quiet.
 */
import { createClient } from '@libsql/client';
import { runMigrations } from '../../src/db/migrate.js';
import { AIRouter, buildProviders } from '../../src/ai/router.js';
import { SocialOrchestrator } from '../../src/social/orchestrator.js';
import { ShortTermStore } from '../../src/memory/short-term.js';
import { CommunityKnowledge } from '../../src/community/knowledge.js';
import type { NormalizedMessage } from '../../src/whatsapp/normalize.js';

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error('TURSO_DATABASE_URL missing (point it at a COPY of the live db)');

const db = createClient({ url });
await runMigrations(db);

const providers = buildProviders();
console.log('providers:', providers.map((p) => `${p.name}/${p.model}`).join(', '));
if (providers.length === 0) throw new Error('no providers configured');

const router = new AIRouter(providers, (r) =>
  console.log('USAGE:', r.provider, r.model, 'prompt:', r.promptTokens, 'completion:', r.completionTokens),
);

const community = new CommunityKnowledge({ seedDir: 'data/seed' });
community.init();

const sent: string[] = [];
const orch = new SocialOrchestrator({
  db,
  router,
  sender: {
    sendText: async (_jid, text) => {
      sent.push(text);
      console.log('REPLY:', text.slice(0, 300));
    },
  },
  shortTerm: new ShortTermStore(),
  community,
});

const CHAT = '120363411005527783@g.us';
const msg: NormalizedMessage = {
  id: `E2E-${Date.now()}`,
  chatJid: CHAT,
  isGroup: true,
  senderJid: '165210883154071@lid',
  isFromMe: false,
  text: 'omak, eren tuh main dimana sekarang? rekomendasiin dong buat spar nanti malem',
  type: 'conversation',
  timestamp: Date.now(),
  pushName: 'Arya',
};
await orch.handleBurst(CHAT, [msg]);
console.log('sent count:', sent.length);
if (sent.length === 0) throw new Error('bot stayed quiet — participation gate or AI failure');
process.exit(0);
