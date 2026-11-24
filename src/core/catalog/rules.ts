/**
 * Relic roll rules: which effects a relic can roll, and whether a relic's
 * effects are a combination the game can produce.
 *
 * Model (data/game/relic_effects_allowlist.json, see data/game/README.md):
 * - Every relic lists one effect table per effect slot; a table is a pool of
 *   effects that slot can roll. A relic whose tables each hold one effect is
 *   "fixed" (boss/event relics); otherwise it is "random".
 * - Deep relics roll from the deep pools instead: effects from the
 *   "needs curse" pool always carry a curse (from the curse pool) in the same
 *   row, other deep effects carry none.
 * - On any relic: no effect twice, and no two effects sharing a
 *   compatibility id.
 */
import type { RawRollRules } from './game-data.ts';

export type RelicKind = 'unknown' | 'unobtainable' | 'deep' | 'fixed' | 'random';

export type RelicIssueCode =
  | 'unknown'
  | 'unobtainable'
  | 'duplicate'
  | 'compatibility'
  | 'count'
  | 'pool'
  | 'curse'
  | 'pairing'
  | 'fixed';

export interface RelicIssue {
  code: RelicIssueCode;
  /** Effect (or curse) id the issue is about, when there is one. */
  effectId?: number;
}

export interface RelicEffects {
  itemId: number;
  effects: readonly (number | null)[];
  curses: readonly (number | null)[];
}

export interface RollRules {
  relicKind(itemId: number): RelicKind;
  /** Number of effect slots, 0 for relics without effects or unknown ones. */
  slotCount(itemId: number): number;
  /** Every effect the relic can roll, or undefined when unknown. */
  rollableEffects(itemId: number): ReadonlySet<number> | undefined;
  /**
   * Which kinds of random relics can roll the effect: normal ones, Deep of Night ones, both, or
   * neither (fixed-effect relics only, or unknown).
   */
  rollsOn(effectId: number): { normal: boolean; deep: boolean };
  /** Compatibility id of an effect; -1 = compatible with everything. */
  compatibilityId(effectId: number): number | undefined;
  needsCurse(effectId: number): boolean;
  isCurse(effectId: number): boolean;
  /** False for relics the game won't let you sell (Night boss, quest and fixed-effect relics). */
  isSellable(itemId: number): boolean;
  /** Rules the relic breaks; empty when the game can roll it. */
  check(relic: RelicEffects): RelicIssue[];
}

