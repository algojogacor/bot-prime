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

  it('retries ONE time on a transient error, then succeeds on the same provider (Gojiha policy)', async () => {
    let calls = 0;
    const flaky: AIProvider = {
      name: 'a',
      model: 'm',
      generate: async () => {
        calls += 1;
        if (calls === 1) throw new AIProviderError('a', 'transient boom');
        return { text: 'sembuh', provider: 'a', model: 'm' };
      },
    };
    // retryBackoffMs=0 keeps the test instant; policy shape is what matters.
    const router = new AIRouter([flaky], undefined, 3, 60_000, 1, 0);
    const res = await router.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(res.provider).toBe('a');
    expect(calls).toBe(2); // initial + exactly one retry
  });

  it('never retries a fatal (auth) failure — fails over immediately', async () => {
    let badCalls = 0;
    const bad: AIProvider = {
      name: 'a',
      model: 'm',
      generate: async () => {
        badCalls += 1;
        throw new AIProviderError('a', 'HTTP 401: bad key', 401, true);
      },
    };
    const router = new AIRouter([bad, fakeProvider('b', 'ok')], undefined, 3, 60_000, 1, 0);
    const res = await router.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(res.provider).toBe('b');
    expect(badCalls).toBe(1); // fatal → zero retries
  });

  it('trips the circuit breaker IMMEDIATELY on a quota-exhausted error', async () => {
    const quota: AIProvider = {
      name: 'q',
      model: 'm',
      generate: async () => {
        throw new AIProviderError('q', 'HTTP 429 (quota exhausted)', 429, true);
      },
    };
    const router = new AIRouter([quota, fakeProvider('b', 'ok')], undefined, 3, 60_000, 1, 0);
    const res = await router.generate({ messages: [{ role: 'user', content: 'x' }] });
    expect(res.provider).toBe('b');
    const status = router.providerStatus().find((s) => s.provider === 'q');
    expect(status?.breaker).toBe('OPEN'); // fatal trips instantly, not after 3 failures
  });
});
