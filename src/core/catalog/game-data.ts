/**
 * Raw game data files from data/game/ (see data/game/README.md).
 */
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
  tables: Record<string, number>;
  pools: number[][];
  effects: Record<string, [number, number]>;
}

export const rawRelicEffects = relicEffects as RawRelicEffects;
// JSON imports type tuples as number[]; the file is generated, so trust its shape.
export const rawRollRules = rollRules as unknown as RawRollRules;
