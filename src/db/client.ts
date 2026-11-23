import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';

/**
 * Create a libSQL client.
 * Remote: libsql://... (authToken required) — Local/dev/test: file:... or :memory:
 */
export function createDb(url: string, authToken?: string): Client {
  if (url.startsWith('file:')) {
    // libsql fails with SQLITE_CANTOPEN when the parent directory is missing.
    mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  }
  return createClient({ url, authToken: authToken || undefined });
}
