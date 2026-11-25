import { describe, expect, it } from 'vitest';
import { gatewayEventToWAMessage } from '../../src/whatsapp/service.js';
import { normalizeMessage } from '../../src/whatsapp/normalize.js';
import type { GatewayMessageEvent } from '../../src/whatsapp/gateway-client.js';

function ev(partial: Partial<GatewayMessageEvent>): GatewayMessageEvent {
  return {
    t: 'msg',
    id: '3EBTEST',
    ts: 1_795_581_000, // seconds — what the gateway actually sends
    from: '120363411005527783@g.us',
    sender: '165210883154071@lid',
    isGroup: true,
    fromMe: false,
    text: 'wok',
    ...partial,
  };
}

describe('gatewayEventToWAMessage', () => {
  it('keeps SECONDS timestamps intact so normalizeMessage lands on real ms', () => {
    // The live bug: the gateway forwards Baileys' messageTimestamp (seconds),
    // the old adapter divided by 1000 again and every inbound message was
    // persisted at epoch 1970 — invisible to history, purged by retention.
    const waMsg = gatewayEventToWAMessage(ev({}));
    const norm = normalizeMessage(waMsg);
    expect(norm).not.toBeNull();
    expect(norm!.timestamp).toBe(1_795_581_000_000);
  });

  it('normalizes millisecond timestamps from fallback paths', () => {
    const waMsg = gatewayEventToWAMessage(ev({ ts: 1_795_581_000_000 }));
    const norm = normalizeMessage(waMsg);
    expect(norm!.timestamp).toBe(1_795_581_000_000);
  });

  it('maps pushName (root first, then raw) so history shows names, not LIDs', () => {
    const a = normalizeMessage(gatewayEventToWAMessage(ev({ pushName: 'Ciboy' })));
    expect(a!.pushName).toBe('Ciboy');
    const b = normalizeMessage(
      gatewayEventToWAMessage(ev({ raw: { key: undefined, message: undefined, pushName: 'Arya' } })),
    );
    expect(b!.pushName).toBe('Arya');
    const c = normalizeMessage(gatewayEventToWAMessage(ev({ pushName: '', raw: { pushName: 'Biapis' } })));
    expect(c!.pushName).toBe('Biapis');
  });

  it('prefers the raw Baileys key so PN↔LID alternates survive', () => {
    const waMsg = gatewayEventToWAMessage(
      ev({
        raw: {
          key: {
            remoteJid: '120363411005527783@g.us',
            remoteJidAlt: '120363411005527783@lid',
            id: '3EBTEST',
            fromMe: false,
            participant: '165210883154071@lid',
            participantAlt: '6289505630895@s.whatsapp.net',
          },
          message: { conversation: 'wok' },
        },
      }),
    );
    const norm = normalizeMessage(waMsg);
    expect(norm!.senderJid).toBe('165210883154071@lid');
    expect(norm!.senderJidAlt).toBe('6289505630895@s.whatsapp.net');
    expect(norm!.chatJidAlt).toBe('120363411005527783@lid');
  });

  it('falls back to a synthesized key when raw is absent', () => {
    const norm = normalizeMessage(gatewayEventToWAMessage(ev({ raw: undefined })));
    expect(norm!.chatJid).toBe('120363411005527783@g.us');
    expect(norm!.senderJid).toBe('165210883154071@lid');
    expect(norm!.text).toBe('wok');
  });

  it('synthesizes conversation text when raw.message is missing but text exists', () => {
    const norm = normalizeMessage(
      gatewayEventToWAMessage(ev({ text: 'halo', raw: { key: undefined, message: undefined } })),
    );
    expect(norm!.text).toBe('halo');
  });
});
