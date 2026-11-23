import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Turso: libsql:// for remote, file: for local dev/tests.
  TURSO_DATABASE_URL: z.string().min(1),
  TURSO_AUTH_TOKEN: z.string().min(1).optional(),

  // Baileys auth blobs are encrypted at rest with this key (32 bytes, base64).
  AUTH_ENCRYPTION_KEY: z.string().min(1),

  AI_PROVIDER: z.enum(['openai', 'anthropic', 'gemini', 'openrouter']).default('openrouter'),
  AI_API_KEY: z.string().min(1),
  AI_BASE_URL: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),

  // Comma-separated WhatsApp JIDs.
  OMAK_ADMIN_JIDS: z.string().default(''),
  OMAK_ALLOWED_GROUP_JIDS: z.string().default(''),

  // Quiet hours in UTC, "start-end"; 16-0 == 23:00-07:00 WIB.
  OMAK_QUIET_HOURS_UTC: z.string().regex(/^\d{1,2}-\d{1,2}$/).default('16-0'),
  OMAK_MAX_DAILY_AI_CALLS: z.coerce.number().int().min(0).default(300),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

/** Parse a comma-separated env value into a trimmed, non-empty list. */
export function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
