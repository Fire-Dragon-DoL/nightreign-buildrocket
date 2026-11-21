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
  it('round-trips', () => {
    const doc = toBuildsDocument(
      extractCharacterBuilds(character),
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(parseBuildsDocument(JSON.stringify(doc))).toEqual(doc);
  });

  it.each([
    ['not json', 'Not valid JSON'],
    ['{"format":"other"}', 'Not a Nightreign Buildrocket builds file'],
    ['{"format":"nightreign-buildrocket/builds","version":2,"builds":[]}', 'Unsupported version'],
    ['{"format":"nightreign-buildrocket/builds","version":1}', 'Missing builds'],
  ])('rejects %s', (json, message) => {
    expect(() => parseBuildsDocument(json)).toThrow(BuildsDocumentError);
    expect(() => parseBuildsDocument(json)).toThrow(message);
  });
});
