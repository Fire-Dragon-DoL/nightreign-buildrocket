import { IV_SIZE, PC_AES_KEY } from './format.ts';

/**
 * AES-128-CBC through WebCrypto. Available in Chrome on file:// (it is a
 * secure context), in workers created from it, and in Node 22+.
 *
 * Entries are PKCS#7 padded (the game leaves 12 bytes of 0x0C), so WebCrypto
 * can decrypt them directly and strips the padding for us.
 */

// Saves are never in a SharedArrayBuffer; WebCrypto's types insist on ArrayBuffer.
const buf = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;

let keyPromise: Promise<CryptoKey> | undefined;

function pcKey(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey('raw', buf(PC_AES_KEY), 'AES-CBC', false, [
    'encrypt',
    'decrypt',
  ]);
  return keyPromise;
}

/** Decrypt one encrypted entry blob: 16-byte IV followed by ciphertext. */
export async function decryptEntry(blob: Uint8Array): Promise<Uint8Array> {
  const iv = blob.subarray(0, IV_SIZE);
  const ciphertext = blob.subarray(IV_SIZE);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: buf(iv) },
    await pcKey(),
    buf(ciphertext),
  );
  return new Uint8Array(plain);
}

/** Inverse of {@link decryptEntry}. Returns IV + ciphertext. */
export async function encryptEntry(iv: Uint8Array, plain: Uint8Array): Promise<Uint8Array> {
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv: buf(iv) }, await pcKey(), buf(plain)),
  );
  const out = new Uint8Array(IV_SIZE + ciphertext.length);
  out.set(iv);
  out.set(ciphertext, IV_SIZE);
  return out;
}
