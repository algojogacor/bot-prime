import { createClient, type Client } from '@libsql/client';

/**
 * Create a libSQL client.
 * Remote: libsql://... (authToken required) — Local/dev/test: file:... or :memory:
 */
export function createDb(url: string, authToken?: string): Client {
  return createClient({ url, authToken: authToken || undefined });
}
