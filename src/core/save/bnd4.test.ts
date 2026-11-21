import { describe, expect, it } from 'vitest';
import { buildSaveFile } from '../../../test/helpers/save-builder.ts';
import { isBnd4, readBnd4Entries } from './bnd4.ts';
import { SaveFormatError } from './errors.ts';

describe('BND4 container', () => {
  it('lists the 14 entries of a save with names, offsets and sizes', async () => {
    const file = await buildSaveFile({});
    const entries = readBnd4Entries(file);
    expect(entries).toHaveLength(14);
    expect(entries[0]).toMatchObject({ index: 0, name: 'USER_DATA000', size: 0x100030 });
    expect(entries[10]).toMatchObject({ name: 'USER_DATA010', size: 0x60030 });
    for (const e of entries) expect(e.offset + e.size).toBeLessThanOrEqual(file.length);
  });

  it('detects the magic', async () => {
    expect(isBnd4(await buildSaveFile({}))).toBe(true);
    expect(isBnd4(new Uint8Array(0x40))).toBe(false);
    expect(isBnd4(new Uint8Array(3))).toBe(false);
  });

  it('rejects non-BND4 data', () => {
    expect(() => readBnd4Entries(new Uint8Array(0x100))).toThrow(SaveFormatError);
  });

  it('rejects an entry that points past the end of the file', async () => {
    const file = await buildSaveFile({});
    const truncated = file.subarray(0, file.length - 1);
    expect(() => readBnd4Entries(truncated)).toThrow(/past the end/);
  });
});
