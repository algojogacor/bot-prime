import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../src/ai/prompt-builder.js';

describe('buildSystemPrompt', () => {
  it('contains the language profile rules', () => {
    const prompt = buildSystemPrompt({
      isGroup: true,
      recentMessages: [],
      incoming: [{ sender: 'x', text: 'gas?' }],
    });
    expect(prompt).toContain('Kamu OMAK');
    expect(prompt).toContain('wkwk');
    expect(prompt).toContain('🗿');
    expect(prompt).toContain('DILARANG');
    expect(prompt).toContain('TIDAK PERNAH mengaku manusia');
  });

  it('renders recent context and the incoming burst', () => {
    const prompt = buildSystemPrompt({
      isGroup: true,
      chatName: 'AVOID PRIME | FT',
      recentMessages: [
        { sender: 'a', text: 'spar jam 8' },
        { sender: 'b', text: 'gas dah' },
      ],
      incoming: [{ sender: 'c', text: 'wok siapa aja yg main' }],
    });
    expect(prompt).toContain('AVOID PRIME | FT');
    expect(prompt).toContain('a: spar jam 8');
    expect(prompt).toContain('c: wok siapa aja yg main');
    expect(prompt.indexOf('Chat terakhir')).toBeLessThan(prompt.indexOf('Pesan baru'));
  });

  it('appends web research results when provided', () => {
    const prompt = buildSystemPrompt({
      isGroup: false,
      recentMessages: [],
      incoming: [{ sender: 'x', text: 'jadwal liga?' }],
      webResults: 'Hasil: liga mulai 1 Desember',
    });
    expect(prompt).toContain('Hasil: liga mulai 1 Desember');
  });
});
