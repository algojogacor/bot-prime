// Vitest setup: safe defaults for required env so test runs never depend on a
// local .env (credentials must never be committed — these are dummy values).
process.env.TURSO_DATABASE_URL ??= 'file::memory:';
process.env.AUTH_ENCRYPTION_KEY ??= 'test-only-key-32-bytes-aaaaaaaaaa';
process.env.AI_API_KEY ??= 'test-only';
