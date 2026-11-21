import { ascii, assertRange, u32, u64, utf16, viewOf } from '../binary/bytes.ts';
import { SaveFormatError } from './errors.ts';
import { BND4_ENTRY_HEADER_SIZE, BND4_HEADER_SIZE, BND4_MAGIC } from './format.ts';

export interface Bnd4Entry {
  index: number;
  name: string;
  /** Absolute offset of the entry data in the container. */
  offset: number;
  size: number;
}

export function isBnd4(bytes: Uint8Array): boolean {
  return bytes.length >= BND4_HEADER_SIZE && ascii(bytes, 0, 4) === BND4_MAGIC;
}

/** Read the BND4 entry table. Does not copy or decrypt any entry data. */
export function readBnd4Entries(bytes: Uint8Array): Bnd4Entry[] {
  if (!isBnd4(bytes)) throw new SaveFormatError('Not a BND4 container (bad magic).');
  const view = viewOf(bytes);
  const count = u32(view, 0x0c);
  const entryHeaderSize = Number(u64(view, 0x20));
  if (entryHeaderSize !== BND4_ENTRY_HEADER_SIZE) {
    throw new SaveFormatError(`Unsupported BND4 entry header size ${entryHeaderSize}.`);
  }
  assertRange(view, BND4_HEADER_SIZE, count * entryHeaderSize);

  const entries: Bnd4Entry[] = [];
  for (let i = 0; i < count; i++) {
    const base = BND4_HEADER_SIZE + i * entryHeaderSize;
    const size = Number(u64(view, base + 0x08));
    const offset = u32(view, base + 0x10);
    const nameOffset = u32(view, base + 0x14);
    if (offset + size > bytes.length) {
      throw new SaveFormatError(`BND4 entry ${i} points past the end of the file.`);
    }
    const name = nameOffset > 0 && nameOffset < bytes.length ? utf16(bytes, nameOffset, 32) : '';
    entries.push({ index: i, name, offset, size });
  }
  return entries;
}
