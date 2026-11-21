import { describe, expect, it } from 'vitest';
import { buildProfile, buildSaveFile, buildSlot } from '../../../test/helpers/save-builder.ts';
import { SaveFormatError } from './errors.ts';
import { readSaveFile } from './read-save.ts';

describe('readSaveFile', () => {
  it('parses a synthetic save end to end', async () => {
    const file = await buildSaveFile({
      0: buildSlot({ name: 'First', relics: [{ handle: 0xc0800054, itemId: 1007012 }] }),
      4: buildSlot({ name: 'Fifth' }),
      10: buildProfile(76561198000000001n),
    });
    const save = await readSaveFile(file);
    expect(save.platform).toBe('pc');
    expect(save.steamId).toBe('76561198000000001');
    expect(save.characters.map((c) => [c.index, c.name])).toEqual([
      [0, 'First'],
      [4, 'Fifth'],
    ]);
    expect(save.characters[0]?.relics).toHaveLength(1);
    expect(save.checksumMismatches).toEqual([]);
  });

  it('reports entries whose checksum does not match', async () => {
    const file = await buildSaveFile({ 0: buildSlot({ name: 'A' }) }, { corruptChecksumOf: 0 });
    const save = await readSaveFile(file);
    expect(save.checksumMismatches).toEqual([0]);
  });

  it('produces structured-clone and JSON safe output', async () => {
    const save = await readSaveFile(await buildSaveFile({ 0: buildSlot({ name: 'A' }) }));
    expect(structuredClone(save)).toEqual(save);
    expect(JSON.parse(JSON.stringify(save))).toEqual(save);
  });

  it('rejects files that are not saves', async () => {
    await expect(readSaveFile(new TextEncoder().encode('hello'))).rejects.toThrow(SaveFormatError);
  });

  it('rejects a save whose entries cannot be decrypted', async () => {
    const file = await buildSaveFile({});
    const broken = file.slice();
    // Zero the last two blocks of entry 10 so its padding no longer decrypts.
    const view = new DataView(broken.buffer);
    const e10Offset = view.getUint32(0x40 + 10 * 0x20 + 0x10, true);
    const e10Size = Number(view.getBigUint64(0x40 + 10 * 0x20 + 0x08, true));
    broken.fill(0, e10Offset + e10Size - 32, e10Offset + e10Size);
    await expect(readSaveFile(broken)).rejects.toThrow(/decrypt entry 10/);
  });
});
