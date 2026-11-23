import type { Client } from '@libsql/client';
import { upsertLidMapping } from '../db/repos/groups.js';

export type JidPair = { lid?: string; pn?: string };

/**
 * Classify a JID pair (primary + alternate from MessageKey `*Alt` fields) into
 * LID and PN forms. Baileys v7 resolves PN → LID one-way, so whatever pairs we
 * observe now must be persisted for the participant resolver to work later.
 */
export function classifyJidPair(primary?: string, alt?: string): JidPair {
  const pair: JidPair = {};
  for (const jid of [primary, alt]) {
    if (!jid) continue;
    if (jid.endsWith('@lid')) pair.lid = jid;
    else if (jid.endsWith('@s.whatsapp.net')) pair.pn = jid;
  }
  return pair;
}

export async function persistJidPair(db: Client, pair: JidPair): Promise<void> {
  if (pair.lid && pair.pn) {
    await upsertLidMapping(db, pair.lid, pair.pn);
  }
}
