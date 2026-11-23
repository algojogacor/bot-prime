import { env } from '../config/env.js';
import { AnthropicProvider } from './adapters/anthropic.js';
import { GeminiProvider } from './adapters/gemini.js';
import { OpenAICompatProvider } from './adapters/openai-compat.js';
import type { AIProvider } from './types.js';

export type ProviderId = 'openai' | 'openrouter' | 'anthropic' | 'gemini';

/**
 * Build the provider chain: primary = AI_PROVIDER, then AI_FALLBACK_ORDER.
 * Conservative default model ids are used when AI_MODEL is unset; any of them
 * can be overridden. openrouter has no safe default (models are community ids)
 * so it requires AI_MODEL.
 */
export function buildProviders(fetchImpl?: typeof fetch): AIProvider[] {
  const ids: ProviderId[] = [
    env.AI_PROVIDER as ProviderId,
    ...(parseList(env.AI_FALLBACK_ORDER) as ProviderId[]),
  ];

  const providers: AIProvider[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const provider = buildProvider(id, fetchImpl);
    if (provider) providers.push(provider);
  }
  return providers;
}

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function buildProvider(id: ProviderId, fetchImpl?: typeof fetch): AIProvider | null {
  switch (id) {
    case 'openai':
      return new OpenAICompatProvider({
        name: 'openai',
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL ?? 'gpt-4o-mini',
        baseUrl: env.AI_BASE_URL ?? 'https://api.openai.com/v1',
        timeoutMs: env.AI_TIMEOUT_MS,
        fetchImpl,
      });
    case 'openrouter':
      if (!env.AI_MODEL) {
        throw new Error('AI_PROVIDER=openrouter requires AI_MODEL (e.g. anthropic/claude-3.5-haiku)');
      }
      return new OpenAICompatProvider({
        name: 'openrouter',
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL,
        baseUrl: env.AI_BASE_URL ?? 'https://openrouter.ai/api/v1',
        timeoutMs: env.AI_TIMEOUT_MS,
        fetchImpl,
      });
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL ?? 'claude-3-5-haiku-latest',
        baseUrl: env.AI_BASE_URL ?? 'https://api.anthropic.com',
        timeoutMs: env.AI_TIMEOUT_MS,
        fetchImpl,
      });
    case 'gemini':
      return new GeminiProvider({
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL ?? 'gemini-2.0-flash',
        baseUrl: env.AI_BASE_URL ?? 'https://generativelanguage.googleapis.com',
        timeoutMs: env.AI_TIMEOUT_MS,
        fetchImpl,
      });
    default:
      throw new Error(`unknown AI provider: ${String(id)}`);
  }
}
