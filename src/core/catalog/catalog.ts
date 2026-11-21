/**
 * Game data catalog: names and properties of relics, effects, vessels, heroes.
 * Source: data/game/relic_effects.json (see data/game/README.md).
 */
import {
  type RawEffectDetails,
  type RawRelicEffects,
  type RawRollRules,
  rawEffectDetails,
  rawRelicEffects,
  rawRollRules,
} from './game-data.ts';
import { createRollRules, type RollRules } from './rules.ts';

/** Relic / vessel slot colors as stored in the data. */
export const RelicColor = { Red: 0, Blue: 1, Yellow: 2, Green: 3, Any: 4 } as const;
export type RelicColor = (typeof RelicColor)[keyof typeof RelicColor];
export const RELIC_COLOR_NAMES: Record<RelicColor, string> = {
  0: 'Red',
  1: 'Blue',
  2: 'Yellow',
  3: 'Green',
  4: 'Any',
};

export const HEROES: Readonly<Record<number, string>> = {
  1: 'Wylder',
  2: 'Guardian',
  3: 'Ironeye',
  4: 'Duchess',
  5: 'Raider',
  6: 'Revenant',
  7: 'Recluse',
  8: 'Executor',
  9: 'Scholar',
  10: 'Undertaker',
};

export type EffectTier = 'normal' | 'deep' | 'special' | 'curse';

export interface RelicInfo {
  id: number;
  name: string;
  deep: boolean;
  color: RelicColor;
}

export interface EffectInfo {
  id: number;
  name: string;
  tier: EffectTier;
  /** Hero ids (1-10) that can use this effect. */
  heroes: number[];
  /** Some relic can carry it (false: only in the names file, on no relic). */
  used: boolean;
  /** Rolls on random relics (false: only fixed on unique relics, or used nowhere). */
  rolls: boolean;
  /** The effect it is identical to in game (same SpEffects), when this id is an alias. */
  same?: number;
  /** In-game relic search filter it falls under, when known. */
  filter?: number;
}

export interface VesselInfo {
  id: number;
  name: string;
  /** Hero id, or 11 for vessels usable by everyone. */
  hero: number;
  /** Colors of normal relic slots 0-2. */
  slots: [RelicColor, RelicColor, RelicColor];
  /** Colors of deep relic slots 3-5. */
  deepSlots: [RelicColor, RelicColor, RelicColor];
}

export interface Catalog {
  relic(id: number): RelicInfo | undefined;
  effect(id: number): EffectInfo | undefined;
  /** The id an effect counts as: itself, or the effect it is an alias of. */
  canonicalEffect(id: number): number;
  /** Name of an in-game relic search filter. */
  filterName(id: number): string | undefined;
  vessel(id: number): VesselInfo | undefined;
  relics(): Iterable<RelicInfo>;
  effects(): Iterable<EffectInfo>;
  vessels(): Iterable<VesselInfo>;
}

/**
 * Community names, cleaned to read like the official ones: no "[Relic]" prefix, "[Relic - Hero]"
 * becomes "[Hero]", and "- " (their stand-in for a comma) becomes ", ".
 */
export const cleanEffectName = (name: string): string =>
  name
    .replace(/^\[(?:Special )?Relic - (\w+)\]\s*/, '[$1] ')
    .replace(/^\[(?:Special )?Relic\]\s*/, '')
    .replace(/- /g, ', ')
    .replace(/\.$/, '');

/**
 * Identical effects the extracted data can't prove identical, confirmed by the owner: unique-relic
 * copies that apply the regular effect plus one extra hidden SpEffect (a marker, not a change).
 */
const CONFIRMED_ALIASES: Record<number, number> = {
  11002: 7032400, // Silver Tear: [Wylder] Art gauge greatly filled when ability is activated (+9760)
  10001: 7032200, // Taking attacks improves attack power (+7032201, +9762)
};

const HERO_IDS: Record<string, number> = Object.fromEntries(
  Object.entries(HEROES).map(([id, name]) => [name, Number(id)]),
);
const ALL_HEROES = Object.keys(HEROES).map(Number);

/** Tier of an effect known only from the game data: from the pools it rolls in. */
function tierFromPools(
  id: number,
  rules: RawRollRules,
  deep: Set<number>,
  curses: Set<number>,
): EffectTier {
  if (curses.has(id)) return 'curse';
  if (deep.has(id)) return 'deep';
  return rules.pools.some((pool) => pool.length > 1 && pool.includes(id)) ? 'normal' : 'special';
}

