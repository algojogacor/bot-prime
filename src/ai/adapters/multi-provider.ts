import { AIProviderError } from '../types.js';
import type { AIProvider, GenerateRequest, GenerateResult, ImageInput } from '../types.js';
import { catalogEndpoint, catalogModel } from '../catalog.js';

export type MultiProviderConfig = {
  /** Provider id in the Bot Prime catalog (groq, gemini, nvidia, ...). */
  id: string;
  /** Bot Prime's own credential(s) for this provider — comma pool allowed. */
  apiKeys: string[];
  /** Explicit model override; defaults come from the catalog. */
  model?: string;
  /** Vision model override for image requests. */
  visionModel?: string;
  /** Overrides AI_TIMEOUT_MS for this provider. */
  timeoutMs: number;
  /** Default sampling temperature when the request does not set one. */
  defaultTemperature: number;
  /**
   * Application-level completion limit (tokens). Provider-native capacity is
   * respected by default: unset → provider decides. Used only as a cost guard
   * for known-expensive providers, never to clip normal long answers.
   */
  maxTokensCap?: number;
  fetchImpl?: typeof fetch;
};

type OAContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type OAMessage = { role: 'system' | 'user' | 'assistant'; content: string | OAContentPart[] };

function buildMessages(req: GenerateRequest): OAMessage[] {
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
 * Speaks the OpenAI Chat Completions wire format — covers Groq, DeepSeek,
 * NVIDIA NIM, Mistral, Cohere (compat), Gemini (compat) and OpenRouter via
 * their OpenAI-compatible endpoints (the same practical protocol the
 * neighboring Gojiha service uses for all of its providers).
 *
 * Differences handled per provider:
 *  - Cohere compat: needs max_tokens present (no default omission).
 *  - Groq reasoning models: finish_reason=length with no visible text gets one
 *    bounded retry with a larger budget (reasoning consumed the budget).
 *  - Key pool (Gojiha-replicated policy):
 *    · 401/403 → rotate key, throw fatal immediately (never retried here).
 *    · 429 with quota semantics → rotate key, throw fatal (breaker trips).
 *    · 429 rate limit → rotate key and RETRY with the next key in the pool,
 *      up to min(pool size, 5) keys per request — a hot key never wedges chat.
 */
export class MultiProviderAdapter implements AIProvider {
  readonly name: string;
  readonly model: string;
  private readonly visionModel: string;
  private readonly cfg: MultiProviderConfig;
  private keyIndex = 0;

  constructor(cfg: MultiProviderConfig) {
    this.name = cfg.id;
    this.model = cfg.model ?? catalogModel(cfg.id) ?? cfg.id;
    this.visionModel = cfg.visionModel ?? catalogModel(cfg.id, 'vision') ?? this.model;
    this.cfg = cfg;
  }

  private get endpoint(): string {
    return (catalogEndpoint(this.cfg.id) as string);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const isVision = (req.images?.length ?? 0) > 0;
    const model = isVision ? this.visionModel : this.model;

    const keyPool = this.cfg.apiKeys.filter(Boolean);
    if (keyPool.length === 0) {
      throw new AIProviderError(this.name, 'no authorized Bot Prime credential configured for this provider', 401, true);
    }
    // Gojiha's pool-walk bound: at most 5 keys tried per request.
    const maxKeyAttempts = Math.min(keyPool.length, 5);

    let budget = req.maxTokens ?? this.cfg.maxTokensCap; // undefined → provider-native
    let reasoningRetryAvailable = true;

    for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
      const key = keyPool[this.keyIndex % keyPool.length] as string;

      const body: Record<string, unknown> = {
        model,
        messages: buildMessages(req),
        temperature: req.temperature ?? this.cfg.defaultTemperature,
      };
      if (budget !== undefined) body.max_tokens = budget;
      if (req.jsonMode) body.response_format = { type: 'json_object' };

      let res: Response;
      try {
        res = await (this.cfg.fetchImpl ?? fetch)(
          `${this.endpoint}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${key}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.cfg.timeoutMs),
          },
        );
      } catch (err) {
        throw new AIProviderError(this.name, `request failed: ${String(err)}`);
      }

      if (res.status === 401 || res.status === 403) {
        this.keyIndex += 1; // rotate: next request starts on a fresh key
        const snippet = (await res.text()).slice(0, 300);
        throw new AIProviderError(this.name, `HTTP ${res.status}: ${snippet}`, res.status, true);
      }

      if (res.status === 429) {
        this.keyIndex += 1; // rotate regardless — this key is hot either way
        const snippet = (await res.text()).slice(0, 300);
        const lower = snippet.toLowerCase();
        const quota =
          lower.includes('quota') ||
          lower.includes('insufficient_quota') ||
          lower.includes('exceeded your current quota');
        if (quota) {
          throw new AIProviderError(this.name, `HTTP 429 (quota exhausted): ${snippet}`, 429, true);
        }
        if (keyAttempt < maxKeyAttempts - 1) {
          continue; // try the next rotated key in the pool
        }
        throw new AIProviderError(this.name, `HTTP 429 (rate limited): ${snippet}`, 429);
      }

      if (!res.ok) {
        const snippet = (await res.text()).slice(0, 300);
        throw new AIProviderError(this.name, `HTTP ${res.status}: ${snippet}`, res.status);
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = json.choices?.[0];
      const text = choice?.message?.content ?? '';

      // Reasoning models (e.g. Groq gpt-oss) can burn the whole budget on
      // internal reasoning before emitting visible text: one bounded retry
      // with the budget raised, capped so generation stays bounded. Same key,
      // does not consume a pool slot.
      if (!text && choice?.finish_reason === 'length') {
        const current = typeof body.max_tokens === 'number' ? body.max_tokens : 2048;
        if (reasoningRetryAvailable && current < 4096) {
          reasoningRetryAvailable = false;
          budget = Math.min(current * 2, 4096);
          keyAttempt -= 1; // retry this key with the raised budget
          continue;
        }
        throw new AIProviderError(
          this.name,
          'completion truncated before any content (reasoning consumed the token budget)',
        );
      }
      if (!text) throw new AIProviderError(this.name, 'empty completion');

      return {
        text,
        provider: this.name,
        model,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
        },
        finishReason: choice?.finish_reason ?? undefined,
      };
    }
    throw new AIProviderError(this.name, 'unreachable retry loop');
  }
}
