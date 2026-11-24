import { AIProviderError } from '../types.js';
import type { AIProvider, GenerateRequest, GenerateResult, ImageInput } from '../types.js';

export type OpenAICompatConfig = {
  /** Provider label, e.g. 'openai' or 'openrouter'. */
  name: string;
  apiKey: string;
  model: string;
  /** Base URL ending WITHOUT a trailing slash, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

type OAContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type OAMessage = { role: 'system' | 'user' | 'assistant'; content: string | OAContentPart[] };

function buildMessages(
  req: GenerateRequest,
): OAMessage[] {
  const out: OAMessage[] = [];
  if (req.system) out.push({ role: 'system', content: req.system });

  const lastUserIndex = req.messages.map((m) => m.role).lastIndexOf('user');
  req.messages.forEach((m, index) => {
    if (
      m.role === 'user' &&
      index === lastUserIndex &&
      req.images &&
      req.images.length > 0
    ) {
      const parts: OAContentPart[] = [{ type: 'text', text: m.content }];
      for (const img of req.images as ImageInput[]) {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        });
      }
      out.push({ role: 'user', content: parts });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  });
  return out;
}

/**
 * Speaks the OpenAI Chat Completions wire format. Covers OpenAI itself and any
 * compatible gateway (OpenRouter, Groq, together.ai, ...) via baseUrl.
 */
export class OpenAICompatProvider implements AIProvider {
  readonly name: string;
  readonly model: string;
  private readonly cfg: OpenAICompatConfig;

  constructor(cfg: OpenAICompatConfig) {
    this.name = cfg.name;
    this.model = cfg.model;
    this.cfg = cfg;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages: buildMessages(req),
      max_tokens: req.maxTokens ?? 400,
      temperature: req.temperature ?? 1,
    };
    if (req.jsonMode) body.response_format = { type: 'json_object' };

    // Retry on transient failures only (openai-node conventions: 408/429/5xx),
    // at most 2 retries, exponential backoff with jitter, honoring the
    // provider's Retry-After header on 429 (Groq sends fractional seconds).
    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;
    let lastError: AIProviderError | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const retryAfterMs = Number(res?.headers?.get('retry-after'));
        const backoffMs =
          Number.isFinite(retryAfterMs) && retryAfterMs > 0
            ? Math.min(retryAfterMs * 1000, 10_000)
            : Math.min(500 * 2 ** (attempt - 1), 4_000);
        const jitterMs = 1 + Math.floor(Math.random() * 250);
        await new Promise((r) => setTimeout(r, backoffMs + jitterMs));
      }
      try {
        res = await (this.cfg.fetchImpl ?? fetch)(`${this.cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.cfg.apiKey}`,
            ...(this.cfg.name === 'openrouter'
              ? { 'http-referer': 'https://github.com/algojogacor/bot-prime', 'x-title': 'Omak' }
              : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.cfg.timeoutMs),
        });
      } catch (err) {
        lastError = new AIProviderError(this.name, `request failed: ${String(err)}`);
        continue; // network error/timeout → retry
      }
      if (res.ok) break;
      const snippet = (await res.text()).slice(0, 300);
      const status = res.status;
      lastError = new AIProviderError(this.name, `HTTP ${status}: ${snippet}`, status);
      if (status !== 408 && status !== 429 && status < 500) break; // non-transient → fail fast
    }
    const finalRes = res;
    if (!finalRes || !finalRes.ok) {
      throw (
        lastError ??
        new AIProviderError(this.name, 'request failed after retries')
      );
    }
    const okRes = finalRes;

    const json = (await okRes.json()) as {
      choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? '';
    if (!text) {
      // Reasoning models (e.g. openai/gpt-oss-120b) may spend the whole
      // max_tokens budget on hidden reasoning and return content:null with
      // finish_reason 'length'. That's a truncation problem, not a provider
      // outage — surface it distinctly so callers can retry with a larger
      // budget instead of treating the provider as dead.
      if (choice?.finish_reason === 'length') {
        throw new AIProviderError(
          this.name,
          'completion truncated before any content (reasoning consumed the token budget); retry with a larger max_tokens',
        );
      }
      throw new AIProviderError(this.name, 'empty completion');
    }

    return {
      text,
      provider: this.name,
      model: this.cfg.model,
      usage: {
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      },
    };
  }
}
