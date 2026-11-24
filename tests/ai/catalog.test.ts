import { describe, expect, it } from 'vitest';
import { MODEL_CATALOG, catalogEndpoint, catalogIds, catalogModel } from '../../src/ai/catalog.js';

describe('model catalog (Gojiha-aligned)', () => {
  it('contains the seven practical providers of the neighboring ecosystem', () => {
    for (const id of ['groq', 'gemini', 'nvidia', 'deepseek', 'cohere', 'mistral', 'ollama']) {
      expect(catalogIds()).toContain(id);
    }
  });

  it('uses the exact model ids verified from the neighbor adapters', () => {
    expect(catalogModel('groq')).toBe('qwen/qwen3.8-27b');
    expect(catalogModel('gemini')).toBe('gemini-3-flash-preview');
    expect(catalogModel('nvidia')).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
    expect(catalogModel('deepseek')).toBe('deepseek-flash');
    expect(catalogModel('cohere')).toBe('command-a-reasoning-08-2025');
    expect(catalogModel('mistral')).toBe('codestral-latest');
    expect(catalogModel('nvidia', 'vision')).toBe('nvidia/nemotron-3.5-super-vl-120b-a12b');
    expect(catalogModel('mistral', 'vision')).toBe('ministral-14b-latest');
  });

  it('uses each provider real endpoint base', () => {
    expect(catalogEndpoint('groq')).toContain('api.groq.com');
    expect(catalogEndpoint('nvidia')).toContain('integrate.api.nvidia.com');
    expect(catalogEndpoint('deepseek')).toContain('api.deepseek.com');
    expect(catalogEndpoint('cohere')).toContain('api.cohere.com');
    expect(catalogEndpoint('mistral')).toContain('api.mistral.ai');
  });

  it('keeps Bot Prime legacy entries for compatibility', () => {
    expect(MODEL_CATALOG.anthropic).toBeDefined();
    expect(MODEL_CATALOG.openrouter).toBeDefined();
  });
});
