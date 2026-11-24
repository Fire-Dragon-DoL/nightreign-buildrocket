import { describe, expect, it } from 'vitest';
import { comboRoll, type EffectNeed, type Need } from './config.ts';
import { buildEffectIndex } from './effects.ts';
import { defaultMinLevel, mergeNeeds, needKey, withDefaultLevels } from './needs.ts';

const index = buildEffectIndex();

const effect = (id: number, extra: Partial<EffectNeed> = {}): EffectNeed => ({
  kind: 'effect',
  effect: id,
  copies: 1,
  colorScope: 'perColor',
  colors: ['Red'],
  importance: 'normal',
  ...extra,
});

/** A self-stacking effect above its family's lowest level, and the lowest level. */
function stackingAboveLowest() {
  for (const m of index.all()) {
    if (!index.stacks(m.id, m.id)) continue;
    const lowest = Math.min(
      ...index
        .family(m.family)
        .filter((f) => f.pool === m.pool || f.pool === 'any')
        .map((f) => f.level),
    );
    if (lowest < m.level) return { id: m.id, lowest };
  }
  throw new Error('no stacking family with several levels');
}

describe('default levels', () => {
  it('an effect that stacks with itself accepts its family lowest level', () => {
    const { id, lowest } = stackingAboveLowest();
    expect(defaultMinLevel(index, id)).toBe(lowest);
    expect(withDefaultLevels(effect(id), index)).toMatchObject({ minLevel: lowest });
  });

  it('an effect that does not stack with itself keeps its exact level', () => {
    expect(index.stacks(7000090, 7000090)).toBe(false);
    expect(defaultMinLevel(index, 7000090)).toBeUndefined();
  });

  it('levels already set are left alone', () => {
    const { id } = stackingAboveLowest();
    const meta = index.meta(id);
    const need = effect(id, { minLevel: meta?.level ?? 0 });
    expect(withDefaultLevels(need, index)).toBe(need);
  });
});

describe('merging needs', () => {
  it('the same need keeps the most copies and the highest importance, never the sum', () => {
    const a = effect(7000090, { copies: 2, importance: 'high' });
    const b = effect(7000090, { copies: 1, importance: 'mustKeep' });
    const { needs, added, updated } = mergeNeeds([a], [b]);
    expect(added).toBe(0);
    expect(updated).toBe(1);
    expect(needs).toEqual([{ ...a, copies: 2, importance: 'mustKeep' }]);
  });

  it('different colors, levels or relic kinds are different needs', () => {
    const base = effect(7000090);
    const others: Need[] = [
      effect(7000090, { colors: ['Blue'] }),
      effect(7000090, { minLevel: 0 }),
      effect(7000090, { relics: 'deep' }),
    ];
    for (const o of others) expect(needKey(o)).not.toBe(needKey(base));
    expect(mergeNeeds([base], others).needs).toHaveLength(4);
  });

  it('the same need written differently is still the same need', () => {
    const index = buildEffectIndex();
    const MAGIC_2 = 7001502;
    const level = index.meta(MAGIC_2)?.level ?? 0;
    // Own level set explicitly vs left unset; every color ticked vs none.
    expect(needKey(effect(MAGIC_2, { minLevel: level, colors: [] }), index)).toBe(
      needKey(effect(MAGIC_2, { colors: ['Red', 'Blue', 'Yellow', 'Green'] }), index),
    );
    // A lower level or "only" is a different need.
    expect(needKey(effect(MAGIC_2, { minLevel: 0 }), index)).not.toBe(
      needKey(effect(MAGIC_2), index),
    );
    expect(needKey(effect(MAGIC_2, { exactLevel: true }), index)).not.toBe(
      needKey(effect(MAGIC_2), index),
    );
  });

  it('reports duplicates, also repeated inside what is added', () => {
    const a = effect(7000090, { copies: 2 });
    const r = mergeNeeds(
      [a],
      [a, effect(7000091), effect(7000091), effect(7000090, { copies: 3 })],
    );
    expect(r.outcomes).toEqual(['duplicate', 'added', 'duplicate', 'updated']);
    expect([r.added, r.updated, r.duplicates]).toEqual([1, 1, 2]);
  });

  it('combos match whatever the order of their effects', () => {
    const combo = (effects: number[]): Need => ({
      kind: 'combo',
      effects,
      copies: 1,
      colorScope: 'any',
      importance: 'normal',
    });
    expect(needKey(combo([1, 2]))).toBe(needKey(combo([2, 1])));
  });
});

describe('combo terms', () => {
  it('a 2-slot combo is a good roll, 3 slots a godroll', () => {
    const combo = (effects: number[], anyOf?: number[][]) =>
      ({
        kind: 'combo',
        effects,
        ...(anyOf ? { anyOf } : {}),
        copies: 1,
        colorScope: 'any',
        importance: 'normal',
      }) as const;
    expect(comboRoll(combo([1, 2]))).toBe('goodRoll');
    expect(comboRoll(combo([1], [[2, 3]]))).toBe('goodRoll');
    expect(comboRoll(combo([1, 2], [[3, 4]]))).toBe('godroll');
    expect(comboRoll(combo([1]))).toBeNull();
  });
});
