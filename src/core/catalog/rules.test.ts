import { describe, expect, it } from 'vitest';
import type { RawRollRules } from './game-data.ts';
import { createRollRules } from './rules.ts';

// Tiny hand-made rule set:
//   relic 100: random, 2 slots from tables 1 (A, B) and 2 (C)
//   relic 200: fixed, 1 slot from table 3 (D)
//   relic 300: placeholder pointing at a missing table
//   relic 2000: deep, 3 slots; relic 2001: deep, 2 slots; effect X needs a curse, Y does not
const A = 7000;
const B = 7001;
const C = 7002;
const D = 7003;
const X = 6000;
const Y = 6001;
const CURSE = 6800;
const raw: RawRollRules = {
  deep_pools: { needs_curse: 10, other: [11], curses: 12 },
  legacy_tables: [],
  relics: { 100: [1, 2], 200: [3], 300: [99], 2000: [10, 11, 11], 2001: [10, 11] },
  tables: { 1: 0, 2: 1, 3: 2, 10: 3, 11: 4, 12: 5 },
  pools: [[A, B], [C], [D], [X], [Y], [CURSE]],
  effects: {
    [A]: [50, 1],
    [B]: [50, 1], // same compatibility id as A
    [C]: [-1, 1],
    [D]: [-1, 1],
    [X]: [-1, 1],
    [Y]: [-1, 1],
    [CURSE]: [-1, 1],
  },
};
const rules = createRollRules(raw, (id) => id >= 2000);
const codes = (itemId: number, effects: (number | null)[], curses: (number | null)[] = []) =>
  rules.check({ itemId, effects, curses }).map((i) => i.code);

describe('relic roll rules', () => {
  it('classifies relics', () => {
    expect(rules.relicKind(100)).toBe('random');
    expect(rules.relicKind(200)).toBe('fixed');
    expect(rules.relicKind(300)).toBe('unobtainable');
    expect(rules.relicKind(2000)).toBe('deep');
    expect(rules.relicKind(42)).toBe('unknown');
    expect(rules.slotCount(100)).toBe(2);
  });

  it('lists rollable effects', () => {
    expect([...(rules.rollableEffects(100) ?? [])].sort()).toEqual([A, B, C]);
    expect([...(rules.rollableEffects(2000) ?? [])].sort()).toEqual([X, Y]);
    expect(rules.rollableEffects(300)).toBeUndefined();
  });

  it('accepts relics the game can roll', () => {
    expect(codes(100, [A, C, null])).toEqual([]);
    expect(codes(100, [C, B, null])).toEqual([]);
    expect(codes(200, [D, null, null])).toEqual([]);
    expect(codes(2001, [X, Y, null], [CURSE, null, null])).toEqual([]);
  });

  it('checks deep relic curse pairing', () => {
    expect(codes(2000, [X, Y, null], [CURSE, null, null])).toEqual(['count']);
    expect(codes(2000, [X, null, null], [null, null, null])).toContain('pairing');
    expect(codes(2000, [Y, null, null], [CURSE, null, null])).toContain('pairing');
    expect(codes(2000, [null, null, null], [CURSE, null, null])).toContain('pairing');
  });

  it('rejects broken combinations', () => {
    expect(codes(100, [A, B, null])).toEqual(['compatibility', 'pool']);
    expect(codes(100, [A, A, null])).toContain('duplicate');
    expect(codes(100, [A, D, null])).toEqual(['pool']);
    expect(codes(100, [A, null, null])).toEqual(['count']);
    expect(codes(100, [A, C, null], [CURSE, null, null])).toEqual(['curse']);
    expect(codes(200, [C, null, null])).toEqual(['fixed']);
    expect(codes(300, [A, null, null])).toEqual(['unobtainable']);
    expect(codes(100, [A, 123, null])).toContain('unknown');
  });

  it('knows curses', () => {
    expect(rules.isCurse(CURSE)).toBe(true);
    expect(rules.needsCurse(X)).toBe(true);
    expect(rules.needsCurse(Y)).toBe(false);
    expect(rules.compatibilityId(A)).toBe(50);
  });
});