export function buildCatalog(
  data: RawRelicEffects,
  rules: RawRollRules = rawRollRules,
  details: RawEffectDetails = rawEffectDetails,
): Catalog {
  const relics = new Map<number, RelicInfo>();
  for (const [id, r] of Object.entries(data.relics)) {
    relics.set(Number(id), {
      id: Number(id),
      name: r.name,
      deep: r.deep,
      color: r.color as RelicColor,
    });
  }
  // Which effects relics can carry, and which roll on random relics (from the game's tables).
  const used = new Set<number>();
  const rolls = new Set<number>();
  for (const pool of rules.pools) {
    for (const id of pool) {
      used.add(id);
      if (pool.length > 1) rolls.add(id);
    }
  }
  const poolOf = (table: number) => rules.pools[rules.tables[String(table)] ?? -1] ?? [];
  const curses = new Set(poolOf(rules.deep_pools.curses));
  const deep = new Set([rules.deep_pools.needs_curse, ...rules.deep_pools.other].flatMap(poolOf));

  const effects = new Map<number, EffectInfo>();
  for (const [id, e] of Object.entries(data.effects)) {
    const n = Number(id);
    const heroes = e.heroes.flatMap((allowed, i) => (allowed ? [i + 1] : []));
    effects.set(n, {
      id: n,
      name: cleanEffectName(e.name),
      tier: e.tier as EffectTier,
      heroes,
      used: used.has(n),
      rolls: rolls.has(n),
    });
  }
  // Official data, when extracted: names (also for effects the names file lacks), aliases, filters.
  for (const [id, d] of Object.entries(details.effects)) {
    const n = Number(id);
    const known = effects.get(n);
    const heroes = d.heroes.length ? d.heroes.flatMap((h) => HERO_IDS[h] ?? []) : ALL_HEROES;
    const info: EffectInfo = {
      id: n,
      // Official name; the game's text lacks some (DLC heroes): fall back to the community one.
      name: d.name?.replace(/\.$/, '') ?? known?.name ?? `Unknown effect (${n})`,
      tier: known?.tier ?? (d.debuff ? 'curse' : tierFromPools(n, rules, deep, curses)),
      heroes: known && !d.heroes.length ? known.heroes : heroes,
      used: used.has(n),
      rolls: rolls.has(n),
      filter: d.filter,
    };
    effects.set(n, info);
  }
  // Aliases: one effect per group of ids the game treats the same. It is stored under one that
  // rolls on random relics, else a regular (7-digit) id, else the lowest.
  const groups = new Map<number, number[]>();
  const sameAs: [number, number][] = [
    ...Object.entries(details.effects).flatMap(([id, d]) =>
      d.same === undefined ? [] : [[Number(id), d.same] as [number, number]],
    ),
    ...Object.entries(CONFIRMED_ALIASES).map(
      ([id, same]) => [Number(id), same] as [number, number],
    ),
  ];
  for (const [id, same] of sameAs) {
    if (!effects.has(id) || !effects.has(same)) continue;
    const group = groups.get(same) ?? [same];
    group.push(id);
    groups.set(same, group);
  }
  for (const ids of groups.values()) {
    const rank = (id: number) => [rolls.has(id) ? 0 : 1, id >= 1_000_000 ? 0 : 1, id] as const;
    const canonical = [...ids].sort((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    })[0] as number;
    for (const id of ids) {
      const info = effects.get(id);
      if (info && id !== canonical) info.same = canonical;
      else if (info) delete info.same;
    }
  }
  const vessels = new Map<number, VesselInfo>();
  for (const [id, v] of Object.entries(data.vessels)) {
    vessels.set(Number(id), {
      id: Number(id),
      name: v.name,
      hero: v.hero,
      slots: v.slots as VesselInfo['slots'],
      deepSlots: v.deep as VesselInfo['deepSlots'],
    });
  }
  return {
    relic: (id) => relics.get(id),
    effect: (id) => effects.get(id),
    canonicalEffect: (id) => effects.get(id)?.same ?? id,
    filterName: (id) => details.filters[String(id)]?.name ?? undefined,
    vessel: (id) => vessels.get(id),
    relics: () => relics.values(),
    effects: () => effects.values(),
    vessels: () => vessels.values(),
  };
}

let defaultCatalog: Catalog | undefined;

/** The catalog built from the bundled data (built once, lazily). */
export function catalog(): Catalog {
  defaultCatalog ??= buildCatalog(rawRelicEffects);
  return defaultCatalog;
}

export const relicName = (id: number): string =>
  catalog().relic(id)?.name ?? `Unknown relic (${id})`;
export const effectName = (id: number): string =>
  catalog().effect(id)?.name ?? `Unknown effect (${id})`;
export const vesselName = (id: number): string =>
  catalog().vessel(id)?.name ?? `Unknown vessel (${id})`;
export const heroName = (id: number): string => HEROES[id] ?? `Unknown hero (${id})`;

let defaultRules: RollRules | undefined;

/** Roll rules from the bundled game data (built once, lazily). */
export function rollRules(): RollRules {
  defaultRules ??= createRollRules(rawRollRules, (id) => catalog().relic(id)?.deep ?? false);
  return defaultRules;
}
