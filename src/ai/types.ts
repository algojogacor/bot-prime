export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

export type ImageInput = { mimeType: string; base64: string };

export type GenerateRequest = {
  system?: string;
  messages: ChatMessage[];
  /** Vision hook: images attach to the LAST user message. */
  images?: ImageInput[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
};

export type TokenUsage = { promptTokens?: number; completionTokens?: number };

export type GenerateResult = {
  text: string;
  provider: string;
  model: string;
  usage?: TokenUsage;
  /** Provider-reported stop condition: 'stop' (complete) or 'length' (truncated). */
  finishReason?: string;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

export class AIProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'AIProviderError';
  }
}
