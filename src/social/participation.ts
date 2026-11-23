export type ParticipationDecision = { act: 'reply' | 'ignore'; reason: string };

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
};

/**
 * Decide if the bot should speak for a burst. Order matters: hard limits first
 * (quota, cooldowns), then explicit mentions, then the low ambient rate.
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
  if (
    input.state.lastReplyAtMs !== null &&
    input.now - input.state.lastReplyAtMs < input.config.minGapMs
  ) {
    return { act: 'ignore', reason: 'reply-gap' };
  }

  const lowered = humanMessages
    .map((m) => m.text.toLowerCase())
    .join(' \n ');
  const mentioned = input.config.mentionTokens.some((token) =>
    lowered.includes(token),
  );
  if (mentioned) return { act: 'reply', reason: 'mentioned' };

  const rng = input.rng ?? Math.random;
  if (rng() < input.config.ambientReplyRate) {
    return { act: 'reply', reason: 'ambient' };
  }
  return { act: 'ignore', reason: 'ambient-not-selected' };
}
