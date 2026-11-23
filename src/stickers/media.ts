import sharp from 'sharp';

const STICKER_SIZE = 512;

/**
 * Convert any image into a WhatsApp-ready sticker: 512x512 inside-fit on a
 * transparent canvas, WEBP. Runs on the ephemeral local disk of the Koyeb
 * instance only — the resulting bytes go straight to the DB.
 */
export async function toStickerWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(STICKER_SIZE, STICKER_SIZE, {
      fit: 'inside',
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 90 })
    .toBuffer();
}
