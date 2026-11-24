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
  AI_API_KEY: z.string().default(''),
  AI_BASE_URL: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  // Comma-separated provider ids tried after the primary on failure.
  AI_FALLBACK_ORDER: z.string().default(''),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),

  // Output-token policy: NO arbitrary low application cap. The provider's
  // native completion capacity is respected; these are optional, generous
  // guards (cost/abuse bound), not truncation knobs — unset means the
  // provider decides.
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(50).max(32_000).optional(),
  AI_CONTINUATION_MAX_TOKENS: z.coerce.number().int().min(256).max(32_000).default(4_096),

  // Per-provider credential pools (Bot Prime's OWN keys only; comma lists
  // rotate on 401/403/429). Providers without an authorized key are part of
  // the catalog but are never routed to.
  AI_GROQ_KEYS: z.string().default(''),
  AI_GEMINI_KEYS: z.string().default(''),
  AI_NVIDIA_KEYS: z.string().default(''),
  AI_DEEPSEEK_KEYS: z.string().default(''),
  AI_COHERE_KEYS: z.string().default(''),
  AI_MISTRAL_KEYS: z.string().default(''),
  AI_OLLAMA_KEYS: z.string().default(''),

  // WhatsApp transport: 'direct' (this process owns Baileys — legacy) or
  // 'gateway' (wa-gateway process owns the single connection; we consume it
  // over a Unix socket).
  WA_TRANSPORT: z.enum(['direct', 'gateway']).default('direct'),
  WA_GATEWAY_SOCKET: z.string().default('/run/wa-gateway.sock'),

  // Comma-separated WhatsApp JIDs.
  OMAK_ADMIN_JIDS: z.string().default(''),
  OMAK_ALLOWED_GROUP_JIDS: z.string().default(''),

  // Digits only (no +); used on first run to request a pairing code instead of QR.
  OMAK_PAIRING_NUMBER: z.string().regex(/^\d{7,15}$/).optional(),

  // Quiet hours in UTC, "start-end"; 16-0 == 23:00-07:00 WIB.
  OMAK_QUIET_HOURS_UTC: z.string().regex(/^\d{1,2}-\d{1,2}$/).default('16-0'),
  OMAK_MAX_DAILY_AI_CALLS: z.coerce.number().int().min(0).default(300),

  // Social pacing.
  OMAK_AMBIENT_REPLY_RATE: z.coerce.number().min(0).max(1).default(0.04),
  OMAK_MAX_REPLIES_PER_HOUR: z.coerce.number().int().min(1).default(12),
  OMAK_MIN_REPLY_GAP_MS: z.coerce.number().int().min(0).default(8_000),
  OMAK_MAX_STARTERS_PER_DAY: z.coerce.number().int().min(0).default(2),
  // Bot nicknames the group can call it by (comma-separated, lowercase).
  OMAK_MENTION_TOKENS: z.string().default('omak,oma,mak'),

  // Community dataset (static seed artifacts; retrieval is read-only).
  OMAK_SEED_DIR: z.string().default('data/seed'),
  OMAK_ARCHIVE_MAX_HITS: z.coerce.number().int().min(0).max(20).default(6),
  OMAK_ARCHIVE_BUDGET_TOKENS: z.coerce.number().int().min(100).max(4_000).default(900),
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
