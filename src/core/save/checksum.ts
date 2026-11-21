import { md5 } from '../binary/md5.ts';
import { ENTRY_CHECKSUM_SIZE, ENTRY_PREFIX_SIZE } from './format.ts';

/** Range of a decrypted entry covered by its MD5. */
function hashedRange(plain: Uint8Array): Uint8Array {
  return plain.subarray(ENTRY_PREFIX_SIZE, plain.length - ENTRY_CHECKSUM_SIZE);
}

export function computeEntryChecksum(plain: Uint8Array): Uint8Array {
  return md5(hashedRange(plain));
}

export function verifyEntryChecksum(plain: Uint8Array): boolean {
  if (plain.length < ENTRY_PREFIX_SIZE + ENTRY_CHECKSUM_SIZE) return false;
  const expected = computeEntryChecksum(plain);
  const stored = plain.subarray(plain.length - ENTRY_CHECKSUM_SIZE);
  for (let i = 0; i < ENTRY_CHECKSUM_SIZE; i++) if (expected[i] !== stored[i]) return false;
  return true;
}

/** Write the MD5 into the last 16 bytes of a decrypted entry (in place). */
export function writeEntryChecksum(plain: Uint8Array): void {
  plain.set(computeEntryChecksum(plain), plain.length - ENTRY_CHECKSUM_SIZE);
}
