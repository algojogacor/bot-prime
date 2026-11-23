import { AIProviderError } from '../types.js';
import type { AIProvider, GenerateRequest, GenerateResult, ImageInput } from '../types.js';

export type GeminiConfig = {
  apiKey: string;
  model: string;
  /** Base without trailing slash, default https://generativelanguage.googleapis.com */
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

type GeminiPart = { text?: string } | { inline_data: { mime_type: string; data: string } };

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

function buildContents(req: GenerateRequest): GeminiContent[] {
  const lastUserIndex = req.messages.map((m) => m.role).lastIndexOf('user');
  return req.messages.map((m, index): GeminiContent => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const isTargetUser =
      m.role === 'user' && index === lastUserIndex && (req.images?.length ?? 0) > 0;
    const parts: GeminiPart[] = [];
    if (isTargetUser) {
      for (const img of req.images as ImageInput[]) {
        parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
      }
    }
    parts.push({ text: m.content });
    return { role, parts };
  });
}

/** Google Gemini generateContent adapter. */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly cfg: GeminiConfig;

  constructor(cfg: GeminiConfig) {
    this.model = cfg.model;
    this.cfg = cfg;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      contents: buildContents(req),
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 400,
        temperature: req.temperature ?? 1,
        ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };

    let res: Response;
    try {
      res = await (this.cfg.fetchImpl ?? fetch)(
        `${this.cfg.baseUrl}/v1beta/models/${this.cfg.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.cfg.apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.cfg.timeoutMs),
        },
      );
    } catch (err) {
      throw new AIProviderError(this.name, `request failed: ${String(err)}`);
    }

    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 300);
      throw new AIProviderError(this.name, `HTTP ${res.status}: ${snippet}`, res.status);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
    if (!text) throw new AIProviderError(this.name, 'empty completion');

    return {
      text,
      provider: this.name,
      model: this.cfg.model,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount,
        completionTokens: json.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}
