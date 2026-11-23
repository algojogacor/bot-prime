import { describe, expect, it } from 'vitest';
import type { WAMessage } from '@whiskeysockets/baileys';
import { normalizeMessage, unwrapMessage, extractContent } from '../../src/whatsapp/normalize.js';

function wa(overrides: Record<string, unknown>): WAMessage {
  return overrides as unknown as WAMessage;
}

describe('unwrapMessage', () => {
  it('peels ephemeral and view-once wrappers', () => {
    const inner = { conversation: 'wkwk' };
    const wrapped = {
      ephemeralMessage: { message: { viewOnceMessageV2: { message: inner } } },
    };
    expect(unwrapMessage(wrapped as never)).toBe(inner as never);
  });

  it('returns the message as-is when unwrapped', () => {
    const direct = { conversation: 'gas' };
    expect(unwrapMessage(direct as never)).toBe(direct as never);
  });

  it('survives undefined', () => {
    expect(unwrapMessage(undefined)).toBeUndefined();
  });
});

describe('extractContent', () => {
  it('extracts plain conversation text', () => {
    expect(extractContent({ conversation: 'halo' } as never)).toEqual({
      type: 'conversation',
      text: 'halo',
    });
  });

  it('extracts reply text and captions', () => {
    expect(
      extractContent({ extendedTextMessage: { text: 'jir' } } as never),
    ).toEqual({ type: 'extendedTextMessage', text: 'jir' });
    expect(
      extractContent({ imageMessage: { caption: '🗿' } } as never),
    ).toEqual({ type: 'imageMessage', text: '🗿' });
  });

  it('maps media without text to null text', () => {
    expect(extractContent({ stickerMessage: {} } as never)).toEqual({
      type: 'stickerMessage',
      text: null,
    });
    expect(extractContent({ audioMessage: { ptt: true } } as never)).toEqual({
      type: 'audioMessage',
      text: null,
    });
  });

  it('falls back to the first non-context key', () => {
    const res = extractContent({ protocolMessage: { type: 1 } } as never);
    expect(res.type).toBe('protocolMessage');
    expect(res.text).toBeNull();
  });
});

describe('normalizeMessage', () => {
  it('normalizes a group message with participant and LID alt fields', () => {
    const msg = wa({
      key: {
        remoteJid: '123456@g.us',
        fromMe: false,
        id: 'ABC123',
        participant: '999@lid',
        participantAlt: '628999@s.whatsapp.net',
      },
      message: { conversation: 'wok spar jam berapa' },
      messageTimestamp: 1_700_000_000,
      pushName: 'Arya',
    });

    const norm = normalizeMessage(msg);
    expect(norm).toMatchObject({
      id: 'ABC123',
      chatJid: '123456@g.us',
      isGroup: true,
      senderJid: '999@lid',
      senderJidAlt: '628999@s.whatsapp.net',
      isFromMe: false,
      text: 'wok spar jam berapa',
      type: 'conversation',
      pushName: 'Arya',
      timestamp: 1_700_000_000_000,
    });
  });

  it('normalizes a DM using remoteJid as sender and remoteJidAlt as alt', () => {
    const msg = wa({
      key: {
        remoteJid: '628888@s.whatsapp.net',
        remoteJidAlt: '777@lid',
        fromMe: true,
        id: 'DM1',
      },
      message: { extendedTextMessage: { text: 'gas' } },
      messageTimestamp: 1_700_000_001,
    });

    const norm = normalizeMessage(msg);
    expect(norm).toMatchObject({
      chatJid: '628888@s.whatsapp.net',
      chatJidAlt: '777@lid',
      isGroup: false,
      senderJid: '628888@s.whatsapp.net',
      senderJidAlt: '777@lid',
      isFromMe: true,
      text: 'gas',
    });
  });

  it('unwraps ephemeral content before extraction', () => {
    const msg = wa({
      key: { remoteJid: '628888@s.whatsapp.net', fromMe: false, id: 'E1' },
      message: { ephemeralMessage: { message: { conversation: 'view once wkwk' } } },
      messageTimestamp: 1_700_000_002,
    });
    expect(normalizeMessage(msg)?.text).toBe('view once wkwk');
  });

  it('supports Long-like timestamps', () => {
    const msg = wa({
      key: { remoteJid: 'x@s.whatsapp.net', fromMe: false, id: 'L1' },
      message: { conversation: 'ts' },
      messageTimestamp: { toNumber: () => 1_700_000_003 },
    });
    expect(normalizeMessage(msg)?.timestamp).toBe(1_700_000_003_000);
  });

  it('returns null for protocol-only payloads and keyless messages', () => {
    expect(normalizeMessage(wa({ key: { remoteJid: 'x@s.whatsapp.net', id: 'P1' } }))).toBeNull();
    expect(
      normalizeMessage(
        wa({
          key: { remoteJid: 'x@s.whatsapp.net', id: 'P2' },
          message: { protocolMessage: { type: 1 } },
        }),
      ),
    ).toMatchObject({ type: 'protocolMessage' });
    expect(normalizeMessage(wa({ key: { id: 'P3' } }))).toBeNull();
  });
});
