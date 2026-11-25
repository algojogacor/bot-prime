import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import {
  insertMessages,
  listRecentMessages,
  pruneMessagesBefore,
} from '../../src/db/repos/messages.js';
import {
  getGroupMeta,
  getLidForPn,
  getPnForLid,
  listParticipants,
  replaceParticipants,
  upsertGroupMeta,
  upsertLidMapping,
} from '../../src/db/repos/groups.js';

let db: ReturnType<typeof createDb>;

beforeEach(async () => {
  db = createDb(':memory:');
  await runMigrations(db);
});

describe('messages repo', () => {
  it('inserts newest-first; duplicate ids are rejected (durable dedupe contract)', async () => {
    const base = 1_700_000_000_000;
    await insertMessages(db, [
      { id: 'm1', chatJid: 'g@s.whatsapp.net', senderJid: 'a@lid', msgType: 'conversation', text: 'halo', isFromMe: false, timestamp: base },
      { id: 'm2', chatJid: 'g@s.whatsapp.net', senderJid: 'b@lid', msgType: 'conversation', text: 'wkwk', isFromMe: false, timestamp: base + 1000 },
    ]);
    // Re-inserting an existing id now throws DuplicateMessageError (the
    // whatsapp service suppresses duplicate processing on this signal).
    await expect(
      insertMessages(db, [
        { id: 'm1', chatJid: 'g@s.whatsapp.net', senderJid: 'a@lid', msgType: 'conversation', text: 'dupe', isFromMe: false, timestamp: base },
      ]),
    ).rejects.toThrow(/duplicate/);
    const rows = await listRecentMessages(db, 'g@s.whatsapp.net', 10);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe('m2');
    expect(rows[0]?.text).toBe('wkwk');
    expect(rows[1]?.senderPn).toBeUndefined();
  });

  it('round-trips push_name so DB history renders display names', async () => {
    const base = 1_700_000_000_000;
    await insertMessages(db, [
      { id: 'p1', chatJid: 'g', senderJid: 'a@lid', msgType: 'conversation', text: 'halo', isFromMe: false, timestamp: base, pushName: 'Ciboy' },
      { id: 'p2', chatJid: 'g', senderJid: 'b@lid', msgType: 'conversation', text: 'wkwk', isFromMe: false, timestamp: base + 1000 },
    ]);
    const rows = await listRecentMessages(db, 'g', 10);
    const withName = rows.find((r) => r.id === 'p1');
    expect(withName?.pushName).toBe('Ciboy');
    const withoutName = rows.find((r) => r.id === 'p2');
    expect(withoutName?.pushName).toBeUndefined();
  });

  it('prunes by cutoff and reports the affected row count', async () => {
    const base = 1_700_000_000_000;
    await insertMessages(db, [
      { id: 'old', chatJid: 'g', senderJid: 'a', msgType: 'conversation', isFromMe: false, timestamp: base },
      { id: 'new', chatJid: 'g', senderJid: 'a', msgType: 'conversation', isFromMe: false, timestamp: base + 100_000 },
    ]);
    expect(await pruneMessagesBefore(db, base + 50_000)).toBe(1);
    expect(await listRecentMessages(db, 'g', 10)).toHaveLength(1);
  });
});

describe('groups repo', () => {
  it('round-trips lid mappings in both directions', async () => {
    await upsertLidMapping(db, '999@lid', '628999@s.whatsapp.net');
    await upsertLidMapping(db, '999@lid', '628998@s.whatsapp.net'); // update wins
    expect(await getPnForLid(db, '999@lid')).toBe('628998@s.whatsapp.net');
    expect(await getLidForPn(db, '628998@s.whatsapp.net')).toBe('999@lid');
    expect(await getPnForLid(db, 'unknown@lid')).toBeNull();
  });

  it('upserts group meta with COALESCE semantics', async () => {
    await upsertGroupMeta(db, { groupJid: 'g@lid', name: 'AVOID PRIME | FT' });
    await upsertGroupMeta(db, { groupJid: 'g@lid', announce: true });
    const meta = await getGroupMeta(db, 'g@lid');
    expect(meta?.name).toBe('AVOID PRIME | FT');
    expect(meta?.announce).toBe(true);
  });

  it('replaces participant snapshots transactionally', async () => {
    await replaceParticipants(db, 'g@lid', [
      { jid: '1@lid', pn: '6281@s.whatsapp.net', role: 'admin' },
      { jid: '2@lid', role: 'member' },
    ]);
    await replaceParticipants(db, 'g@lid', [{ jid: '3@lid' }]);
    const parts = await listParticipants(db, 'g@lid');
    expect(parts).toHaveLength(1);
    expect(parts[0]?.jid).toBe('3@lid');
  });
});
