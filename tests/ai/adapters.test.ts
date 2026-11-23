import { describe, expect, it } from 'vitest';
import { OpenAICompatProvider } from '../../src/ai/adapters/openai-compat.js';
import { AnthropicProvider } from '../../src/ai/adapters/anthropic.js';
import { GeminiProvider } from '../../src/ai/adapters/gemini.js';
import { AIProviderError } from '../../src/ai/types.js';
import type { GenerateRequest } from '../../src/ai/types.js';

type Captured = { url: string; init?: RequestInit };

function makeFetch(
  status: number,
  body: unknown,
): { fetchImpl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const IMG = { mimeType: 'image/jpeg', base64: 'aG9sYQ==' };

const baseReq: GenerateRequest = {
  system: 'Kamu OMAK.',
  messages: [
    { role: 'user', content: 'halo' },
    { role: 'assistant', content: 'wkwk' },
    { role: 'user', content: 'gas?' },
  ],
  images: [IMG],
  maxTokens: 333,
};

describe('OpenAICompatProvider', () => {
  it('posts to chat/completions with system first and images on the last user message', async () => {
    const { fetchImpl, calls } = makeFetch(200, {
      choices: [{ message: { content: 'jir gas dah 🗿' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    });
    const p = new OpenAICompatProvider({
      name: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-test',
      baseUrl: 'https://api.openai.com/v1',
      timeoutMs: 5_000,
      fetchImpl,
    });

    const result = await p.generate(baseReq);

    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body.model).toBe('gpt-test');
    expect(body.max_tokens).toBe(333);
    const messages = body.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]?.role).toBe('system');
    const last = messages[messages.length - 1] as { content: Array<{ type: string; image_url?: { url: string } }> };
    expect(last.content[0]?.type).toBe('text');
    expect(last.content[1]?.image_url?.url).toContain('data:image/jpeg;base64,aG9sYQ==');
    expect(result).toMatchObject({
      text: 'jir gas dah 🗿',
      provider: 'openai',
      usage: { promptTokens: 12, completionTokens: 4 },
    });
  });

  it('adds openrouter headers and json mode when asked', async () => {
    const { fetchImpl, calls } = makeFetch(200, {
      choices: [{ message: { content: '{"a":1}' } }],
    });
    const p = new OpenAICompatProvider({
      name: 'openrouter',
      apiKey: 'k',
      model: 'x/y',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 5_000,
      fetchImpl,
    });
    await p.generate({ ...baseReq, jsonMode: true });
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['x-title']).toBe('Omak');
    const body = JSON.parse(String(calls[0]?.init?.body)) as { response_format?: { type: string } };
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws AIProviderError with status on HTTP errors', async () => {
    const { fetchImpl } = makeFetch(429, { error: { message: 'rate limited' } });
    const p = new OpenAICompatProvider({
      name: 'openai',
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://api.openai.com/v1',
      timeoutMs: 5_000,
      fetchImpl,
    });
    await expect(p.generate(baseReq)).rejects.toMatchObject({
      name: 'AIProviderError',
      status: 429,
    });
  });
});

describe('AnthropicProvider', () => {
  it('uses the messages API with top-level system and base64 image source', async () => {
    const { fetchImpl, calls } = makeFetch(200, {
      content: [{ type: 'text', text: 'siap gas' }],
      usage: { input_tokens: 9, output_tokens: 3 },
    });
    const p = new AnthropicProvider({
      apiKey: 'ak-test',
      model: 'claude-test',
      baseUrl: 'https://api.anthropic.com',
      timeoutMs: 5_000,
      fetchImpl,
    });

    const result = await p.generate(baseReq);

    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('ak-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      system?: string;
      max_tokens?: number;
      messages?: Array<{ role: string; content: unknown }>;
    };
    expect(body.system).toBe('Kamu OMAK.');
    expect(body.max_tokens).toBe(333);
    const last = body.messages?.[body.messages.length - 1] as {
      content: Array<{ type: string; source?: { media_type: string } }>;
    };
    expect(last.content[1]?.source?.media_type).toBe('image/jpeg');
    expect(result.text).toBe('siap gas');
  });
});

describe('GeminiProvider', () => {
  it('maps assistant→model roles and sends inline_data images', async () => {
    const { fetchImpl, calls } = makeFetch(200, {
      candidates: [{ content: { parts: [{ text: 'wok bisa' }] } }],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 },
    });
    const p = new GeminiProvider({
      apiKey: 'g-test',
      model: 'gemini-test',
      baseUrl: 'https://generativelanguage.googleapis.com',
      timeoutMs: 5_000,
      fetchImpl,
    });

    const result = await p.generate(baseReq);

    expect(calls[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    );
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('g-test');
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      systemInstruction?: { parts: { text: string }[] };
      contents?: Array<{ role: string; parts: Array<{ inline_data?: { mime_type: string } }> }>;
    };
    expect(body.systemInstruction?.parts[0]?.text).toBe('Kamu OMAK.');
    const assistant = body.contents?.find((c) => c.role === 'model');
    expect(assistant).toBeDefined();
    const lastUser = body.contents?.[body.contents.length - 1];
    expect(lastUser?.parts[0]?.inline_data?.mime_type).toBe('image/jpeg');
    expect(result.usage).toEqual({ promptTokens: 8, completionTokens: 2 });
  });

  it('throws on empty candidates', async () => {
    const { fetchImpl } = makeFetch(200, { candidates: [] });
    const p = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://generativelanguage.googleapis.com',
      timeoutMs: 5_000,
      fetchImpl,
    });
    await expect(p.generate(baseReq)).rejects.toBeInstanceOf(AIProviderError);
  });
});
