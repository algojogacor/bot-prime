import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { clearAuthStore, useDbAuthState } from '../../src/db/auth-store.js';

const KEY = Buffer.alloc(32, 42).toString('base64');

async function freshAuth() {
  const db = createDb(':memory:');
  await runMigrations(db);
  return { db, ...(await useDbAuthState(db, KEY)) };
}

describe('useDbAuthState', () => {
  it('initializes fresh creds and persists them via saveCreds', async () => {
    const { db, state, saveCreds } = await freshAuth();
    expect(state.creds).toBeTruthy();
    expect(state.creds.registered).toBe(false);

    state.creds.registered = true;
    await saveCreds();

    // A second auth state over the same DB must see the persisted creds.
    const again = await useDbAuthState(db, KEY);
    expect(again.state.creds.registered).toBe(true);
  });

  it('round-trips binary and structured key material through the encrypted store', async () => {
    const { state } = await freshAuth();

    await state.keys.set({
      session: { 'id-1': new Uint8Array([1, 2, 3, 250]) },
      'sender-key-memory': { 'jid@s.whatsapp.net': { 'other@s.whatsapp.net': true } },
      'lid-mapping': { '123@lid': '628123456789@s.whatsapp.net' },
      tctoken: { 'tok-1': { token: Buffer.from('token-bytes') } },
    });

    const session = await state.keys.get('session', ['id-1', 'missing']);
    expect(session['id-1']).toBeInstanceOf(Uint8Array);
    expect(Array.from(session['id-1'] ?? new Uint8Array())).toEqual([1, 2, 3, 250]);
    expect(session['missing']).toBeUndefined();

    const lid = await state.keys.get('lid-mapping', ['123@lid']);
    expect(lid['123@lid']).toBe('628123456789@s.whatsapp.net');

    const tctoken = await state.keys.get('tctoken', ['tok-1']);
    expect(Buffer.isBuffer(tctoken['tok-1']?.token)).toBe(true);
    expect(tctoken['tok-1']?.token.toString()).toBe('token-bytes');
  });

  it('deletes entries set to null', async () => {
    const { state } = await freshAuth();
    await state.keys.set({ session: { 'id-1': new Uint8Array([9]) } });
    await state.keys.set({ session: { 'id-1': null } });
    const got = await state.keys.get('session', ['id-1']);
    expect(got['id-1']).toBeUndefined();
  });

  it('re-hydrates app-state-sync-key through the proto class', async () => {
    const { state } = await freshAuth();
    // AppStateSyncKeyData = { keyData: bytes, fingerprint, timestamp } — keyId lives
    // on the outer AppStateSyncKey wrapper, not here.
    await state.keys.set({
      'app-state-sync-key': {
        'k-1': { keyData: Buffer.from('raw-bytes'), timestamp: 123 } as never,
      },
    });

    const got = await state.keys.get('app-state-sync-key', ['k-1']);
    const value = got['k-1'] as
      | { keyData?: Uint8Array; timestamp?: { toString(): string } }
      | undefined;
    expect(value).toBeTruthy();
    // fromObject produces a protobuf message instance, not the plain object.
    expect(value?.keyData).toBeInstanceOf(Uint8Array);
    expect(value?.keyData?.toString()).toBe('raw-bytes');
    expect(value?.timestamp?.toString()).toBe('123');
  });

  it('keeps stores isolated per key: wrong key cannot decrypt old data', async () => {
    const { db, state, saveCreds } = await freshAuth();
    state.creds.registered = true;
    await saveCreds();

    const other = await useDbAuthState(db, Buffer.alloc(32, 99).toString('base64'));
    expect(other.state.creds.registered).toBe(false);
  });

  it('clearAuthStore wipes credentials for a clean re-pair', async () => {
    const { db, state, saveCreds } = await freshAuth();
    state.creds.registered = true;
    await saveCreds();
    await clearAuthStore(db);

    const again = await useDbAuthState(db, KEY);
    expect(again.state.creds.registered).toBe(false);
  });
});
