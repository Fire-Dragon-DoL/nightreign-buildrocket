/**
 * What the Sell Planner knows about effects beyond their names: family and
 * level, which ones stack, and how strong each level is.
 *
 * - Family + level come from the name: "Magic Attack Power Up +3" is level 3
 *   of "Magic Attack Power Up", no suffix is level 0. Normal and deep effects
 *   of one family share the level scale (normal +0..+2, deep +3/+4). When a
 *   normal and a deep effect would land on the same family and level (they
 *   are then different effects with the same name, e.g. "Increased Maximum
 *   HP"), the deep ones get a family of their own. `families` overrides fix
 *   what the name rule gets wrong.
 * - Stacking defaults come from data/sell/effect-rules.json (built from the
 *   community spreadsheet, see tools/sell-rules/). The game data does not
 *   encode stacking: compatibilityId only says what can't share one relic.
 */

import effectRulesJson from '../../../data/sell/effect-rules.json';
import { catalog, type EffectInfo, HEROES } from '../catalog/catalog.ts';

/** Backup weight when the strength of a level is unknown (confirmed by the owner). */
export const FALLBACK_BACKUP_WEIGHT = 0.5;

/** Which relics an effect can be on: normal relics, deep relics, or (special effects) either. */
export type EffectPool = 'normal' | 'deep' | 'any';

export interface EffectMeta {
  id: number;
  /** Display name without the "[Relic]" prefix (hero effects keep "[Hero] "). */
  name: string;
  family: string;
  level: number;
  tier: EffectInfo['tier'];
  /** Hero id for hero-only effects ("[Relic - Duchess] …"), else 0. */
  hero: number;
  pool: EffectPool;
}

/** Editable effect rules (the defaults ship with the app, a .rsp file can override them). */
export interface EffectRules {
  /** Does an effect stack with another copy of itself? Missing = unknown (treated as yes). */
  stacksWithSelf: Record<number, boolean>;
  /** Strength of an effect at its level, comparable within its family. */
  bonus: Record<number, number>;
  /** Unordered pairs of different effects that don't stack with each other. */
  noStack: [number, number][];
  /** Family / level overrides for effects the name rule gets wrong. */
  families: Record<number, { family: string; level: number }>;
}

interface RulesJson {
  effects: Record<string, { stacksWithSelf?: boolean; bonus?: number }>;
  noStack: number[][];
}

/** The shipped defaults (data/sell/effect-rules.json). */
export function defaultEffectRules(): EffectRules {
  const json = effectRulesJson as RulesJson;
  const rules: EffectRules = { stacksWithSelf: {}, bonus: {}, noStack: [], families: {} };
  for (const [id, e] of Object.entries(json.effects)) {
    if (e.stacksWithSelf !== undefined) rules.stacksWithSelf[Number(id)] = e.stacksWithSelf;
    if (e.bonus !== undefined) rules.bonus[Number(id)] = e.bonus;
  }
  for (const [a, b] of json.noStack)
    if (a !== undefined && b !== undefined) rules.noStack.push([a, b]);
  return rules;
}

const LEVEL = /\s*\+(\d+)$/;
const HERO_IDS = new Map(Object.entries(HEROES).map(([id, name]) => [name, Number(id)]));

/** Family, level and hero from an effect name (before collision handling and overrides). */
export function parseEffectName(raw: string): {
  name: string;
  family: string;
  level: number;
  hero: number;
} {
  let hero = 0;
  const name = raw
    .replace(/^\[(Special )?Relic\]\s*/, '')
    .replace(/^\[Relic - (\w+)\]\s*/, (_, h: string) => {
      hero = HERO_IDS.get(h) ?? 0;
      return `[${h}] `;
    })
    .replace(/\.$/, '');
  const level = Number(name.match(LEVEL)?.[1] ?? 0);
  return { name, family: name.replace(LEVEL, ''), level, hero };
}

const poolOf = (tier: EffectInfo['tier']): EffectPool =>
  tier === 'normal' ? 'normal' : tier === 'special' ? 'any' : 'deep';

