import { describe, expect, it } from 'vitest';
import { hasUnverifiableClaim, TRUTH_FALLBACK, TRUTH_FALLBACK as FALLBACK } from '../../src/social/personality.js';

describe('hasUnverifiableClaim', () => {
  it('flags claims about past speech not grounded in context', () => {
    expect(hasUnverifiableClaim('kemarin lu bilang ganteng banget', 'halo halo wkwk')).toBe(true);
  });

  it('accepts claims whose substance appears in context', () => {
    expect(
      hasUnverifiableClaim('kemarin lu bilang ganteng banget', 'wkwk iya ganteng banget dah'),
    ).toBe(false);
  });

  it('ignores replies without past-speech claims', () => {
    expect(hasUnverifiableClaim('wkwk gas dah 🗿', '')).toBe(false);
  });

  it('exposes a safe fallback line', () => {
    expect(FALLBACK).toBe(TRUTH_FALLBACK);
    expect(FALLBACK.length).toBeGreaterThan(0);
  });
});
