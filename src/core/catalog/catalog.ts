/**
 * Game data catalog: names and properties of relics, effects, vessels, heroes.
 * Source: data/game/relic_effects.json (see data/game/README.md).
 */
import { type RawRelicEffects, rawRelicEffects, rawRollRules } from './game-data.ts';
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
  vessel(id: number): VesselInfo | undefined;
  relics(): Iterable<RelicInfo>;
  effects(): Iterable<EffectInfo>;
  vessels(): Iterable<VesselInfo>;
}

export function buildCatalog(data: RawRelicEffects): Catalog {
  const relics = new Map<number, RelicInfo>();
  for (const [id, r] of Object.entries(data.relics)) {
    relics.set(Number(id), {
      id: Number(id),
      name: r.name,
      deep: r.deep,
      color: r.color as RelicColor,
    });
  }
  const effects = new Map<number, EffectInfo>();
  for (const [id, e] of Object.entries(data.effects)) {
    const heroes = e.heroes.flatMap((allowed, i) => (allowed ? [i + 1] : []));
    effects.set(Number(id), { id: Number(id), name: e.name, tier: e.tier as EffectTier, heroes });
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
