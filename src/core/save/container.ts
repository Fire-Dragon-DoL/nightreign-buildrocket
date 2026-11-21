import type { Platform } from './types.ts';

/**
 * A save container is the platform-specific wrapping around the game's
 * entries (PC: BND4 + AES; PlayStation memory.dat: raw, not yet supported).
 *
 * Every container reader yields entries in the same "decrypted PC layout"
 * (4-byte prefix + body + 16-byte MD5), so the entry parsers in slot.ts and
 * profile.ts never need to know which platform the file came from. Adding a
 * platform means adding a ContainerReader and registering it in read-save.ts.
 */
export interface DecryptedEntry {
  index: number;
  data: Uint8Array;
  checksumOk: boolean;
}

export interface ContainerReader {
  platform: Platform;
  /** Cheap check on the raw bytes (magic / size) — no decryption. */
  detect(bytes: Uint8Array): boolean;
  /** Decrypt the requested entries (by index). */
  readEntries(bytes: Uint8Array, indices: readonly number[]): Promise<DecryptedEntry[]>;
}
