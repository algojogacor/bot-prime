import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Normalize the configured key into 32 bytes. A base64-encoded 32-byte value
 * (recommended: `openssl rand -base64 32`) is used as-is; anything else is
 * treated as a passphrase and hashed once with SHA-256.
 */
export function deriveKey(base64Key: string): Buffer {
  const raw = Buffer.from(base64Key, 'base64');
  return raw.length === 32 ? raw : createHash('sha256').update(raw).digest();
}

/** Encrypt UTF-8 text → base64(iv(12) | authTag(16) | ciphertext). */
export function encryptText(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/** Decrypt base64(iv | authTag | ciphertext) → UTF-8 text. Throws on tamper. */
export function decryptText(key: Buffer, payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
