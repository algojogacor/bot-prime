export type ParticipationDecision = { act: 'reply' | 'ignore'; reason: string };

export type ParticipationMode = 'passive' | 'balanced' | 'active';

export type ChatReplyState = {
  lastReplyAtMs: number | null;
  repliesLastHour: number;
};

export type ParticipationConfig = {
  /** Lowercase tokens that mean the group is talking TO the bot. */
  mentionTokens: string[];
  maxRepliesPerHourPerChat: number;
  minGapMs: number;
  /** 0..1 chance to chime in on a burst nobody addressed to the bot. */
  ambientReplyRate: number;
  dailyAiQuota: number;
  dailyAiUsed: number;
  /** Persistent group mode (group_settings table). Default: balanced. */
  mode?: ParticipationMode;
  /** The burst replies to one of the bot's messages or @-mentions the bot. */
  replyToMe?: boolean;
};

/**
 * Decide if the bot should speak for a burst. Order matters: hard limits first
 * (quota, hourly), then explicit mentions — a direct address must never be
 * dropped by pacing rules (found in dry-run scenario C07) — then the reply
 * gap for ambient participation, then the low ambient rate.
 * The corpus showed a core of 10 people produce 94.8% of traffic — the bot
 * must blend in, never flood, so defaults are conservative.
 */
export function shouldReply(input: {
  burst: { sender: string; text: string; isFromMe: boolean }[];
  state: ChatReplyState;
  config: ParticipationConfig;
  now: number;
  rng?: () => number;
}): ParticipationDecision {
  const humanMessages = input.burst.filter((m) => !m.isFromMe);
  if (humanMessages.length === 0) {
    return { act: 'ignore', reason: 'only-bot-messages' };
  }
  if (input.config.dailyAiUsed >= input.config.dailyAiQuota) {
    return { act: 'ignore', reason: 'daily-ai-quota' };
  }
  if (input.state.repliesLastHour >= input.config.maxRepliesPerHourPerChat) {
    return { act: 'ignore', reason: 'hourly-limit' };
  }
  const mode = input.config.mode ?? 'balanced';
  // passive = mentions only; active = bolder ambient rate and a shorter gap.
  const ambientRate =
    mode === 'passive'
      ? 0
      : mode === 'active'
        ? Math.min(0.25, input.config.ambientReplyRate * 3)
        : input.config.ambientReplyRate;
  const minGapMs = mode === 'active' ? Math.min(input.config.minGapMs, 5_000) : input.config.minGapMs;

  const lowered = humanMessages
    .map((m) => m.text.toLowerCase())
    .join(' \n ');
  // Word-boundary matching only: 'oma' must NOT fire inside 'nomor'
  // (found in dry-run scenario S11 — substring matching caused false mentions).
  const mentioned =
    input.config.replyToMe === true ||
    input.config.mentionTokens.some((token) =>
      new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lowered),
    );
  if (mentioned) {
    return { act: 'reply', reason: input.config.replyToMe === true ? 'reply-to-bot' : 'mentioned' };
  }

  if (
    input.state.lastReplyAtMs !== null &&
    input.now - input.state.lastReplyAtMs < minGapMs
  ) {
    return { act: 'ignore', reason: 'reply-gap' };
  }

  const rng = input.rng ?? Math.random;
  if (rng() < ambientRate) {
    return { act: 'reply', reason: 'ambient' };
  }
  return { act: 'ignore', reason: 'ambient-not-selected' };
}
