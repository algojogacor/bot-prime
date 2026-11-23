import { AIProviderError } from '../types.js';
import type { AIProvider, ChatMessage, GenerateRequest, GenerateResult, ImageInput } from '../types.js';

export type AnthropicConfig = {
  apiKey: string;
  model: string;
  /** Base without trailing slash, default https://api.anthropic.com */
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

type AnthropicPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicPart[] };

function buildMessages(req: GenerateRequest): AnthropicMessage[] {
  // Anthropic forbids role 'system' inside messages; those go to the top-level
  // `system` parameter, so filter them out first (indices shift accordingly).
  const nonSystem = req.messages.filter(
    (m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system',
  );
  const lastUserIndex = nonSystem.map((m) => m.role).lastIndexOf('user');
  return nonSystem.map((m, index): AnthropicMessage => {
    const isTargetUser =
      m.role === 'user' && index === lastUserIndex && (req.images?.length ?? 0) > 0;
    if (isTargetUser) {
      const parts: AnthropicPart[] = [{ type: 'text', text: m.content }];
      for (const img of req.images as ImageInput[]) {
        parts.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
        });
      }
      return { role: 'user', content: parts };
    }
    return { role: m.role, content: m.content };
  });
}

/** Anthropic Messages API adapter (system prompt is a top-level parameter there). */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly cfg: AnthropicConfig;

  constructor(cfg: AnthropicConfig) {
    this.model = cfg.model;
    this.cfg = cfg;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      max_tokens: req.maxTokens ?? 400,
      temperature: req.temperature ?? 1,
      messages: buildMessages(req),
    };
    if (req.system) body.system = req.system;

    let res: Response;
    try {
      res = await (this.cfg.fetchImpl ?? fetch)(`${this.cfg.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.cfg.apiKey,
          'anthropic-version': '2023-06-01',
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
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (json.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('');
    if (!text) throw new AIProviderError(this.name, 'empty completion');

    return {
      text,
      provider: this.name,
      model: this.cfg.model,
      usage: {
        promptTokens: json.usage?.input_tokens,
        completionTokens: json.usage?.output_tokens,
      },
    };
  }
}