export function createRollRules(
  raw: RawRollRules,
  isDeepRelic: (itemId: number) => boolean,
): RollRules {
  const poolCache = new Map<number, ReadonlySet<number> | null>();
  const pool = (tableId: number): ReadonlySet<number> | null => {
    let cached = poolCache.get(tableId);
    if (cached === undefined) {
      const index = raw.tables[tableId];
      const effects = index === undefined ? undefined : raw.pools[index];
      cached = effects ? new Set(effects) : null;
      poolCache.set(tableId, cached);
    }
    return cached;
  };
  const union = (sets: readonly (ReadonlySet<number> | null)[]): Set<number> => {
    const out = new Set<number>();
    for (const set of sets) for (const id of set ?? []) out.add(id);
    return out;
  };

  const needsCursePool = pool(raw.deep_pools.needs_curse) ?? new Set<number>();
  const otherDeepPool = union(raw.deep_pools.other.map(pool));
  const cursePool = pool(raw.deep_pools.curses) ?? new Set<number>();
  const deepPool: ReadonlySet<number> = union([needsCursePool, otherDeepPool]);

  const slotTables = (itemId: number) => raw.relics[itemId];
  const compatibilityId = (effectId: number) => raw.effects[effectId]?.[0];

  const relicKind = (itemId: number): RelicKind => {
    const tables = slotTables(itemId);
    if (!tables) return 'unknown';
    const pools = tables.map(pool);
    if (pools.some((p) => p === null)) return 'unobtainable';
    if (isDeepRelic(itemId)) return 'deep';
    return pools.every((p) => p?.size === 1) ? 'fixed' : 'random';
  };

  const rollableEffects = (itemId: number): ReadonlySet<number> | undefined => {
    const kind = relicKind(itemId);
    if (kind === 'deep') return deepPool;
    if (kind === 'fixed' || kind === 'random') return union((slotTables(itemId) ?? []).map(pool));
    return undefined;
  };

  /** Can each effect go to a different slot whose pool holds it? (≤ 3 slots, brute force) */
  const assignable = (effects: number[], pools: ReadonlySet<number>[], used = 0): boolean => {
    const [first, ...rest] = effects;
    if (first === undefined) return true;
    return pools.some(
      (p, i) => !(used & (1 << i)) && p.has(first) && assignable(rest, pools, used | (1 << i)),
    );
  };

  const check = (relic: RelicEffects): RelicIssue[] => {
    const kind = relicKind(relic.itemId);
    if (kind === 'unknown' || kind === 'unobtainable') return [{ code: kind }];

    const issues: RelicIssue[] = [];
    const effects = relic.effects.filter((e): e is number => e !== null);
    const curses = relic.curses.filter((c): c is number => c !== null);

    for (const id of [...effects, ...curses]) {
      if (compatibilityId(id) === undefined) issues.push({ code: 'unknown', effectId: id });
    }
    if (new Set(effects).size !== effects.length || new Set(curses).size !== curses.length) {
      issues.push({ code: 'duplicate' });
    }
    const groups = new Map<number, number>();
    for (const id of effects) {
      const group = compatibilityId(id);
      if (group === undefined || group === -1) continue;
      const other = groups.get(group);
      if (other !== undefined && other !== id) issues.push({ code: 'compatibility', effectId: id });
      groups.set(group, id);
    }
    if (effects.length !== slotCount(relic.itemId)) issues.push({ code: 'count' });

    if (kind === 'deep') {
      for (const id of effects) if (!deepPool.has(id)) issues.push({ code: 'pool', effectId: id });
      relic.effects.forEach((effect, row) => {
        const curse = relic.curses[row] ?? null;
        if (curse !== null && !cursePool.has(curse))
          issues.push({ code: 'curse', effectId: curse });
        if (effect === null) {
          if (curse !== null) issues.push({ code: 'pairing', effectId: curse });
        } else if (needsCursePool.has(effect) !== (curse !== null)) {
          issues.push({ code: 'pairing', effectId: effect });
        }
      });
      return issues;
    }

    if (curses.length > 0) issues.push({ code: 'curse' });
    const pools = (slotTables(relic.itemId) ?? []).map(pool) as ReadonlySet<number>[];
    if (kind === 'fixed') {
      const expected = pools.map((p) => [...p][0]).sort();
      if ([...effects].sort().join() !== expected.join()) issues.push({ code: 'fixed' });
      return issues;
    }
    const all = union(pools);
    const outside = effects.filter((id) => !all.has(id));
    for (const id of outside) issues.push({ code: 'pool', effectId: id });
    if (outside.length === 0 && effects.length <= pools.length && !assignable(effects, pools)) {
      issues.push({ code: 'pool' });
    }
    return issues;
  };

  const slotCount = (itemId: number) => slotTables(itemId)?.length ?? 0;
  const unsellable = new Set(raw.unsellable);

  // Everything random normal relics can roll (built on first use).
  let normalPool: Set<number> | null = null;
  const normalRollable = (): ReadonlySet<number> => {
    if (!normalPool) {
      normalPool = new Set<number>();
      for (const itemId of Object.keys(raw.relics).map(Number)) {
        if (relicKind(itemId) !== 'random') continue;
        for (const id of rollableEffects(itemId) ?? []) normalPool.add(id);
      }
    }
    return normalPool;
  };

  return {
    relicKind,
    slotCount,
    rollableEffects,
    rollsOn: (id) => ({ normal: normalRollable().has(id), deep: deepPool.has(id) }),
    compatibilityId,
    needsCurse: (id) => needsCursePool.has(id),
    isCurse: (id) => cursePool.has(id),
    isSellable: (itemId) => !unsellable.has(itemId),
    check,
  };
}