export interface EffectIndex {
  rules: EffectRules;
  meta(id: number): EffectMeta | undefined;
  /** Every known effect (normal, deep, curse; special ones included). */
  all(): EffectMeta[];
  /** Effects of a family, by level then id. */
  family(name: string): EffectMeta[];
  families(): string[];
  /** Highest level of a family among its effects. */
  maxLevel(family: string): number;
  /** Effects that are the same thing at the same level (e.g. two ids named "Physical Attack Up +2"). */
  sameEffect(a: number, b: number): boolean;
  /** Can both effects be active together (in one build)? `a === b` asks about two copies. */
  stacks(a: number, b: number): boolean;
  /** Is stacking with itself known (from the data or the user), or just assumed? */
  stackingKnown(id: number): boolean;
  /**
   * How much a `lower` level copy is worth when it stands in for `wanted`:
   * the ratio of their strengths when both are known, else the fallback.
   */
  backupWeight(lower: number, wanted: number): number;
}

export function buildEffectIndex(rules: EffectRules = defaultEffectRules()): EffectIndex {
  const metas = new Map<number, EffectMeta>();
  for (const info of catalog().effects()) {
    const parsed = parseEffectName(info.name);
    metas.set(info.id, {
      id: info.id,
      name: parsed.name,
      family: parsed.family,
      level: parsed.level,
      tier: info.tier,
      hero: parsed.hero,
      pool: poolOf(info.tier),
    });
  }
  // Normal and deep effects colliding on one family + level are different effects: split the deep side.
  const byFamily = new Map<string, EffectMeta[]>();
  for (const m of metas.values()) byFamily.set(m.family, [...(byFamily.get(m.family) ?? []), m]);
  for (const [family, list] of byFamily) {
    const normalLevels = new Set(list.filter((m) => m.pool === 'normal').map((m) => m.level));
    const clash = list.some((m) => m.pool === 'deep' && normalLevels.has(m.level));
    if (!clash) continue;
    for (const m of list) if (m.pool === 'deep') m.family = `${family} (deep)`;
  }
  for (const [id, override] of Object.entries(rules.families)) {
    const m = metas.get(Number(id));
    if (m) Object.assign(m, override);
  }

  const families = new Map<string, EffectMeta[]>();
  for (const m of metas.values()) families.set(m.family, [...(families.get(m.family) ?? []), m]);
  for (const list of families.values()) list.sort((a, b) => a.level - b.level || a.id - b.id);

  // Canonical id per (family, level, pool): equivalent ids count as one effect for stacking.
  const canonical = new Map<number, number>();
  for (const list of families.values()) {
    const first = new Map<string, number>();
    for (const m of list) {
      const key = `${m.level}|${m.pool}`;
      const c = first.get(key) ?? m.id;
      first.set(key, c);
      canonical.set(m.id, c);
    }
  }
  const canon = (id: number) => canonical.get(id) ?? id;
  const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const noStack = new Set(rules.noStack.map(([a, b]) => pairKey(canon(a), canon(b))));
  const selfRule = (id: number): boolean | undefined =>
    rules.stacksWithSelf[id] ?? rules.stacksWithSelf[canon(id)];

  const index: EffectIndex = {
    rules,
    meta: (id) => metas.get(id),
    all: () => [...metas.values()],
    family: (name) => families.get(name) ?? [],
    families: () => [...families.keys()],
    maxLevel: (family) => Math.max(0, ...(families.get(family) ?? []).map((m) => m.level)),
    sameEffect: (a, b) => canon(a) === canon(b),
    stacks(a, b) {
      const ca = canon(a);
      const cb = canon(b);
      if (ca === cb) return (selfRule(a) ?? true) && !noStack.has(pairKey(ca, ca));
      return !noStack.has(pairKey(ca, cb));
    },
    stackingKnown: (id) => selfRule(id) !== undefined,
    backupWeight(lower, wanted) {
      const low = rules.bonus[lower] ?? rules.bonus[canon(lower)];
      const high = rules.bonus[wanted] ?? rules.bonus[canon(wanted)];
      if (low === undefined || high === undefined || !(high > 0)) return FALLBACK_BACKUP_WEIGHT;
      return Math.max(0, Math.min(0.99, low / high));
    },
  };
  return index;
}
