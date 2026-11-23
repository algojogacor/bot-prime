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

    let res: Response;
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
      throw new AIProviderError(this.name, `request failed: ${String(err)}`);
    }

    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 300);
      throw new AIProviderError(this.name, `HTTP ${res.status}: ${snippet}`, res.status);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    if (!text) throw new AIProviderError(this.name, 'empty completion');

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
