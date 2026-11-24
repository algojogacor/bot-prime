import { describe, expect, it } from 'vitest';
import { MultiProviderAdapter } from '../../src/ai/adapters/multi-provider.js';
import { AIProviderError } from '../../src/ai/types.js';
import type { GenerateRequest } from '../../src/ai/types.js';

type Captured = { url: string; body: Record<string, unknown>; auth: string };

function makeFetchSequence(
  responders: Array<{ status: number; json: unknown }>,
): { fetchImpl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  let i = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const responder = responders[Math.min(i, responders.length - 1)] as { status: number; json: unknown };
    i += 1;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      auth: headers.authorization ?? '',
    });
    return new Response(JSON.stringify(responder.json), {
      status: responder.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const ok = (text: string, finish_reason = 'stop') => ({
  status: 200,
  json: { choices: [{ message: { content: text }, finish_reason }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
});

const baseReq: GenerateRequest = {
  system: 'Kamu OMAK.',
  messages: [{ role: 'user', content: 'halo' }],
  temperature: 0.7,
};

function adapter(fetchImpl: typeof fetch, opts: Partial<Parameters<typeof MultiProviderAdapter.prototype.generate> extends never ? never : ConstructorParameters<typeof MultiProviderAdapter>[0]> = {}) {
  return new MultiProviderAdapter({
    id: 'groq',
    apiKeys: ['key-1'],
    timeoutMs: 5_000,
    defaultTemperature: 0.7,
    fetchImpl,
    ...opts,
  });
}

describe('MultiProviderAdapter', () => {
  it('uses the catalog model and endpoint, sends provider-native body (no default max_tokens)', async () => {
    const { fetchImpl, calls } = makeFetchSequence([ok('halo bro')]);
    const a = adapter(fetchImpl);
    const res = await a.generate(baseReq);
    expect(a.model).toBe('qwen/qwen3.8-27b');
    expect(res.model).toBe('qwen/qwen3.8-27b');
    expect(calls[0]?.url).toContain('api.groq.com');
    expect(calls[0]?.auth).toBe('Bearer key-1');
    expect(calls[0]?.body.max_tokens).toBeUndefined(); // provider-native capacity
    expect(calls[0]?.body.temperature).toBe(0.7);
  });

  it('honors an explicit generous cap when provided (cost guard, not clipping)', async () => {
    const { fetchImpl, calls } = makeFetchSequence([ok('panjang')]);
    await adapter(fetchImpl).generate({ ...baseReq, maxTokens: 4_096 });
    expect(calls[0]?.body.max_tokens).toBe(4_096);
  });

  it('finish_reason=length with no visible text → one bounded retry with 2× budget', async () => {
    const { fetchImpl, calls } = makeFetchSequence([
      { status: 200, json: { choices: [{ message: { content: null }, finish_reason: 'length' }], usage: {} } },
      ok('sekarang ada teksnya'),
    ]);
    const res = await adapter(fetchImpl).generate({ ...baseReq, maxTokens: 400 });
    expect(res.text).toBe('sekarang ada teksnya');
    expect(calls.length).toBe(2);
    expect((calls[1]?.body.max_tokens as number)).toBe(800); // 400×2, capped
  });

  it('finish_reason=length twice → raises (bounded, never infinite)', async () => {
    const { fetchImpl } = makeFetchSequence([
      { status: 200, json: { choices: [{ message: { content: null }, finish_reason: 'length' }], usage: {} } },
      { status: 200, json: { choices: [{ message: { content: null }, finish_reason: 'length' }], usage: {} } },
    ]);
    await expect(adapter(fetchImpl).generate({ ...baseReq, maxTokens: 400 })).rejects.toThrow(AIProviderError);
  });

  it('rotates API keys on 401 so a dead key never wedges the provider', async () => {
    const { fetchImpl, calls } = makeFetchSequence([
      { status: 401, json: { error: 'bad key' } },
      ok('dari kunci kedua'),
    ]);
    const a = new MultiProviderAdapter({
      id: 'groq',
      apiKeys: ['key-1', 'key-2'],
      timeoutMs: 5_000,
      defaultTemperature: 0.7,
      fetchImpl,
    });
    // First call fails (401 rotates), router would retry — simulate second attempt:
    await expect(a.generate(baseReq)).rejects.toThrow('HTTP 401');
    const res = await a.generate(baseReq);
    expect(res.text).toBe('dari kunci kedua');
    expect(calls[1]?.auth).toBe('Bearer key-2');
  });

  it('throws a credential error when no authorized key is configured', async () => {
    const { fetchImpl } = makeFetchSequence([ok('x')]);
    const a = new MultiProviderAdapter({ id: 'cohere', apiKeys: [], timeoutMs: 5_000, defaultTemperature: 0.7, fetchImpl });
    await expect(a.generate(baseReq)).rejects.toThrow('no authorized Bot Prime credential');
  });

  it('reports finishReason from the provider', async () => {
    const { fetchImpl } = makeFetchSequence([ok('potong', 'length')]);
    const res = await adapter(fetchImpl).generate(baseReq);
    expect(res.finishReason).toBe('length');
  });
});
