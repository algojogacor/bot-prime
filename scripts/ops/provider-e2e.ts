/**
 * Provider-chain E2E (run on the VM with the live .env exported):
 *   set -a; . /home/azureuser/bot-prime/.env; set +a
 *   npx tsx scripts/ops/provider-e2e.ts
 *
 * 1. Direct generate() against EVERY configured provider with its real key
 *    pool and catalog model — proves the credential wiring, endpoint and
 *    model id actually work (not just configured).
 * 2. Failover drill: simulated DEAD groq + gemini (fatal auth) in front of
 *    the real chain — the router must skip them (no retry on fatal) and
 *    answer via nvidia, proving the chain walks Gojiha's chat order.
 * Exits non-zero if any direct provider test fails or the failover answer
 * does not come from the expected provider.
 */
import { env, parseList } from '../../src/config/env.js';
import { MultiProviderAdapter } from '../../src/ai/adapters/multi-provider.js';
import { AIRouter, buildProviders } from '../../src/ai/router.js';
import { AIProviderError } from '../../src/ai/types.js';
import type { AIProvider, GenerateResult } from '../../src/ai/types.js';

const REQ = {
  system: 'Kamu OMAK, anggota grup WhatsApp. Balas super pendek.',
  messages: [{ role: 'user', content: 'balas satu kata: wok' }],
  temperature: 0.7,
  // NO maxTokens: provider-native capacity, exactly like the production
  // orchestrator path. (A small explicit cap starves reasoning models like
  // nemotron — that was a test artifact, not a wiring issue.)
};

const pools: Record<string, string[]> = {
  groq: parseList(env.AI_GROQ_KEYS),
  gemini: parseList(env.AI_GEMINI_KEYS),
  nvidia: parseList(env.AI_NVIDIA_KEYS),
  mistral: parseList(env.AI_MISTRAL_KEYS),
  cohere: parseList(env.AI_COHERE_KEYS),
  deepseek: parseList(env.AI_DEEPSEEK_KEYS),
};

console.log('== 1. direct provider tests (real keys, real endpoints) ==');
const failed: string[] = [];
for (const id of ['groq', 'gemini', 'nvidia', 'mistral', 'deepseek', 'cohere']) {
  const pool = pools[id] ?? [];
  if (pool.length === 0) {
    console.log(`⏭  ${id}: no credential configured — skipped (inactive by design)`);
    continue;
  }
  const adapter = new MultiProviderAdapter({
    id,
    apiKeys: pool,
    timeoutMs: env.AI_TIMEOUT_MS,
    defaultTemperature: 0.7,
  });
  try {
    const res: GenerateResult = await adapter.generate(REQ);
    console.log(`✅ ${id} (${res.model}) [${pool.length} keys]: ${res.text.slice(0, 60).replace(/\n/g, ' ')}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ ${id}: ${msg.slice(0, 140)}`);
    failed.push(id);
  }
}

console.log();
console.log('== 2. failover drill (dead groq + gemini → expect nvidia) ==');
const poison = (name: string): AIProvider => ({
  name,
  model: 'simulated',
  generate: async () => {
    throw new AIProviderError(name, 'HTTP 401: simulated dead key (drill)', 401, true);
  },
});
const real = buildProviders();
console.log('chain order:', real.map((p) => `${p.name}/${p.model}`).join(' → '));
const drill = new AIRouter([
  poison('groq'),
  poison('gemini'),
  ...real.filter((p) => p.name !== 'groq' && p.name !== 'gemini'),
]);
const res = await drill.generate(REQ);
console.log(`✅ failover answered via ${res.provider} (${res.model}): ${res.text.slice(0, 60).replace(/\n/g, ' ')}`);
if (res.provider !== 'nvidia') {
  console.error(`FATAL: expected nvidia to answer the drill, got ${res.provider}`);
  process.exit(1);
}

console.log();
if (failed.length > 0) {
  console.error(`FAILED providers: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('ALL PROVIDER E2E CHECKS PASSED');
process.exit(0);
