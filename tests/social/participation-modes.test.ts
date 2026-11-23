import { describe, expect, it } from 'vitest';
import { shouldReply } from '../../src/social/participation.js';

const baseConfig = {
  mentionTokens: ['omak', 'mak'],
  maxRepliesPerHourPerChat: 12,
  minGapMs: 8_000,
  ambientReplyRate: 0.04,
  dailyAiQuota: 300,
  dailyAiUsed: 0,
};

const burst = [{ sender: 'a@s.whatsapp.net', text: 'gas lawan eclipse', isFromMe: false }];
const state = { lastReplyAtMs: null, repliesLastHour: 0 };

describe('participation modes', () => {
  it('passive never chimes in ambiently but still answers mentions', () => {
    for (let i = 0; i < 50; i++) {
      const d = shouldReply({
        burst,
        state,
        config: { ...baseConfig, mode: 'passive' },
        now: 1_000,
        rng: () => 0.01, // far below any ambient rate
      });
      expect(d.act).toBe('ignore');
      expect(d.reason).toBe('ambient-not-selected');
    }
    const mentioned = shouldReply({
      burst: [{ sender: 'a@s.whatsapp.net', text: 'eh omak main gk', isFromMe: false }],
      state,
      config: { ...baseConfig, mode: 'passive' },
      now: 1_000,
      rng: () => 0.99,
    });
    expect(mentioned).toEqual({ act: 'reply', reason: 'mentioned' });
  });

  it('active triples the ambient rate (capped) and shortens the gap', () => {
    // With ambient 0.04 → 0.12 active: rng 0.05 is below active, above balanced.
    const active = shouldReply({
      burst,
      state,
      config: { ...baseConfig, mode: 'active' },
      now: 1_000,
      rng: () => 0.05,
    });
    expect(active).toEqual({ act: 'reply', reason: 'ambient' });
    const balanced = shouldReply({
      burst,
      state,
      config: { ...baseConfig, mode: 'balanced' },
      now: 1_000,
      rng: () => 0.05,
    });
    expect(balanced.act).toBe('ignore');
    // Gap: active 5s, balanced 8s — 7s elapsed clears active, hits balanced.
    const gapActive = shouldReply({
      burst,
      state: { lastReplyAtMs: 5_000, repliesLastHour: 0 },
      config: { ...baseConfig, mode: 'active' },
      now: 12_000,
      rng: () => 0.99,
    });
    expect(gapActive.act).toBe('ignore');
    expect(gapActive.reason).not.toBe('reply-gap');
    const gapBalanced = shouldReply({
      burst,
      state: { lastReplyAtMs: 5_000, repliesLastHour: 0 },
      config: { ...baseConfig, mode: 'balanced' },
      now: 12_000,
      rng: () => 0.99,
    });
    expect(gapBalanced.reason).toBe('reply-gap');
  });

  it('replyToMe (quoted reply or @-mention by JID) always answers, even passive', () => {
    const d = shouldReply({
      burst,
      state,
      config: { ...baseConfig, mode: 'passive', replyToMe: true },
      now: 1_000,
      rng: () => 0.99,
    });
    expect(d).toEqual({ act: 'reply', reason: 'reply-to-bot' });
  });

  it('quota and hourly limits still outrank everything', () => {
    const quota = shouldReply({
      burst,
      state,
      config: { ...baseConfig, replyToMe: true, dailyAiUsed: 300 },
      now: 1_000,
    });
    expect(quota.reason).toBe('daily-ai-quota');
    const hourly = shouldReply({
      burst,
      state: { lastReplyAtMs: null, repliesLastHour: 12 },
      config: { ...baseConfig, replyToMe: true },
      now: 1_000,
    });
    expect(hourly.reason).toBe('hourly-limit');
  });
});
