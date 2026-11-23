import { childLogger } from '../logger.js';
import { AIProviderError } from './types.js';
import type { AIProvider, GenerateRequest, GenerateResult } from './types.js';

export type UsageRecord = {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

const log = childLogger({ mod: 'ai:router' });

/**
 * Tries providers in order; the first success wins. Every successful call is
 * reported to onUsage (persisted by the usage tracker). A provider failure is
 * logged and the next one is tried — this is what keeps the bot talking when
 * one provider has an outage or quota block.
 */
export class AIRouter {
  constructor(
    private readonly providers: AIProvider[],
    private readonly onUsage?: (record: UsageRecord) => void,
  ) {}

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const failures: string[] = [];
    for (const provider of this.providers) {
      try {
        const result = await provider.generate(req);
        this.onUsage?.({
          provider: result.provider,
          model: result.model,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn({ provider: provider.name, err: message }, 'provider failed; trying next');
        failures.push(`${provider.name}: ${message}`);
      }
    }
    throw new AIProviderError('router', `all providers failed — ${failures.join(' | ')}`);
  }
}
