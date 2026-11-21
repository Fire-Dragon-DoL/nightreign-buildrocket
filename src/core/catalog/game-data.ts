/**
 * Raw game data files from data/game/ (see data/game/README.md).
 */

import effectDetails from '../../../data/game/effect_details.json';
import relicEffects from '../../../data/game/relic_effects.json';
import rollRules from '../../../data/game/relic_effects_allowlist.json';

export interface RawRelicEffects {
  relics: Record<string, { name: string; deep: boolean; color: number }>;
  effects: Record<string, { name: string; tier: string; heroes: number[] }>;
  vessels: Record<string, { name: string; hero: number; slots: number[]; deep: number[] }>;
}

export interface RawRollRules {
  deep_pools: { needs_curse: number; other: number[]; curses: number };
  legacy_tables: number[];
  relics: Record<string, number[]>;
  /** Relic ids the game won't let you sell (`EquipParamAntique.isSalable` = 0). */
  unsellable: number[];
  tables: Record<string, number>;
  pools: number[][];
  effects: Record<string, [number, number]>;
}

export const rawRelicEffects = relicEffects as RawRelicEffects;
// JSON imports type tuples as number[]; the file is generated, so trust its shape.
export const rawRollRules = rollRules as unknown as RawRollRules;

/** data/game/effect_details.json: official names, aliases, search filters (empty until extracted). */
export interface RawEffectDetails {
  effects: Record<
    string,
    {
      name: string | null;
      heroes: string[];
      rolls: boolean;
      filter: number;
      debuff: boolean;
      /** Present on an alias: the effect it is identical to. */
      same?: number;
    }
  >;
  filters: Record<string, { name: string | null; category: number }>;
}

export const rawEffectDetails = effectDetails as unknown as RawEffectDetails;
