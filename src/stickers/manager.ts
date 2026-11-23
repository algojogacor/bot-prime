import type { Client } from '@libsql/client';
import { addSticker, putBlob, getBlob, findStickerByName } from '../db/repos/stickers.js';
import { toStickerWebp } from './media.js';

/** Full intake path: image bytes → sticker webp → blob → sticker row. */
export async function addStickerFromImage(
  db: Client,
  opts: { image: Buffer; name: string; tags?: string[]; pack?: string; addedBy?: string },
): Promise<{ name: string; size: number }> {
  const webp = await toStickerWebp(opts.image);
  const blobId = await putBlob(db, webp, 'image/webp');
  await addSticker(db, {
    name: opts.name.toLowerCase().replace(/\s+/g, '-'),
    tags: opts.tags?.map((t) => t.toLowerCase()),
    pack: opts.pack,
    blobId,
    addedBy: opts.addedBy,
  });
  return { name: opts.name.toLowerCase().replace(/\s+/g, '-'), size: webp.length };
}

/** Load a sticker's webp bytes for sending. */
export async function loadStickerBytes(
  db: Client,
  name: string,
): Promise<Buffer | null> {
  const sticker = await findStickerByName(db, name);
  if (!sticker) return null;
  const blob = await getBlob(db, sticker.blobId);
  return blob?.data ?? null;
}
