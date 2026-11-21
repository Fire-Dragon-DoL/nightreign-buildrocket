import { describe, expect, it } from 'vitest';
import type { CharacterSlot } from '../save/types.ts';
import { extractCharacterBuilds, specKey } from './builds.ts';
import { BuildsDocumentError, parseBuildsDocument, toBuildsDocument } from './builds-json.ts';

const character: CharacterSlot = {
  index: 0,
  name: 'Tester',
  playTimeMs: 0,
  murk: 0,
  sigs: 0,
  heroes: [],
  relics: [
    {
      handle: 1,
      itemId: 100,
      effects: [7000000, null, null],
      curses: [null, null, null],
      favorite: false,
      isNew: false,
      acquisitionId: 0,
    },
    {
      handle: 2,
      itemId: 2000,
      effects: [6000000, 6000001, null],
      curses: [6850000, null, null],
      favorite: true,
      isNew: false,
      acquisitionId: 1,
    },
  ],
  presets: [
    {
      index: 1,
      heroId: 2,
      name: 'Second hero',
      vesselId: 2000,
      relics: [1, null, null, null, null, null],
      recency: 0,
      timestamp: '0',
    },
    {
      index: 0,
      heroId: 1,
      name: 'Older',
      vesselId: 1000,
      relics: [1, null, null, 2, null, 999],
      recency: 1,
      timestamp: '0',
    },
    {
      index: 2,
      heroId: 1,
      name: 'Newer',
      vesselId: 1001,
      relics: [null, null, null, null, null, null],
      recency: 0,
      timestamp: '0',
    },
  ],
};

describe('extractCharacterBuilds', () => {
  it('orders builds by hero, then most recent first', () => {
    expect(extractCharacterBuilds(character).map((b) => b.name)).toEqual([
      'Newer',
      'Older',
      'Second hero',
    ]);
  });

  it('resolves relic handles into handle-free specs; unknown handles become null', () => {
    const older = extractCharacterBuilds(character).find((b) => b.name === 'Older');
    expect(older).toEqual({
      character: 'Tester',
      heroId: 1,
      name: 'Older',
      vesselId: 1000,
      relics: [
        { itemId: 100, effects: [7000000, null, null], curses: [null, null, null] },
        null,
        null,
        { itemId: 2000, effects: [6000000, 6000001, null], curses: [6850000, null, null] },
        null,
        null,
      ],
    });
  });
});

describe('specKey', () => {
  it('is equal for identical relics and differs when any effect differs', () => {
    const a = { itemId: 1, effects: [1, 2, null], curses: [null, null, null] } as const;
    const b = { itemId: 1, effects: [1, 2, null], curses: [null, null, null] } as const;
    const c = { itemId: 1, effects: [1, 3, null], curses: [null, null, null] } as const;
    expect(specKey({ ...a, effects: [...a.effects], curses: [...a.curses] })).toBe(
      specKey({ ...b, effects: [...b.effects], curses: [...b.curses] }),
    );
    expect(specKey({ ...a, effects: [...a.effects], curses: [...a.curses] })).not.toBe(
      specKey({ ...c, effects: [...c.effects], curses: [...c.curses] }),
    );
  });
});

describe('builds JSON document', () => {
  const builds = extractCharacterBuilds(character);
  const doc = toBuildsDocument(builds, [], new Date('2026-01-01T00:00:00Z'));

  it('writes every game id as { id, name }', () => {
    expect(doc.version).toBe(2);
    const older = doc.builds.find((b) => b.name === 'Older');
    expect(older?.hero).toEqual({ id: 1, name: 'Wylder' });
    expect(older?.vessel).toEqual({ id: 1000, name: "[Wylder] Wylder's Urn" });
    expect(older?.relics[0]).toEqual({
      relic: { id: 100, name: 'Delicate Burning Scene' },
      effects: [{ id: 7000000, name: expect.any(String) }, null, null],
      curses: [null, null, null],
    });
    expect(older?.relics[3]?.curses[0]).toEqual({ id: 6850000, name: expect.any(String) });
    expect(older?.relics[1]).toBeNull();
  });

  it('round-trips to the same builds', () => {
    expect(parseBuildsDocument(JSON.stringify(doc))).toEqual({
      exportedAt: '2026-01-01T00:00:00.000Z',
      builds,
      inventories: [],
    });
  });

  it('round-trips inventories, written with names', () => {
    const relics = character.relics.map(({ itemId, effects, curses }) => ({
      itemId,
      effects,
      curses,
    }));
    const withInventory = toBuildsDocument(builds, [{ character: 'Tester', relics }]);
    expect(withInventory.version).toBe(2);
    expect(withInventory.inventories?.[0]?.relics[0]?.relic).toEqual({
      id: 100,
      name: 'Delicate Burning Scene',
    });
    expect(parseBuildsDocument(JSON.stringify(withInventory)).inventories).toEqual([
      { character: 'Tester', relics },
    ]);
  });

  it('accepts ids without names', () => {
    const stripped = JSON.parse(JSON.stringify(doc), (key, value) =>
      key === 'name' &&
      typeof value === 'string' &&
      value !== 'Older' &&
      value !== 'Newer' &&
      value !== 'Second hero'
        ? undefined
        : value,
    );
    expect(parseBuildsDocument(JSON.stringify(stripped)).builds).toEqual(builds);
  });

  it('still reads version 1 files (plain ids)', () => {
    const v1 = { format: 'nightreign-buildrocket/builds', version: 1, exportedAt: 'x', builds };
    expect(parseBuildsDocument(JSON.stringify(v1)).builds).toEqual(builds);
  });

  it.each([
    ['not json', 'Not valid JSON'],
    ['{"format":"other"}', 'Not a Nightreign Buildrocket builds file'],
    ['{"format":"nightreign-buildrocket/builds","version":3,"builds":[]}', 'Unsupported version'],
    ['{"format":"nightreign-buildrocket/builds","version":2}', 'Missing builds'],
    [
      '{"format":"nightreign-buildrocket/builds","version":2,"builds":[{"hero":{},"vessel":{"id":1}}]}',
      'Missing id for hero',
    ],
  ])('rejects %s', (json, message) => {
    expect(() => parseBuildsDocument(json)).toThrow(BuildsDocumentError);
    expect(() => parseBuildsDocument(json)).toThrow(message);
  });
});
