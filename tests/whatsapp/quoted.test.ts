import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../src/db/migrate.js';
import { normalizeMessage, unwrapMessage } from '../../src/whatsapp/normalize.js';
import { sameJidUser } from '../../src/whatsapp/service.js';
import { getMessageById, insertMessages } from '../../src/db/repos/messages.js';
import type { WAMessage } from '@whiskeysockets/baileys';

function groupReplyMsg(overrides: Partial<WAMessage> = {}): WAMessage {
  return {
    key: {
      id: 'REPLY1',
      remoteJid: '120363@g.us',
      participant: '628111@s.whatsapp.net',
      fromMe: false,
    },
    message: {
      extendedTextMessage: {
        text: 'wkwk iya bener',
        contextInfo: {
          stanzaId: 'BOTMSG1',
          participant: '628999@s.whatsapp.net',
          quotedMessage: { conversation: 'gas lawan eclipse woy' },
          mentionedJid: ['628999@s.whatsapp.net', '628777@s.whatsapp.net'],
        },
      },
    },
    messageTimestamp: 1_764_000_000,
    pushName: 'Tester FP',
    ...overrides,
  } as WAMessage;
}

describe('quoted-reply and mention extraction', () => {
  it('extracts quoted id, participant, text and mentioned JIDs', () => {
    const norm = normalizeMessage(groupReplyMsg());
    expect(norm).not.toBeNull();
    expect(norm!.quotedId).toBe('BOTMSG1');
    expect(norm!.quotedParticipant).toBe('628999@s.whatsapp.net');
    expect(norm!.quotedText).toBe('gas lawan eclipse woy');
    expect(norm!.mentionedJids).toEqual(['628999@s.whatsapp.net', '628777@s.whatsapp.net']);
    // mentionsMe is set by the service, not the pure normalizer.
    expect(norm!.mentionsMe).toBeUndefined();
  });

  it('leaves the fields undefined for plain messages', () => {
    const norm = normalizeMessage({
      key: { id: 'P1', remoteJid: '120363@g.us', participant: '628111@s.whatsapp.net', fromMe: false },
      message: { conversation: 'halo semua' },
      messageTimestamp: 1_764_000_000,
    } as WAMessage);
    expect(norm!.quotedId).toBeUndefined();
    expect(norm!.mentionedJids).toBeUndefined();
  });

  it('unwraps quoted messages nested in view-once wrappers', () => {
    const msg = groupReplyMsg();
    const quoted = msg.message!.extendedTextMessage!.contextInfo!.quotedMessage!;
    (msg.message!.extendedTextMessage!.contextInfo as Record<string, unknown>).quotedMessage = {
      viewOnceMessageV2: { message: { conversation: 'hidden quote' } },
    };
    void quoted;
    const norm = normalizeMessage(msg);
    expect(norm!.quotedText).toBe('hidden quote');
    // Sanity: the unwrap helper alone agrees.
    expect(
      extractText(unwrapMessage({ viewOnceMessageV2: { message: { conversation: 'x' } } })),
    ).toBe('x');
  });

  it('matches bot JIDs loosely across device suffixes and digit forms', () => {
    expect(sameJidUser('628123456789:12@s.whatsapp.net', '628123456789@s.whatsapp.net')).toBe(true);
    expect(sameJidUser('628123456789@s.whatsapp.net', '628123456789@s.whatsapp.net')).toBe(true);
    expect(sameJidUser('628123456789@s.whatsapp.net', '628987654321@s.whatsapp.net')).toBe(false);
    expect(sameJidUser('', '628123456789@s.whatsapp.net')).toBe(false);
  });
});

function extractText(message: ReturnType<typeof unwrapMessage>): string | null {
  if (!message) return null;
  if (message.conversation != null) return message.conversation;
  return message.extendedTextMessage?.text ?? null;
}

describe('quoted-reply resolution against the message store', () => {
  let db: Client;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'omak-quoted-'));
    db = createClient({ url: `file:${join(dir, 'q.db')}` });
    await runMigrations(db);
    await insertMessages(db, [
      {
        id: 'BOTMSG1',
        chatJid: '120363@g.us',
        senderJid: 'bot@s.whatsapp.net',
        text: 'gas lawan eclipse woy',
        msgType: 'conversation',
        isFromMe: true,
        timestamp: 1_764_000_000_000,
      },
    ]);
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a quoted id to the bot message (reply-to-me)', async () => {
    const quoted = await getMessageById(db, '120363@g.us', 'BOTMSG1');
    expect(quoted?.isFromMe).toBe(true);
    expect(quoted?.text).toBe('gas lawan eclipse woy');
    expect(await getMessageById(db, '120363@g.us', 'NOPE')).toBeNull();
    // Wrong chat must not resolve.
    expect(await getMessageById(db, '999@g.us', 'BOTMSG1')).toBeNull();
  });
});
