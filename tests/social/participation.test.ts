import { describe, expect, it } from 'vitest';
import { shouldReply } from '../../src/social/participation.js';

const BASE_CONFIG = {
  mentionTokens: ['omak'],
  maxRepliesPerHourPerChat: 12,
  minGapMs: 8_000,
  ambientReplyRate: 0.04,
  dailyAiQuota: 300,
  dailyAiUsed: 0,
};

const BASE_STATE = { lastReplyAtMs: null, repliesLastHour: 0 };

describe('shouldReply', () => {
  const now = 1_000_000;

  it('ignores bursts containing only bot messages', () => {
    const d = shouldReply({
      burst: [{ sender: 'bot', text: 'wkwk', isFromMe: true }],
      state: BASE_STATE,
      config: BASE_CONFIG,
      now,
    });
    expect(d).toEqual({ act: 'ignore', reason: 'only-bot-messages' });
  });

  it('replies when mentioned', () => {
    const d = shouldReply({
      burst: [{ sender: 'u', text: 'wok omak gimana ini', isFromMe: false }],
      state: BASE_STATE,
      config: BASE_CONFIG,
      now,
    });
    expect(d).toEqual({ act: 'reply', reason: 'mentioned' });
  });

  it('respects the daily AI quota', () => {
    const d = shouldReply({
      burst: [{ sender: 'u', text: 'omak', isFromMe: false }],
      state: BASE_STATE,
      config: { ...BASE_CONFIG, dailyAiUsed: 300 },
      now,
    });
    expect(d).toEqual({ act: 'ignore', reason: 'daily-ai-quota' });
  });

  it('respects the hourly limit and the reply gap (ambient text only)', () => {
    const burst = [{ sender: 'u', text: 'wkwk kocak', isFromMe: false }];
    expect(
      shouldReply({
        burst,
        state: { ...BASE_STATE, repliesLastHour: 12 },
        config: BASE_CONFIG,
        now,
        rng: () => 0,
      }).reason,
    ).toBe('hourly-limit');
    expect(
      shouldReply({
        burst,
        state: { ...BASE_STATE, lastReplyAtMs: now - 1_000 },
        config: BASE_CONFIG,
        now,
        rng: () => 0,
      }).reason,
    ).toBe('reply-gap');
  });

  it('a direct mention is never dropped by the reply gap (dry-run C07 regression)', () => {
    const d = shouldReply({
      burst: [{ sender: 'u', text: 'omak', isFromMe: false }],
      state: { ...BASE_STATE, lastReplyAtMs: now - 1_000 },
      config: BASE_CONFIG,
      now,
    });
    expect(d).toEqual({ act: 'reply', reason: 'mentioned' });
  });

  it('mention tokens match on word boundaries only (dry-run S11 regression)', () => {
    const d = shouldReply({
      burst: [{ sender: 'u', text: 'pesan biasa nomor 3', isFromMe: false }],
      state: BASE_STATE,
      config: BASE_CONFIG,
      now,
      rng: () => 0.99, // ambient must not rescue the false mention
    });
    expect(d.act).toBe('ignore');
    expect(d.reason).toBe('ambient-not-selected');
  });

  it('uses the ambient rate only as a low-probability fallback', () => {
    const burst = [{ sender: 'u', text: 'wkwk kocak', isFromMe: false }];
    expect(
      shouldReply({ burst, state: BASE_STATE, config: BASE_CONFIG, now, rng: () => 0.99 }).act,
    ).toBe('ignore');
    expect(
      shouldReply({ burst, state: BASE_STATE, config: BASE_CONFIG, now, rng: () => 0.01 }).act,
    ).toBe('reply');
  });
});
