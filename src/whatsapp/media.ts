import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';

/**
 * Download media from a message into a Buffer. Returns null when the message
 * carries no downloadable media or the download fails — callers decide whether
 * that is fatal (sticker intake) or ignorable (plain chat).
 */
export async function downloadMediaBuffer(msg: WAMessage): Promise<Buffer | null> {
  try {
    const result = (await downloadMediaMessage(msg, 'buffer', {})) as unknown as
      | Buffer
      | Uint8Array
      | null;
    if (!result) return null;
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  } catch {
    return null;
  }
}
