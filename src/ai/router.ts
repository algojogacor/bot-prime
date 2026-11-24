import { env, parseList } from '../config/env.js';
import { childLogger } from '../logger.js';
import { AIProviderError } from './types.js';
import type { AIProvider, GenerateRequest, GenerateResult } from './types.js';
import { MultiProviderAdapter } from './adapters/multi-provider.js';
import { AnthropicProvider } from './adapters/anthropic.js';
import { GeminiProvider } from './adapters/gemini.js';
import { MODEL_CATALOG, catalogLabel } from './catalog.js';

const log = childLogger({ mod: 'ai:router' });

export type UsageRecord = {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

type BreakerEntry = { state: CircuitBreakerState; failures: number; openedAt: number; lastError?: string };

/**
 * Provider chain aligned with the Gojiha Flash Peak ecosystem (verified from
 * its source on 2026-11-24): same seven practical providers, same chat
 * priority order (GROQ → GEMINI → NVIDIA_NIM → MISTRAL → DEEPSEEK → COHERE →
 * OLLAMA), circuit breaker (3 consecutive failures → OPEN, 60 s cooldown,
 * HALF_OPEN probe), key-pool rotation on 401/403/429, then failover to the
 * next provider. Bot Prime uses only its OWN env credentials; providers
 * without an authorized Bot Prime key are never routed to (they stay visible
 * in the catalog/status as 'no credential' instead of being silently
 * substituted with another model).
 */
export class AIRouter {
  private readonly breakers = new Map<string, BreakerEntry>();

  constructor(
    private readonly providers: AIProvider[],
    private readonly onUsage?: (record: UsageRecord) => void,
    private readonly breakerThreshold = 3,
    private readonly cooldownMs = 60_000,
  ) {
    for (const p of providers) this.breakers.set(p.name, { state: 'CLOSED', failures: 0, openedAt: 0 });
  }

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  /** Read-only provider list for status surfaces (models shown, never keys). */
  providersRef(): AIProvider[] {
    return [...this.providers];
  }

  providerStatus(): Array<{ provider: string; breaker: CircuitBreakerState; lastError?: string }> {
    return this.providers.map((p) => ({
      provider: p.name,
      breaker: this.breakers.get(p.name)?.state ?? 'CLOSED',
      lastError: this.breakers.get(p.name)?.lastError,
    }));
  }

  private isAvailable(name: string, now = Date.now()): boolean {
    const b = this.breakers.get(name);
    if (!b) return true;
    if (b.state === 'CLOSED') return true;
    if (b.state === 'OPEN') return now - b.openedAt >= this.cooldownMs;
    return true; // HALF_OPEN probe slot
  }

  private recordSuccess(name: string): void {
    const b = this.breakers.get(name);
    if (b) { b.state = 'CLOSED'; b.failures = 0; b.lastError = undefined; }
  }

  private recordFailure(name: string, err: unknown): void {
    const b = this.breakers.get(name);
    if (!b) return;
    b.failures += 1;
    b.lastError = err instanceof Error ? err.message.slice(0, 140) : String(err).slice(0, 140);
    const isFatal = err instanceof AIProviderError && (err.status === 401 || err.status === 403);
    if (isFatal || b.failures >= this.breakerThreshold || b.state === 'HALF_OPEN') {
      b.state = 'OPEN';
      b.openedAt = Date.now();
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const failures: string[] = [];
    for (const provider of this.providers) {
      if (!this.isAvailable(provider.name)) continue;
      try {
        const result = await provider.generate(req);
        this.recordSuccess(provider.name);
        this.onUsage?.({
          provider: result.provider,
          model: result.model,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.recordFailure(provider.name, err);
        log.warn({ provider: provider.name, err: message }, 'provider failed; trying next');
        failures.push(`${provider.name}: ${message}`);
      }
    }
    throw new AIProviderError('router', `all providers failed — ${failures.join(' | ')}`);
  }
}

/**
 * Builds the provider chain from Bot Prime's own env:
 *  - A provider participates ONLY if Bot Prime has an authorized credential.
 *  - Primary provider first (AI_PROVIDER), then AI_FALLBACK_ORDER; the
 *    Gojiha-aligned chat order fills the remainder so failover walks the same
 *    sequence as the neighboring service where compatible.
 */
export function buildProviders(fetchImpl?: typeof fetch): AIProvider[] {
  const openaiCompatKey = env.AI_API_KEY; // primary provider key (openai-compat gateways)
  const keys: Record<string, string[]> = {
    groq: parseList(env.AI_GROQ_KEYS).filter(Boolean),
    gemini: parseList(env.AI_GEMINI_KEYS).filter(Boolean),
    nvidia: parseList(env.AI_NVIDIA_KEYS).filter(Boolean),
    deepseek: parseList(env.AI_DEEPSEEK_KEYS).filter(Boolean),
    cohere: parseList(env.AI_COHERE_KEYS).filter(Boolean),
    mistral: parseList(env.AI_MISTRAL_KEYS).filter(Boolean),
    ollama: parseList(env.AI_OLLAMA_KEYS).filter(Boolean),
  };
  // provider=openai historically points at an OpenAI-compatible gateway
  // (e.g. Groq) through AI_BASE_URL + AI_API_KEY — preserve that contract.
  if (env.AI_PROVIDER === 'openai' && openaiCompatKey) {
    if ((keys.groq?.length ?? 0) === 0 && (env.AI_BASE_URL ?? '').includes('groq.com')) {
      keys.groq = [openaiCompatKey];
    }
  }

  const configured: AIProvider[] = [];
  const add = (id: string, modelOverride?: string): void => {
    if (!MODEL_CATALOG[id]) return;
    const pool = keys[id];
    if (!pool || pool.length === 0) return;
    if (configured.some((p) => p.name === id)) return;
    configured.push(
      new MultiProviderAdapter({
        id,
        apiKeys: pool,
        model: modelOverride,
        timeoutMs: env.AI_TIMEOUT_MS,
        defaultTemperature: 0.7,
        fetchImpl,
      }),
    );
  };

  const primary = env.AI_PROVIDER;
  if (primary === 'anthropic' && openaiCompatKey) {
    configured.push(
      new AnthropicProvider({
        apiKey: openaiCompatKey,
        model: env.AI_MODEL ?? 'claude-3-5-haiku-latest',
        baseUrl: env.AI_BASE_URL ?? 'https://api.anthropic.com',
        timeoutMs: env.AI_TIMEOUT_MS,
        fetchImpl,
      }),
    );
  } else if (primary === 'gemini' && (keys.gemini?.length ?? 0) > 0) {
    configured.push(
      new GeminiProvider({
        apiKey: (keys.gemini as string[])[0] as string,
        model: env.AI_MODEL ?? 'gemini-2.0-flash',
        baseUrl: env.AI_BASE_URL ?? 'https://generativelanguage.googleapis.com',
        timeoutMs: env.AI_TIMEOUT_MS,
        fetchImpl,
      }),
    );
  } else if (primary === 'openai' && openaiCompatKey && !(env.AI_BASE_URL ?? '').includes('groq.com')) {
    // Non-Groq OpenAI-compatible primary (e.g. OpenRouter): use catalog entry.
    add(primary === 'openai' ? 'openrouter' : primary, env.AI_MODEL);
  } else {
    // groq (or provider=openai@Groq): route through the groq catalog entry,
    // honoring an explicit AI_MODEL (e.g. openai/gpt-oss-120b).
    add('groq', env.AI_MODEL);
  }

  for (const id of parseList(env.AI_FALLBACK_ORDER)) add(id);
  for (const id of ['groq', 'gemini', 'nvidia', 'mistral', 'deepseek', 'cohere', 'ollama']) add(id);

  if (configured.length === 0) {
    log.warn('no AI provider has an authorized Bot Prime credential; AI features disabled');
  }
  return configured;
}

/** Human-readable status line for !ai status — never includes keys. */
export function describeProviders(providers: AIProvider[]): string {
  if (providers.length === 0) return 'ai off (ga ada kredensial provider yg autorisasi)';
  const live = providers.map((p) => `${catalogLabel(p.name)}/${p.model}`).join(', ');
  const missing = Object.keys(MODEL_CATALOG)
    .filter((id) => !providers.some((p) => p.name === id) && id !== 'anthropic' && id !== 'openrouter')
    .map((id) => catalogLabel(id));
  return missing.length > 0 ? `${live} | tanpa kredensial: ${missing.join(',')}` : live;
}
