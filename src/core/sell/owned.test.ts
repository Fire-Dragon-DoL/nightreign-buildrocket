import { describe, expect, it } from 'vitest';
import type { RelicSpec } from '../builds/builds.ts';
import { countEffects, leftAfter, ownedCounts } from './owned.ts';

const RED = 102;
const BLUE = 111;
const MAGIC_2 = 7001502;
const FIRE_4 = 6001601;

const relic = (itemId: number, effects: number[]): RelicSpec => ({
  itemId,
  effects: [effects[0] ?? null, effects[1] ?? null, effects[2] ?? null],
  curses: [null, null, null],
});

describe('owned effects per color', () => {
  const pool = [relic(RED, [MAGIC_2]), relic(RED, [MAGIC_2, FIRE_4]), relic(BLUE, [MAGIC_2])];

  it('counts relics carrying each effect, per color', () => {
    const owned = ownedCounts(pool);
    expect(owned.get(MAGIC_2)).toEqual([2, 1, 0, 0]);
    expect(owned.get(FIRE_4)).toEqual([1, 0, 0, 0]);
  });

  it('says how many are left after selling some', () => {
    const owned = ownedCounts(pool);
    const sold = countEffects([{ spec: relic(RED, [MAGIC_2]), count: 2 }]);
    expect(leftAfter(owned, sold, MAGIC_2)).toEqual([
      { owned: 2, left: 0 },
      { owned: 1, left: 1 },
      { owned: 0, left: 0 },
      { owned: 0, left: 0 },
    ]);
  });
});
