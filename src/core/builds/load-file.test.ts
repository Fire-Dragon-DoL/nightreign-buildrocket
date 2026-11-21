import { describe, expect, it } from 'vitest';
import { buildProfile, buildSaveFile, buildSlot } from '../../../test/helpers/save-builder.ts';
import { toBuildsDocument } from './builds-json.ts';
import { inventoriesOf } from './characters.ts';
import { loadBuildsOrSave } from './load-file.ts';

const RELIC = 0xc0800054;
const OTHER = 0xc0800055;

async function save() {
  return buildSaveFile({
    1: buildSlot({
      name: 'Alice',
      relics: [
        { handle: RELIC, itemId: 1003201, effects: [7036400, null, null] },
        { handle: OTHER, itemId: 100, effects: [7000000, null, null] },
      ],
      presets: [
        { heroId: 6, name: 'Build', vesselId: 6000, relics: [RELIC, null, null, null, null, null] },
      ],
    }),
    10: buildProfile(76561198000000001n),
  });
}

const encode = (text: string) => new TextEncoder().encode(text);

describe('loadBuildsOrSave', () => {
  it('reads a save: builds plus every owned relic', async () => {
    const file = await loadBuildsOrSave(await save());
    expect(file.kind).toBe('save');
    expect(file.characters).toHaveLength(1);
    const [alice] = file.characters;
    expect(alice?.key).toBe('slot:1');
    expect(alice?.label).toBe('Alice (slot 2)');
    expect(alice?.builds.map((b) => b.name)).toEqual(['Build']);
    expect(alice?.relics?.map((r) => r.itemId).sort()).toEqual([100, 1003201]);
  });

  it('reads a builds JSON (with a BOM) and keeps the exported inventory', async () => {
    const fromSave = await loadBuildsOrSave(await save());
    const chars = fromSave.characters;
    const doc = toBuildsDocument(
      chars.flatMap((c) => c.builds),
      inventoriesOf(chars),
    );
    const file = await loadBuildsOrSave(encode(`﻿  ${JSON.stringify(doc)}`));
    expect(file.kind).toBe('builds');
    expect(file.characters).toEqual([{ ...chars[0], key: 'json:Alice', label: 'Alice' }]);
  });

  it('marks inventory as unknown for builds files without one', async () => {
    const fromSave = await loadBuildsOrSave(await save());
    const doc = toBuildsDocument(fromSave.characters.flatMap((c) => c.builds));
    expect(doc.inventories).toBeUndefined();
    const file = await loadBuildsOrSave(encode(JSON.stringify(doc)));
    expect(file.characters[0]?.relics).toBeNull();
  });

  it('rejects anything else', async () => {
    await expect(loadBuildsOrSave(encode('hello'))).rejects.toThrow(
      'not a Nightreign PC save or a Buildrocket builds JSON',
    );
  });
});
