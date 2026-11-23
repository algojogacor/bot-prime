import {
  BufferJSON,
  initAuthCreds,
  proto,
} from '@whiskeysockets/baileys';
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import type { Client, InStatement } from '@libsql/client';
import { childLogger } from '../logger.js';
import { withLock } from '../util/mutex.js';
import { decryptText, deriveKey, encryptText } from './crypto.js';

const log = childLogger({ mod: 'db:auth-store' });

/**
 * Turso-backed, AES-256-GCM-encrypted Baileys auth state.
 *
 * Mirrors the exact semantics of upstream useMultiFileAuthState:
 * - values are serialized with BufferJSON replacer/reviver (plain JSON.stringify
 *   corrupts Buffer fields),
 * - 'app-state-sync-key' values are re-hydrated through
 *   proto.Message.AppStateSyncKeyData.fromObject on read,
 * - null values in keys.set() mean delete,
 * - creds live under type 'creds', id 'creds'.
 *
 * The session therefore survives Koyeb's ephemeral disk. All categories in
 * SignalDataTypeMap are supported, including the v7-only 'lid-mapping',
 * 'device-list' and 'tctoken' keys.
 */
export async function useDbAuthState(
  db: Client,
  base64Key: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const key = deriveKey(base64Key);

  const readValue = async (type: string, id: string): Promise<unknown> => {
    const res = await db.execute({
      sql: 'SELECT value_enc FROM auth_keys WHERE type = ? AND key_id = ?',
      args: [type, id],
    });
    const enc = res.rows[0]?.value_enc;
    if (typeof enc !== 'string') return null;
    try {
      return JSON.parse(decryptText(key, enc), BufferJSON.reviver);
    } catch (err) {
      log.error({ type, id, err }, 'failed to decrypt auth key; treating as missing');
      return null;
    }
  };

  const credsRow = await readValue('creds', 'creds');
  const creds: AuthenticationCreds =
    (credsRow as AuthenticationCreds | null) ?? initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const data: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          const value = await readValue(type, id);
          // Missing (or undecryptable) keys are omitted, not set to null.
          if (value === null) continue;
          if (type === 'app-state-sync-key') {
            data[id] = proto.Message.AppStateSyncKeyData.fromObject(
              value as Record<string, unknown>,
            ) as unknown as SignalDataTypeMap[T];
          } else {
            data[id] = value as SignalDataTypeMap[T];
          }
        }
        return data;
      },
      set: async (data: SignalDataSet) => {
        const stmts: InStatement[] = [];
        for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          const entries = data[category] ?? {};
          for (const id of Object.keys(entries)) {
            const value = entries[id];
            if (value) {
              stmts.push({
                sql: `INSERT INTO auth_keys (type, key_id, value_enc, updated_at)
                      VALUES (?, ?, ?, ?)
                      ON CONFLICT (type, key_id) DO UPDATE
                      SET value_enc = excluded.value_enc, updated_at = excluded.updated_at`,
                args: [category, id, encryptText(key, JSON.stringify(value, BufferJSON.replacer)), Date.now()],
              });
            } else {
              stmts.push({
                sql: 'DELETE FROM auth_keys WHERE type = ? AND key_id = ?',
                args: [category, id],
              });
            }
          }
        }
        if (stmts.length > 0) {
          await db.batch(stmts, 'write');
        }
      },
    },
  };

  const saveCreds = async (): Promise<void> => {
    await withLock('creds', async () => {
      await db.execute({
        sql: `INSERT INTO auth_keys (type, key_id, value_enc, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT (type, key_id) DO UPDATE
              SET value_enc = excluded.value_enc, updated_at = excluded.updated_at`,
        args: ['creds', 'creds', encryptText(key, JSON.stringify(creds, BufferJSON.replacer)), Date.now()],
      });
    });
  };

  return { state, saveCreds };
}

/** Wipe every stored auth key — used when WhatsApp logs the session out, so the next start re-pairs cleanly. */
export async function clearAuthStore(db: Client): Promise<void> {
  await db.execute('DELETE FROM auth_keys');
}
