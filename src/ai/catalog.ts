export const providerIds = ['groq', 'gemini', 'nvidia', 'deepseek', 'cohere', 'mistral', 'ollama', 'anthropic', 'openrouter'] as const;
export type ProviderId = (typeof providerIds)[number];

/**
 * Model catalog entries mirror the Gojiha Flash Peak ecosystem (verified from
 * its adapters on 2026-11-24): default text/vision models per provider, with
 * per-request model selection supported by MultiProviderRouter.
 * Bot Prime keeps its own ids/names; credentials are read from Bot Prime's
 * own env only — never from the neighboring service.
 */
export const MODEL_CATALOG: Record<string, { text: string; vision: string; endpoint: string; label: string }> = {
  groq: {
    label: 'GROQ',
    text: 'qwen/qwen3.8-27b',
    vision: 'qwen/qwen3.8-27b',
    endpoint: 'https://api.groq.com/openai/v1',
  },
  gemini: {
    label: 'GEMINI',
    text: 'gemini-3-flash-preview',
    vision: 'gemini-3-flash-preview',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  nvidia: {
    label: 'NVIDIA_NIM',
    text: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    vision: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    endpoint: 'https://integrate.api.nvidia.com/v1',
  },
  deepseek: {
    label: 'DEEPSEEK',
    text: 'deepseek-flash',
    vision: 'deepseek-flash',
    endpoint: 'https://api.deepseek.com',
  },
  cohere: {
    label: 'COHERE',
    text: 'command-a-reasoning-08-2025',
    vision: 'c4ai-aya-vision-32b',
    endpoint: 'https://api.cohere.com/compatibility/v1',
  },
  mistral: {
    label: 'MISTRAL',
    text: 'codestral-latest',
    vision: 'ministral-14b-latest',
    endpoint: 'https://api.mistral.ai/v1',
  },
  ollama: {
    label: 'OLLAMA_CLOUD',
    text: 'llama3.2-vision',
    vision: 'llama3.2-vision',
    endpoint: 'http://localhost:11434/v1',
  },
  anthropic: {
    label: 'ANTHROPIC',
    text: 'claude-3-5-haiku-latest',
    vision: 'claude-3-5-haiku-latest',
    endpoint: 'https://api.anthropic.com',
  },
  openrouter: {
    label: 'OPENROUTER',
    text: 'openai/gpt-4o-mini',
    vision: 'openai/gpt-4o-mini',
    endpoint: 'https://openrouter.ai/api/v1',
  },
};

export function catalogModel(id: string, kind: 'text' | 'vision' = 'text'): string | undefined {
  const entry = MODEL_CATALOG[id];
  return entry ? entry[kind] : undefined;
}

export function catalogEndpoint(id: string): string | undefined {
  return MODEL_CATALOG[id]?.endpoint;
}

export function catalogLabel(id: string): string {
  return MODEL_CATALOG[id]?.label ?? id.toUpperCase();
}

export function catalogIds(): string[] {
  return Object.keys(MODEL_CATALOG);
}
