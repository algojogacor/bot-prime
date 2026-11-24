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
    // v3: complete-thought directive, not clipped one-liners
    expect(prompt).toContain('pikiran yang utuh');
    expect(prompt).toContain('nyambung');
    // v3: turn continuity block (asserted only when turns are passed)
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

describe('buildSystemPrompt — aiTurns continuity', () => {
  it('injects the last AI turns so follow-ups connect', () => {
    const prompt = buildSystemPrompt({
      isGroup: true,
      recentMessages: [],
      incoming: [{ sender: 'x', text: 'bukan gitu maksud gw' }],
      aiTurns: [{ sender: 'x', question: 'siapa kiper kita', answer: 'kiper kita vhez' }],
    });
    expect(prompt).toContain('siapa kiper kita');
    expect(prompt).toContain('kiper kita vhez');
    expect(prompt).toContain('jangan ulang dari nol');
  });

  it('omits the block when there are no turns', () => {
    const prompt = buildSystemPrompt({
      isGroup: true,
      recentMessages: [],
      incoming: [{ sender: 'x', text: 'gas' }],
    });
    expect(prompt).not.toContain('Obrolan AI terakhir');
  });
});
