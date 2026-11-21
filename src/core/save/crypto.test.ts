import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptEntry, encryptEntry } from './crypto.ts';
import { PC_AES_KEY } from './format.ts';

describe('entry crypto', () => {
  it('decrypts data encrypted by an independent AES-128-CBC implementation', async () => {
    const iv = new Uint8Array(16).map((_, i) => i * 3);
    const plain = new Uint8Array(100).map((_, i) => i);
    const cipher = createCipheriv('aes-128-cbc', PC_AES_KEY, iv);
    const blob = Buffer.concat([iv, cipher.update(plain), cipher.final()]);
    expect(await decryptEntry(new Uint8Array(blob))).toEqual(plain);
  });

  it('round-trips through encryptEntry', async () => {
    const iv = new Uint8Array(16).fill(7);
    // Game entries leave 12 bytes for padding: plain length = 16n + 4.
    const plain = new Uint8Array(0x24).map((_, i) => 255 - i);
    const blob = await encryptEntry(iv, plain);
    expect(blob.length).toBe(16 + 0x30);
    expect(blob.subarray(0, 16)).toEqual(iv);
    expect(await decryptEntry(blob)).toEqual(plain);
  });

  it('fails on ciphertext with invalid padding', async () => {
    await expect(decryptEntry(new Uint8Array(48))).rejects.toThrow();
  });
});
