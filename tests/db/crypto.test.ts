import { describe, expect, it } from 'vitest';
import { decryptText, deriveKey, encryptText } from '../../src/db/crypto.js';

const KEY32 = Buffer.alloc(32, 7).toString('base64'); // proper 32-byte key
const PASSPHRASE = 'some memorable passphrase';

describe('deriveKey', () => {
  it('uses a 32-byte base64 key as-is', () => {
    const key = deriveKey(KEY32);
    expect(key.length).toBe(32);
    expect(key.equals(Buffer.alloc(32, 7))).toBe(true);
  });

  it('hashes non-32-byte input to 32 bytes', () => {
    const key = deriveKey(PASSPHRASE);
    expect(key.length).toBe(32);
    expect(deriveKey(PASSPHRASE).equals(key)).toBe(true);
  });
});

describe('encryptText / decryptText', () => {
  it('round-trips utf-8 text', () => {
    const key = deriveKey(KEY32);
    const text = 'wkwkwk 🗿 1234567890';
    const enc = encryptText(key, text);
    expect(enc).not.toContain(text);
    expect(decryptText(key, enc)).toBe(text);
  });

  it('produces different ciphertexts per call (random IV)', () => {
    const key = deriveKey(KEY32);
    expect(encryptText(key, 'same')).not.toBe(encryptText(key, 'same'));
  });

  it('throws when decrypting with the wrong key', () => {
    const enc = encryptText(deriveKey(KEY32), 'secret');
    expect(() => decryptText(deriveKey('another-key-material'), enc)).toThrow();
  });

  it('throws when the payload is tampered', () => {
    const key = deriveKey(KEY32);
    const enc = encryptText(key, 'secret');
    const buf = Buffer.from(enc, 'base64');
    const lastIdx = buf.length - 1;
    buf[lastIdx] = (buf[lastIdx] ?? 0) ^ 0xff;
    expect(() => decryptText(key, buf.toString('base64'))).toThrow();
  });
});
