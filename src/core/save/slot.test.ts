import { describe, expect, it } from 'vitest';
import { buildEmptySlot, buildSlot } from '../../../test/helpers/save-builder.ts';
import { SaveFormatError } from './errors.ts';
import { parseCharacterSlot } from './slot.ts';

const RELIC_A = 0xc0800054;
const RELIC_B = 0xc0800055;
const STALE = 0xc0800b26;

const slotWithRelics = () =>
  buildSlot({
    name: 'Francesco',
    playTimeMs: 123_456,
    murk: 220_535,
    sigs: 281,
    // A weapon (88 bytes) and an armor piece (16 bytes) before the relics
    // check that record sizes are honoured.
    otherItems: [
      { handle: 0x80800001, size: 88 },
      { handle: 0x90800002, size: 16 },
    ],
    relics: [
      { handle: RELIC_A, itemId: 1007012, effects: [7036400, 7340500, 7001402], favorite: true },
      {
        handle: RELIC_B,
        itemId: 2011011,
        effects: [6001401, 6002701, null],
        curses: [6850900, 6820200, null],
        isNew: true,
        acquisitionId: 42,
      },
      { handle: STALE, itemId: 2070, owned: false },
    ],
    presets: [
      {
        heroId: 6,
        name: 'gflame 1',
        vesselId: 6000,
        relics: [RELIC_A, null, null, RELIC_B, null, null],
        recency: 1,
        timestamp: 134_000_000_000_000_000n,
      },
      {
        index: 5,
        heroId: 7,
        name: 'sorc',
        vesselId: 7006,
        relics: [RELIC_A, 0, 0, 0, 0, 0],
        recency: 0,
      },
    ],
    heroes: { 6: { currentPresetIndex: 0, currentVesselId: 6006 } },
  });

describe('parseCharacterSlot', () => {
  it('returns null for an unused slot', () => {
    expect(parseCharacterSlot(buildEmptySlot(), 3)).toBeNull();
  });

  it('reads the character header fields', () => {
    const slot = parseCharacterSlot(slotWithRelics(), 0);
    expect(slot).toMatchObject({
      index: 0,
      name: 'Francesco',
      playTimeMs: 123_456,
      murk: 220_535,
      sigs: 281,
    });
  });

  it('reads owned relics with effects, curses and inventory flags', () => {
    const slot = parseCharacterSlot(slotWithRelics(), 0);
    expect(slot?.relics).toEqual([
      {
        handle: RELIC_A,
        itemId: 1007012,
        effects: [7036400, 7340500, 7001402],
        curses: [null, null, null],
        favorite: true,
        isNew: false,
        acquisitionId: 0,
      },
      {
        handle: RELIC_B,
        itemId: 2011011,
        effects: [6001401, 6002701, null],
        curses: [6850900, 6820200, null],
        favorite: false,
        isNew: true,
        acquisitionId: 42,
      },
    ]);
  });

  it('ignores relic states that are not in the inventory', () => {
    const slot = parseCharacterSlot(slotWithRelics(), 0);
    expect(slot?.relics.map((r) => r.handle)).not.toContain(STALE);
  });

  it('reads presets, skipping empty preset slots, with empty relic slots as null', () => {
    const slot = parseCharacterSlot(slotWithRelics(), 0);
    expect(slot?.presets).toEqual([
      {
        index: 0,
        heroId: 6,
        name: 'gflame 1',
        vesselId: 6000,
        relics: [RELIC_A, null, null, RELIC_B, null, null],
        recency: 1,
        timestamp: '134000000000000000',
      },
      {
        index: 5,
        heroId: 7,
        name: 'sorc',
        vesselId: 7006,
        relics: [RELIC_A, null, null, null, null, null],
        recency: 0,
        timestamp: '0',
      },
    ]);
  });

  it('reads every hero with 4 universal + 7 own vessels', () => {
    const slot = parseCharacterSlot(slotWithRelics(), 0);
    expect(slot?.heroes).toHaveLength(10);
    const revenant = slot?.heroes.find((h) => h.heroId === 6);
    expect(revenant).toMatchObject({ currentPresetIndex: 0, currentVesselId: 6006 });
    expect(revenant?.vessels.map((v) => v.vesselId)).toEqual([
      19000, 19001, 19002, 19010, 6000, 6001, 6002, 6003, 6004, 6005, 6006,
    ]);
    expect(slot?.heroes.find((h) => h.heroId === 1)?.currentPresetIndex).toBeNull();
  });

  it('refuses a layout where the loadout chunk is not where expected', () => {
    const data = buildSlot({ name: 'x', breakLoadoutChunk: true });
    expect(() => parseCharacterSlot(data, 0)).toThrow(SaveFormatError);
  });

  it('reads a full 16-character name', () => {
    const slot = parseCharacterSlot(buildSlot({ name: 'ABCDEFGHIJKLMNOP' }), 0);
    expect(slot?.name).toBe('ABCDEFGHIJKLMNOP');
  });
});
