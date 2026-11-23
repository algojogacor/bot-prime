import type { Client } from '@libsql/client';
import { env } from '../config/env.js';
import { childLogger } from '../logger.js';

const log = childLogger({ mod: 'ai:usage' });

/**
 * Daily AI usage accounting against the ai_usage table (one row per
 * day+provider, guarded by the unique index from migration 002). This powers
 * the OMAK_MAX_DAILY_AI_CALLS quota — Turso bills per row write, so callers
 * should aggregate per burst, not per token.
 */
export async function recordUsage(
  db: Client,
  rec: { provider: string; model: string; promptTokens?: number; completionTokens?: number },
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await db.execute({
    sql: `INSERT INTO ai_usage (day, provider, model, calls, prompt_tokens, completion_tokens, created_at)
          VALUES (?, ?, ?, 1, ?, ?, ?)
          ON CONFLICT (day, provider) DO UPDATE SET
            calls = ai_usage.calls + 1,
            model = excluded.model,
            prompt_tokens = ai_usage.prompt_tokens + excluded.prompt_tokens,
            completion_tokens = ai_usage.completion_tokens + excluded.completion_tokens`,
    args: [day, rec.provider, rec.model, rec.promptTokens ?? 0, rec.completionTokens ?? 0, Date.now()],
  });
}

export async function getDailyCalls(db: Client, day?: string): Promise<number> {
  const target = day ?? new Date().toISOString().slice(0, 10);
  const res = await db.execute({
    sql: 'SELECT COALESCE(SUM(calls), 0) AS calls FROM ai_usage WHERE day = ?',
    args: [target],
  });
  const calls = res.rows[0]?.calls;
  return typeof calls === 'number' ? calls : Number(calls ?? 0);
}

/** True when the daily AI-call quota still has room. */
export async function hasQuotaLeft(db: Client): Promise<boolean> {
  const used = await getDailyCalls(db);
  return used < env.OMAK_MAX_DAILY_AI_CALLS;
}

export async function recordQuotaSkip(db: Client, reason: string): Promise<void> {
  log.info({ reason }, 'AI call skipped');
}
