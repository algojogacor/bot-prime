import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';

/**
 * Create a libSQL client.
 * Remote: libsql://... (authToken required) — Local/dev/test: file:... or :memory:
 *
 * Local file databases run in WAL mode with a busy timeout: the auth store
 * (creds.update), message persistence and health reads run concurrently, and
 * the default `delete` journal serializes them behind SQLITE_BUSY errors.
 * WAL keeps readers unblocked and crash-safe (observed live on the VM: the
 * production DB ran in `delete` journal mode).
 */
export function createDb(url: string, authToken?: string): Client {
  if (url.startsWith('file:')) {
    // libsql fails with SQLITE_CANTOPEN when the parent directory is missing.
    mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  }
  const client = createClient({ url, authToken: authToken || undefined });
  if (url.startsWith('file:') && url !== 'file::memory:') {
    // Best-effort pragmas; a failure here must not block startup.
    void client
      .batch(['PRAGMA journal_mode=WAL', 'PRAGMA busy_timeout=5000', 'PRAGMA synchronous=NORMAL'], 'write')
      .catch(() => undefined);
  }
  return client;
}
