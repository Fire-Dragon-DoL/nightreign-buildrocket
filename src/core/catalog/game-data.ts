/**
 * Raw game data files from data/game/. The always-present file is imported
 * statically; local-only files are picked up with import.meta.glob, which
 * yields nothing (instead of failing the build) when the file is missing.
 * See data/game/README.md.
 */
import relicEffects from '../../../data/game/relic_effects.json';

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

const optional = import.meta.glob<RawRollRules>('../../../data/game/relic_effects_allowlist.json', {
  eager: true,
  import: 'default',
});

export const rawRelicEffects = relicEffects as RawRelicEffects;

/** Roll rules, or undefined when the local-only file is not present. */
export const rawRollRules: RawRollRules | undefined = Object.values(optional)[0];
