import { describe, expect, it } from 'vitest';
import { isRageBaitRequest, RageBaitLimiter } from '../../src/social/rage-bait.js';

describe('isRageBaitRequest', () => {
  it('detects escalating requests', () => {
    expect(isRageBaitRequest('omak hina dia donk')).toBe(true);
    expect(isRageBaitRequest('toxicin dia wkwk')).toBe(true);
    expect(isRageBaitRequest('roast habis2an aja')).toBe(true);
    expect(isRageBaitRequest('wkwk gas')).toBe(false);
  });
});

describe('RageBaitLimiter', () => {
  it('allows up to maxConsecutive then blocks', () => {
    const limiter = new RageBaitLimiter(3, 60 * 60_000);
    const t = 1_000_000;
    expect(limiter.registerAttempt('u1', t)).toBe(true);
    expect(limiter.registerAttempt('u1', t + 1)).toBe(true);
    expect(limiter.registerAttempt('u1', t + 2)).toBe(true);
    expect(limiter.registerAttempt('u1', t + 3)).toBe(false);
    expect(limiter.isBlocked('u1', t + 4)).toBe(true);
  });

  it('resets after the decay window', () => {
    const limiter = new RageBaitLimiter(1, 1_000);
    const t = 1_000_000;
    limiter.registerAttempt('u1', t);
    limiter.registerAttempt('u1', t + 1);
    expect(limiter.isBlocked('u1', t + 500)).toBe(true);
    expect(limiter.isBlocked('u1', t + 60_000)).toBe(false);
    expect(limiter.registerAttempt('u1', t + 60_000)).toBe(true);
  });

  it('tracks users independently', () => {
    const limiter = new RageBaitLimiter(1, 60_000);
    const t = 1_000_000;
    limiter.registerAttempt('a', t);
    limiter.registerAttempt('a', t + 1);
    expect(limiter.isBlocked('b', t + 2)).toBe(false);
  });
});
