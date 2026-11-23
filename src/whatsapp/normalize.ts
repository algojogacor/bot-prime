import type { proto, WAMessage } from '@whiskeysockets/baileys';

/** Message wrappers that nest the real content one level deeper. */
const WRAPPERS: (keyof proto.IMessage)[] = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
];

/** Peel view-once / ephemeral / doc-with-caption wrappers off an incoming message. */
export function unwrapMessage(
  message: proto.IMessage | undefined | null,
): proto.IMessage | undefined {
  let current = message ?? undefined;
  for (let depth = 0; depth < 6 && current; depth++) {
    let next: proto.IMessage | undefined;
    for (const wrapperKey of WRAPPERS) {
      const wrapper = current[wrapperKey] as { message?: proto.IMessage } | undefined;
      if (wrapper?.message) {
        next = wrapper.message;
        break;
      }
    }
    if (!next) return current;
    current = next;
  }
  return current;
}

/** Pull displayable text out of an already-unwrapped message, with its Baileys type. */
export function extractContent(
  message: proto.IMessage,
): { type: string; text: string | null } {
  if (message.conversation != null) return { type: 'conversation', text: message.conversation };
  const extended = message.extendedTextMessage;
  if (extended?.text != null) return { type: 'extendedTextMessage', text: extended.text };
  if (message.imageMessage)
    return { type: 'imageMessage', text: message.imageMessage.caption ?? null };
  if (message.videoMessage)
    return { type: 'videoMessage', text: message.videoMessage.caption ?? null };
  if (message.documentMessage)
    return { type: 'documentMessage', text: message.documentMessage.caption ?? null };
  if (message.stickerMessage) return { type: 'stickerMessage', text: null };
  if (message.audioMessage) return { type: 'audioMessage', text: null };
  if (message.buttonsResponseMessage?.selectedDisplayText != null) {
    return {
      type: 'buttonsResponseMessage',
      text: message.buttonsResponseMessage.selectedDisplayText,
    };
  }
  if (message.listResponseMessage?.title != null) {
    return { type: 'listResponseMessage', text: message.listResponseMessage.title };
  }
  if (message.reactionMessage) {
    return { type: 'reactionMessage', text: message.reactionMessage.text ?? null };
  }

  const keys = Object.keys(message).filter((k) => k !== 'contextInfo');
  return { type: keys[0] ?? 'unknown', text: null };
}

export type NormalizedMessage = {
  id: string;
  chatJid: string;
  /** The alternate form (PN ↔ LID) Baileys supplies, when present. */
  chatJidAlt?: string;
  isGroup: boolean;
  /** LID or PN depending on what WhatsApp addressed us with. */
  senderJid: string;
  senderJidAlt?: string;
  isFromMe: boolean;
  text: string | null;
  type: string;
  pushName?: string;
  /** Quoted/reply context, when the message replies to something. */
  quotedId?: string;
  quotedParticipant?: string;
  quotedText?: string;
  /** Participant JIDs explicitly @-mentioned in the message. */
  mentionedJids?: string[];
  /** True when the bot itself is among the mentioned JIDs (set by the service). */
  mentionsMe?: boolean;
  /** ms epoch */
  timestamp: number;
};

/** Map a raw Baileys message to the normalized shape the rest of the bot works with. */
export function normalizeMessage(raw: WAMessage): NormalizedMessage | null {
  const key = raw.key;
  if (!key?.id || !key.remoteJid) return null;

  const message = unwrapMessage(raw.message);
  if (!message) return null;

  const chatJid = key.remoteJid;
  const isGroup = chatJid.endsWith('@g.us');
  const senderJid = isGroup ? (key.participant ?? chatJid) : chatJid;
  const senderJidAlt = isGroup
    ? (key.participantAlt ?? undefined)
    : (key.remoteJidAlt ?? undefined);

  const rawTs = raw.messageTimestamp;
  const seconds =
    typeof rawTs === 'number'
      ? rawTs
      : typeof (rawTs as { toNumber?: unknown } | undefined)?.toNumber === 'function'
        ? (rawTs as unknown as { toNumber: () => number }).toNumber()
        : 0;
  const timestamp = seconds * 1000;

  const { type, text } = extractContent(message);

  // Quoted/reply + mention context (extended text, media captions, docs).
  const contextInfo =
    message.extendedTextMessage?.contextInfo ??
    message.imageMessage?.contextInfo ??
    message.videoMessage?.contextInfo ??
    message.documentMessage?.contextInfo;
  const quotedId = contextInfo?.stanzaId || undefined;
  const quotedParticipant = contextInfo?.participant || undefined;
  let quotedText: string | undefined;
  if (contextInfo?.quotedMessage) {
    const inner = unwrapMessage(contextInfo.quotedMessage);
    if (inner) quotedText = extractContent(inner).text ?? undefined;
  }
  const mentionedJids = (contextInfo?.mentionedJid ?? []).filter(
    (j): j is string => typeof j === 'string' && j.length > 0,
  );

  return {
    id: key.id,
    chatJid,
    chatJidAlt: key.remoteJidAlt ?? undefined,
    isGroup,
    senderJid,
    senderJidAlt,
    isFromMe: key.fromMe === true,
    text,
    type,
    pushName: raw.pushName || undefined,
    quotedId,
    quotedParticipant,
    quotedText,
    mentionedJids: mentionedJids.length > 0 ? mentionedJids : undefined,
    timestamp,
  };
}
