import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { addStickerFromImage, loadStickerBytes } from '../../src/stickers/manager.js';
import { deleteSticker, matchStickerByText } from '../../src/db/repos/stickers.js';
import sharp from 'sharp';

let db: ReturnType<typeof createDb>;

beforeEach(async () => {
  db = createDb(':memory:');
  await runMigrations(db);
});

async function samplePng(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 4, background: '#204060' } })
    .png()
    .toBuffer();
}

describe('sticker pipeline', () => {
  it('converts images to webp stickers stored as DB blobs', async () => {
    const { name, size } = await addStickerFromImage(db, {
      image: await samplePng(),
      name: 'Moai Gag',
      tags: ['🗿', 'deadpan'],
    });
    expect(name).toBe('moai-gag');
    expect(size).toBeGreaterThan(100);

    const bytes = await loadStickerBytes(db, 'moai-gag');
    expect(bytes).toBeTruthy();
    expect(bytes?.slice(8, 12).toString()).toBe('WEBP');
  });

  it('matches stickers by exact token against names and tags', async () => {
    await addStickerFromImage(db, {
      image: await samplePng(),
      name: 'moai-gag',
      tags: ['🗿'],
    });
    expect(await matchStickerByText(db, 'wkwk 🗿 gas')).toBe('moai-gag');
    expect(await matchStickerByText(db, 'moai-gag')).toBe('moai-gag');
    expect(await matchStickerByText(db, 'ga ada matches wkwk')).toBeNull();
  });

  it('deletes stickers and their blobs', async () => {
    await addStickerFromImage(db, { image: await samplePng(), name: 'temp' });
    expect(await deleteSticker(db, 'temp')).toBe(true);
    expect(await loadStickerBytes(db, 'temp')).toBeNull();
    expect(await deleteSticker(db, 'temp')).toBe(false);
  });
});
