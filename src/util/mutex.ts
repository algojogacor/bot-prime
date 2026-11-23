const locks = new Map<string, Promise<unknown>>();

/**
 * In-process per-key mutex: serializes async access to a named resource.
 * Used to serialize Baileys' concurrent saveCreds() calls, mirroring the
 * file-locking the upstream useMultiFileAuthState does with async-mutex.
 */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}
