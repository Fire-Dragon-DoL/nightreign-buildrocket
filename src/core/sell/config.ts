/**
 * Sell Planner config: what to keep. Independent of any save: it only holds
 * effect ids, rules and needs, never relic handles or save content.
 */
import { defaultEffectRules, type EffectRules } from './effects.ts';

export const IMPORTANCES = ['ignore', 'low', 'normal', 'high', 'mustKeep'] as const;
export type Importance = (typeof IMPORTANCES)[number];
export const IMPORTANCE_LABELS: Record<Importance, string> = {
  ignore: 'Ignore',
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  mustKeep: 'Must keep',
};

export const CURSE_PENALTIES = ['fine', 'annoying', 'dealbreaker'] as const;
export type CursePenalty = (typeof CURSE_PENALTIES)[number];
/** Default penalty of a curse nobody configured (the owner chose "fine"). */
export const DEFAULT_CURSE_PENALTY: CursePenalty = 'fine';

/** Relic colors a need can count per color (vessel "Any" slots aren't a relic color). */
export const RELIC_COLORS = ['Red', 'Blue', 'Yellow', 'Green'] as const;
export type ColorName = (typeof RELIC_COLORS)[number];

export type ColorScope = 'perColor' | 'any';

/** Which relics a need counts: normal ones, Deep of Night ones, or both. */
export const RELIC_KINDS = ['normal', 'deep', 'any'] as const;
export type RelicKind = (typeof RELIC_KINDS)[number];
export const RELIC_KIND_LABELS: Record<RelicKind, string> = {
  normal: 'Normal relics',
  deep: 'Deep relics',
  any: 'Both',
};

export interface NeedBase {
  /** Copies wanted: per color with `perColor`, in total with `any`. */
  copies: number;
  colorScope: ColorScope;
  /** Colors that count (all four when missing). */
  colors?: ColorName[];
  importance: Importance;
  /** Curse id → penalty for this need only (overrides the curse's default). */
  curseOverrides?: Record<number, CursePenalty>;
  /**
   * Relics that count: normal, Deep of Night or both. Missing ("Auto", how plans saved before this
   * setting existed behave): a relic counts when its matching effect is of the same kind as the
   * wanted one, whatever the relic.
   */
  relics?: RelicKind;
}

/** Keep copies of one effect (at `minLevel` or higher; lower levels are backups). */
export interface EffectNeed extends NeedBase {
  kind: 'effect';
  effect: number;
  /** Defaults to the level of `effect`. */
  minLevel?: number;
  /**
   * Only `minLevel` itself counts: no higher level, no lower backups. For effects that don't stack
   * with themselves, where two relics should carry different levels (+0 and +1).
   */
  exactLevel?: boolean;
}

/** Keep relics carrying all these effects at once (supersets match, partial matches are backups). */
export interface ComboNeed extends NeedBase {
  kind: 'combo';
  /** Effects the relic must all have. */
  effects: number[];
  /**
   * Slots filled by any one of their effects ("Dragon Communion + any of Incantations / Affinity /
   * Fire"): every option counts toward the same copies.
   */
  anyOf?: number[][];
  /** Effect id → lowest level that counts for that member (default: the member's own level). */
  minLevels?: Record<number, number>;
  /** Members where only that level counts (see `EffectNeed.exactLevel`). */
  exactLevels?: number[];
}

export type Need = EffectNeed | ComboNeed;

/** Whether only the member's level counts (not higher ones, no lower backups). */
export const isExactLevel = (need: Need, id: number): boolean =>
  need.kind === 'effect' ? need.exactLevel === true : (need.exactLevels?.includes(id) ?? false);

/** Every effect a need names (combo members and their "any of" options). */
export const needEffectIds = (need: Need): number[] =>
  need.kind === 'effect' ? [need.effect] : [...need.effects, ...(need.anyOf ?? []).flat()];

/**
 * What a combo describes (owner's terms): 2 slots, a good roll (2 good attributes together);
 * 3 or more, a godroll (3 together). A relic has at most 3 effects.
 */
export function comboRoll(need: ComboNeed): 'godroll' | 'goodRoll' | null {
  const slots = need.effects.length + (need.anyOf?.length ?? 0);
  return slots >= 3 ? 'godroll' : slots === 2 ? 'goodRoll' : null;
}

export const COMBO_ROLL_LABELS = { godroll: 'godroll', goodRoll: 'good roll' } as const;

/** Slots of a combo: each required effect alone, then the "any of" slots. */
export const comboSlots = (need: ComboNeed): number[][] => [
  ...need.effects.map((id) => [id]),
  ...(need.anyOf ?? []),
];

/** The one list of needs a plan has (older files may hold several named groups). */
export const DEFAULT_GROUP = 'General';

export interface NeedGroup {
  /** Shown as "kept by". */
  name: string;
  needs: Need[];
}

/** The user's changes on top of the shipped effect rules. */
export interface EffectRuleOverrides {
  families: Record<number, { family: string; level: number }>;
  stacksWithSelf: Record<number, boolean>;
  /** Pairs that don't stack, on top of the defaults. */
  noStack: [number, number][];
  /** Pairs that do stack although a default says otherwise. */
  stack: [number, number][];
  /** Curse id → default penalty. */
  curseDefaults: Record<number, CursePenalty>;
}

export interface SellConfig {
  effectRules: EffectRuleOverrides;
  groups: NeedGroup[];
  /** Relic item ids never to sell (manual override). */
  neverSell: number[];
}

export const emptyOverrides = (): EffectRuleOverrides => ({
  families: {},
  stacksWithSelf: {},
  noStack: [],
  stack: [],
  curseDefaults: {},
});

export const emptyConfig = (): SellConfig => ({
  effectRules: emptyOverrides(),
  groups: [],
  neverSell: [],
});

const pairKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Shipped defaults with the user's overrides applied. */
export function effectiveRules(
  overrides: EffectRuleOverrides,
  defaults: EffectRules = defaultEffectRules(),
): EffectRules {
  const removed = new Set(overrides.stack.map(([a, b]) => pairKey(a, b)));
  const seen = new Set<string>();
  const noStack: [number, number][] = [];
  for (const [a, b] of [...defaults.noStack, ...overrides.noStack]) {
    const key = pairKey(a, b);
    if (removed.has(key) || seen.has(key)) continue;
    seen.add(key);
    noStack.push([a, b]);
  }
  return {
    stacksWithSelf: { ...defaults.stacksWithSelf, ...overrides.stacksWithSelf },
    bonus: defaults.bonus,
    noStack,
    families: { ...defaults.families, ...overrides.families },
  };
}

export const cursePenalty = (
  config: SellConfig,
  need: Need | undefined,
  curse: number,
): CursePenalty =>
  need?.curseOverrides?.[curse] ?? config.effectRules.curseDefaults[curse] ?? DEFAULT_CURSE_PENALTY;

/** Every effect id the config mentions (for warnings about unknown ids). */
export function configEffectIds(config: SellConfig): number[] {
  const ids = new Set<number>();
  const r = config.effectRules;
  for (const id of Object.keys(r.families)) ids.add(Number(id));
  for (const id of Object.keys(r.stacksWithSelf)) ids.add(Number(id));
  for (const id of Object.keys(r.curseDefaults)) ids.add(Number(id));
  for (const [a, b] of [...r.noStack, ...r.stack]) ids.add(a).add(b);
  for (const group of config.groups) {
    for (const need of group.needs) {
      for (const id of needEffectIds(need)) ids.add(id);
      for (const id of Object.keys(need.curseOverrides ?? {})) ids.add(Number(id));
    }
  }
  return [...ids];
}
