import { isBnd4, readBnd4Entries } from './bnd4.ts';
import { verifyEntryChecksum } from './checksum.ts';
import type { ContainerReader, DecryptedEntry } from './container.ts';
import { decryptEntry } from './crypto.ts';
import { SaveFormatError } from './errors.ts';

/** PC save (NR0000.sl2, or Seamless Co-op's NR0000.co2): BND4 of AES-128-CBC entries. */
export const pcContainer: ContainerReader = {
  platform: 'pc',
  detect: isBnd4,
  async readEntries(bytes, indices) {
    const table = readBnd4Entries(bytes);
    // Decrypt in parallel: WebCrypto runs these off the JS thread.
    return Promise.all(
      indices.map(async (index): Promise<DecryptedEntry> => {
        const entry = table[index];
        if (!entry) throw new SaveFormatError(`Save has no entry ${index}.`);
        let data: Uint8Array;
        try {
          data = await decryptEntry(bytes.subarray(entry.offset, entry.offset + entry.size));
        } catch (cause) {
          throw new SaveFormatError(`Could not decrypt entry ${index}.`, { cause });
        }
        return { index, data, checksumOk: verifyEntryChecksum(data) };
      }),
    );
  },
};
