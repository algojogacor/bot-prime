import { describe, expect, it } from 'vitest';
import { AIRouter } from '../../src/ai/router.js';
import { AIProviderError } from '../../src/ai/types.js';
import type { AIProvider, GenerateResult } from '../../src/ai/types.js';

function fakeProvider(
  name: string,
  behavior: 'ok' | 'fail',
  text = 'wkwk',
): AIProvider {
  return {
    name,
    model: 'test-model',
    generate: async (): Promise<GenerateResult> => {
      if (behavior === 'fail') {
        throw new AIProviderError(name, 'down');
      }
      return { text, provider: name, model: 'test-model', usage: { promptTokens: 1, completionTokens: 2 } };
    },
  };
}

describe('AIRouter', () => {
  it('uses the first healthy provider', async () => {
    const router = new AIRouter([fakeProvider('a', 'fail'), fakeProvider('b', 'ok')]);
    const res = await router.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(res.provider).toBe('b');
    expect(res.text).toBe('wkwk');
    expect(router.providerNames).toEqual(['a', 'b']);
  });

  it('reports usage of the provider that actually answered', async () => {
    const seen: string[] = [];
    const router = new AIRouter([fakeProvider('a', 'ok')], (r) => seen.push(r.provider));
    await router.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(seen).toEqual(['a']);
  });

  it('throws a router error summarizing every failure', async () => {
    const router = new AIRouter([fakeProvider('a', 'fail'), fakeProvider('b', 'fail')]);
    await expect(router.generate({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(
      /all providers failed — a:.*b:/s,
    );
  });
});
