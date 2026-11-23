import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { getDailyCalls, recordUsage } from '../../src/ai/usage.js';

let db: ReturnType<typeof createDb>;

beforeEach(async () => {
  db = createDb(':memory:');
  await runMigrations(db);
});

describe('usage tracker', () => {
  it('accumulates per day+provider via the unique-index upsert', async () => {
    await recordUsage(db, { provider: 'openai', model: 'm1', promptTokens: 10, completionTokens: 5 });
    await recordUsage(db, { provider: 'openai', model: 'm1', promptTokens: 3, completionTokens: 2 });
    await recordUsage(db, { provider: 'gemini', model: 'g1' });

    expect(await getDailyCalls(db)).toBe(3);

    const res = await db.execute(
      `SELECT day, provider, calls, prompt_tokens AS p, completion_tokens AS c
       FROM ai_usage ORDER BY provider`,
    );
    const openai = res.rows.find((r) => r.provider === 'openai');
    const gemini = res.rows.find((r) => r.provider === 'gemini');
    expect(openai).toMatchObject({ calls: 2, p: 13, c: 7 });
    expect(gemini).toMatchObject({ calls: 1, p: 0, c: 0 });
  });

  it('sums across providers for the quota check', async () => {
    for (let i = 0; i < 4; i++) {
      await recordUsage(db, { provider: 'openai', model: 'm' });
    }
    expect(await getDailyCalls(db)).toBe(4);
    expect(await getDailyCalls(db, '2000-01-01')).toBe(0);
  });
});
