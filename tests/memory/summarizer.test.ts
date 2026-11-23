import { describe, expect, it } from 'vitest';
import { heuristicSummary } from '../../src/memory/summarizer.js';

describe('heuristicSummary', () => {
  it('summarizes span, people count and top tokens', () => {
    const base = 1_700_000_000_000;
    const summary = heuristicSummary([
      { sender: 'a', text: 'turnamen minggu depan woy', timestamp: base },
      { sender: 'b', text: 'siap turnamen gas', timestamp: base + 60_000 },
      { sender: 'c', text: 'jangan lupa daftar turnamen', timestamp: base + 120_000 },
    ]);
    expect(summary).toContain('3 pesan');
    expect(summary).toContain('3 orang');
    expect(summary).toContain('turnamen');
  });

  it('returns empty string for empty input', () => {
    expect(heuristicSummary([])).toBe('');
  });
});
