/**
 * Sell Planner: which relics can be sold without leaving anything the config
 * wants short, and why each one is safe.
 *
 * Model (see claude/plan-sell-planner.md):
 * - A need wants `copies` relics with an effect (or a combo of effects on one
 *   relic), per color or in total. A relic is one copy of each effect it
 *   carries and of each combo it matches. Higher levels count fully, lower
 *   levels and partial combos are backups worth less than a copy: they stand
 *   in for missing copies only, one each (and only if they stack with the
 *   copies already counted).
 * - Unsellable relics never appear in the list but count toward every need.
 * - Selection is rule based, not score based. A relic is suggested only if,
 *   after selling it and everything suggested before it, every need still
 *   meets its target. Relics are taken by reason, strongest first:
 *   1. nothing on it is wanted;
 *   2. covered: a relic you keep (same kind and color) has everything wanted
 *      from it, at the same or a higher level (that relic is then kept);
 *   3. spares: each wanted effect or combo still has enough copies;
 *   4. possible godrolls nothing wants, last, for review.
 *   Within a reason the least valuable relic goes first. Each reason is
 *   recorded when the relic is picked, so "sell everything above this line"
 *   holds in the order shown.
 * - The risk number only summarises the reason; it never decides the order.
 * - Relics that would leave a Low or Normal need short are listed apart
 *   ("would leave you short"); High and Must keep ones are kept.
 */
import { type RelicSpec, specKey } from '../builds/builds.ts';
import { catalog, effectName, RELIC_COLOR_NAMES, rollRules } from '../catalog/catalog.ts';
import {
  COMBO_ROLL_LABELS,
  type ColorName,
  type ComboNeed,
  type CursePenalty,
  comboRoll,
  comboSlots,
  cursePenalty,
  DEFAULT_GROUP,
  effectiveRules,
  type Importance,
  isExactLevel,
  type Need,
  needEffectIds,
  RELIC_COLORS,
  type RelicKind,
  type SellConfig,
} from './config.ts';
import { buildEffectIndex, type EffectIndex, type EffectMeta } from './effects.ts';

/** A partial combo match is worth this much of the members it has. */
export const PARTIAL_COMBO_FACTOR = 0.75;
/** Risk shown for relics flagged as possible godrolls. */
export const GODROLL_RISK = 60;

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  ignore: 0,
  low: 1,
  normal: 2,
  high: 4,
  mustKeep: 8,
};
/** Risk shown for selling copies a need can't spare (the short list), by importance. */
const BREAK_RISK: Record<Importance, number> = {
  ignore: 0,
  low: 55,
  normal: 75,
  high: 90,
  mustKeep: 100,
};
/** Risk shown for a spare when exactly the target is left; it halves with each extra spare. */
const SPARE_RISK: Record<Importance, number> = {
  ignore: 0,
  low: 10,
  normal: 20,
  high: 35,
  mustKeep: 50,
};
export const CURSE_VALUE: Record<CursePenalty, number> = { fine: 0, annoying: 0.5, dealbreaker: 1 };
const EPS = 1e-9;

/** `godroll`: 3 good attributes together; `goodRoll`: 2 (see `RollQuality`). */
export type SellFlag = 'godroll' | 'goodRoll' | 'stackingUnknown';

/** Why a relic can go (in the order the planner takes them). */
export type Verdict = 'unwanted' | 'covered' | 'spares' | 'review';
const VERDICT_RANK: Record<Verdict, number> = { unwanted: 0, covered: 1, spares: 2, review: 3 };

/** One line of explanation next to a relic. */
export type WhyLine =
  /** Nothing on the relic is wanted: its effects, and which of them the plan ignores on purpose. */
  | { kind: 'unwanted'; effects: number[]; ignored: number[] }
  /** A relic you keep has everything wanted from this one. */
  | {
      kind: 'covered';
      by: RelicSpec;
      /** Copies of that relic you still have. */
      copies: number;
      /** It can't be sold (unique relic), so it will always be there. */
      permanent: boolean;
      /** Other kept relics that would cover it too. */
      more: number;
    }
  /** A need this relic counts toward, after selling it: `keep` copies left, `want` wanted. */
  | {
      kind: 'need';
      group: string;
      label: string;
      color: ColorName | null;
      importance: Importance;
      keep: number;
      /** Copies counting lower-level / partial backups at their weight. */
      coverage: number;
      want: number;
      /** Selling it leaves the need short. */
      short: boolean;
    };

/** One line of the sell list: `count` identical relics (same `specKey`) with one reason. */
export interface SellEntry {
  spec: RelicSpec;
  key: string;
  /** Copies to sell on this line. */
  count: number;
  /** Copies of this relic owned in total. */
  owned: number;
  verdict: Verdict;
  /** Summary of the reason: 0 = nothing wanted, higher = thinner margin. Never decides the order. */
  risk: number;
  why: WhyLine[];
  /** The reason in one line of text (CSV). */
  reason: string;
  flags: SellFlag[];
}

/** A relic that would leave a Low or Normal need short (never in the sell list). */
export interface ShortEntry {
  spec: RelicSpec;
  key: string;
  count: number;
  owned: number;
  risk: number;
  why: WhyLine[];
  reason: string;
}

export interface KeptEntry {
  spec: RelicSpec;
  key: string;
  count: number;
  owned: number;
  reasons: string[];
}

/** How one need (in one color) stands before selling anything. */
export interface NeedStatus {
  group: string;
  label: string;
  color: ColorName | null;
  importance: Importance;
  target: number;
  /** Full copies owned. */
  full: number;
  /** Copies counting backups at their weight. */
  coverage: number;
}

export interface SellPlan {
  /** Safe to sell, in order: everything above any line is safe. */
  sell: SellEntry[];
  /** Would leave a Low or Normal need short: only if you accept that. */
  short: ShortEntry[];
  /** Sellable relics the plan keeps, with their reasons. */
  kept: KeptEntry[];
  /** Relics the game won't let you sell (or on the never-sell list); they count toward needs. */
  unsellable: number;
  needs: NeedStatus[];
  warnings: string[];
}

export type ProgressCallback = (done: number, total: number) => void;

export interface Unit {
  index: number;
  spec: RelicSpec;
  key: string;
  color: ColorName | null;
  deep: boolean;
  sellable: boolean;
  alive: boolean;
  contributions: Contribution[];
  value: number;
  godroll: boolean;
  stackingUnknown: boolean;
  /** Named as the cover of a sold relic: kept so that reason stays true. */
  pinned: boolean;
  /** Pinned as the cover of this many sold relics. */
  covers: number;
}

export interface Contribution {
  bucket: Bucket;
  unit: Unit;
  full: boolean;
  weight: number;
  /** Strength among the need's matches (see `Match.rank`): stronger stand-ins count first. */
  rank: number;
  /** Combos: the relic's effects that matched (see `Match.matched`). */
  matched?: number[];
  /** Matching effect, for stacking checks (null for combos: they are about one relic). */
  effect: number | null;
  /** Level matched per wanted effect (combo members in order), -1 = missing. */
  levels: number[];
  /** Levels above the minimum, summed: a higher level is worth keeping over a lower one. */
  surplus: number;
}

export interface Bucket {
  group: string;
  label: string;
  color: ColorName | null;
  importance: Importance;
  target: number;
  need: Need;
  members: Contribution[];
  /** Coverage cache, cleared when a member is sold. */
  current: number | undefined;
  without: Map<string, number>;
}

interface Match {
  full: boolean;
  weight: number;
  effect: number | null;
  levels: number[];
  surplus: number;
  /**
   * Strength among matches of the same need: which stand-ins count first while copies are
   * missing. Combos: effects matched (earlier members first), then levels, then milder curses.
   */
  rank: number;
  /** Combos: the relic's effects that matched (for stacking checks between stand-ins). */
  matched?: number[];
}

const colorOf = (itemId: number): ColorName | null => {
  const color = catalog().relic(itemId)?.color;
  if (color === undefined) return null;
  const name = RELIC_COLOR_NAMES[color];
  return (RELIC_COLORS as readonly string[]).includes(name) ? (name as ColorName) : null;
};

const poolsMatch = (a: EffectMeta, b: EffectMeta) =>
  a.pool === b.pool || a.pool === 'any' || b.pool === 'any';

/** Effects and curses of a relic (curses can be wanted too). */
export const relicEffects = (spec: RelicSpec): number[] =>
  [...spec.effects, ...spec.curses].filter((e): e is number => e !== null);

/** A member's name, "Family +N or higher" when a lower level is allowed, "Family +N only". */
function memberLabel(
  index: EffectIndex,
  id: number,
  minLevel: number | undefined,
  exact = false,
): string {
  const meta = index.meta(id);
  if (!meta) return effectName(id);
  const level = minLevel ?? meta.level;
  const several = new Set(index.family(meta.family).map((m) => m.level)).size > 1;
  if (exact && several) return `${meta.family} +${level} only`;
  if (level === meta.level) return meta.name;
  return `${meta.family} +${level} or higher`;
}

/** Relics a need counts (see `Need.relics`); 'auto' = by the kind of the matching effect. */
export function needRelicKind(need: Need): RelicKind | 'auto' {
  return need.relics ?? 'auto';
}

/** " (good roll)" / " (godroll)" after a combo's label, by its size. */
function rollSuffix(need: ComboNeed): string {
  const roll = comboRoll(need);
  return roll ? ` (${COMBO_ROLL_LABELS[roll]})` : '';
}

function needLabel(need: Need, index: EffectIndex): string {
  if (need.kind === 'combo') {
    // ★ marks the members every stand-in must carry.
    const label = (id: number) =>
      `${need.core?.includes(id) ? '★ ' : ''}${memberLabel(index, id, need.minLevels?.[id], isExactLevel(need, id))}`;
    return comboSlots(need)
      .map((slot) =>
        slot.length === 1 ? label(slot[0] as number) : `any of (${slot.map(label).join(' / ')})`,
      )
      .join(' + ')
      .concat(rollSuffix(need));
  }
  return memberLabel(index, need.effect, need.minLevel, need.exactLevel);
}

/** The effect id of `meta`'s family at `level` (same pool), for strength ratios. */
function effectAtLevel(index: EffectIndex, meta: EffectMeta, level: number): number {
  const members = index.family(meta.family);
  return (
    members.find((m) => m.level === level && poolsMatch(m, meta))?.id ??
    members.find((m) => m.level === level)?.id ??
    meta.id
  );
}

/** How well a relic carrying `effects` matches one wanted effect at `minLevel`. */
function matchEffect(
  index: EffectIndex,
  wanted: EffectMeta,
  minLevel: number,
  effects: number[],
  /** "Auto" relics: only effects of the wanted one's kind (normal / deep) count. */
  sameKind: boolean,
  /** Only `minLevel` itself counts: no higher level, no lower backups. */
  exact = false,
): Match | null {
  let best: Match | null = null;
  const wantedId = effectAtLevel(index, wanted, minLevel);
  for (const id of effects) {
    const meta = index.meta(id);
    // Families already keep different effects apart (same-named normal / deep ones are split);
    // which relics count is the need's `relics` setting.
    if (!meta || meta.family !== wanted.family || (sameKind && !poolsMatch(meta, wanted))) continue;
    if (exact && meta.level !== minLevel) continue;
    const m: Match =
      meta.level >= minLevel
        ? {
            full: true,
            weight: 1,
            effect: id,
            levels: [meta.level],
            surplus: meta.level - minLevel,
            rank: meta.level,
          }
        : {
            full: false,
            weight: index.backupWeight(id, wantedId),
            effect: id,
            levels: [meta.level],
            surplus: 0,
            rank: meta.level,
          };
    if (m.weight <= 0) continue;
    // The highest level on the relic is the one that counts.
    if (
      !best ||
      (m.full && !best.full) ||
      (m.full === best.full && meta.level > (best.levels[0] ?? -1))
    ) {
      best = m;
    }
  }
  return best;
}

function matchNeed(
  config: SellConfig,
  index: EffectIndex,
  need: Need,
  spec: RelicSpec,
): Match | null {
  const effects = relicEffects(spec);
  const wantedIds = needEffectIds(need);
  for (const curse of spec.curses) {
    if (curse === null || wantedIds.includes(curse)) continue;
    if (cursePenalty(config, need, curse) === 'dealbreaker') return null;
  }
  if (need.kind === 'effect') {
    const meta = index.meta(need.effect);
    if (!meta) {
      return effects.includes(need.effect)
        ? { full: true, weight: 1, effect: need.effect, levels: [0], surplus: 0, rank: 0 }
        : null;
    }
    return matchEffect(
      index,
      meta,
      need.minLevel ?? meta.level,
      effects,
      !need.relics,
      need.exactLevel,
    );
  }
  let total = 0;
  let allFull = true;
  let surplus = 0;
  // One level per option of every slot, in order, so relics compare position by position.
  const levels: number[] = [];
  const slots = comboSlots(need);
  const slotFull: boolean[] = [];
  const matched: number[] = [];
  let levelSum = 0;
  for (const slot of slots) {
    let best: Match | null = null;
    for (const id of slot) {
      const meta = index.meta(id);
      const m = meta
        ? matchEffect(
            index,
            meta,
            need.minLevels?.[id] ?? meta.level,
            effects,
            !need.relics,
            isExactLevel(need, id),
          )
        : effects.includes(id)
          ? { full: true, weight: 1, effect: id, levels: [0], surplus: 0, rank: 0 }
          : null;
      levels.push(m?.levels[0] ?? -1);
      // Any option fills the slot: the best one counts.
      if (
        m &&
        (!best ||
          (m.full && !best.full) ||
          (m.full === best.full && (m.weight > best.weight || m.surplus > best.surplus)))
      ) {
        best = m;
      }
    }
    slotFull.push(best?.full === true);
    if (!best?.full) allFull = false;
    else {
      levelSum += best.levels[0] ?? 0;
      if (best.effect !== null) matched.push(best.effect);
    }
    total += best?.weight ?? 0;
    surplus += best?.full ? best.surplus : 0;
  }
  // Milder curses rank first among equals.
  const curseBurden = spec.curses.reduce<number>(
    (n, c) => n + (c === null ? 0 : CURSE_VALUE[cursePenalty(config, need, c)]),
    0,
  );
  if (allFull) {
    return {
      full: true,
      weight: 1,
      effect: null,
      levels,
      surplus,
      rank: standInRank(slots.length, 0, surplus, curseBurden),
      matched,
    };
  }
  if (total <= 0) return null;
  // A stand-in must carry the members marked as needed (the slots holding them, fully matched).
  const coreSlots = slots
    .map((slot, i) => (slot.some((id) => need.core?.includes(id)) ? i : -1))
    .filter((i) => i >= 0);
  if (coreSlots.some((i) => !slotFull[i])) return null;
  // Effects matched, earlier members first (the combo's order is its preference), then levels.
  const matchedSlots = slotFull.filter(Boolean).length;
  const order = slotFull.reduce((n, f, i) => n + (f ? 2 ** (slots.length - 1 - i) : 0), 0);
  return {
    full: false,
    weight: (PARTIAL_COMBO_FACTOR * total) / slots.length,
    effect: null,
    levels,
    surplus: 0,
    rank: standInRank(matchedSlots, order, levelSum, curseBurden),
    matched,
  };
}

/**
 * A stand-in's strength as a small integer (higher = stronger), compared field by field: effects
 * matched, which ones (bit mask, earlier members higher), levels, then curse burden (0.5 steps).
 */
const standInRank = (matched: number, order: number, levels: number, curses: number) =>
  matched * 10000 + order * 1000 + Math.min(levels, 99) * 8 - Math.round(curses * 2);

/** Tiny coverage bonus per rank point: selling a stronger stand-in for a weaker one is a loss. */
const RANK_BONUS = 1e-7;

/**
 * Coverage of a bucket: full copies, plus backups standing in for the copies
 * still missing (one backup per missing copy, best first, and only if it
 * stacks with what is already counted). Backups never add up to replace a
 * copy, and they are worth nothing while the target is met. `skip` is left out.
 */
export function coverage(bucket: Bucket, index: EffectIndex, skip?: Contribution): number {
  let full = 0;
  const counted = new Set<number>();
  const backups: Contribution[] = [];
  for (const c of bucket.members) {
    if (!c.unit.alive || c === skip) continue;
    if (c.full) {
      full += 1;
      if (c.effect !== null) counted.add(c.effect);
      for (const e of c.matched ?? []) counted.add(e);
    } else backups.push(c);
  }
  let slots = bucket.target - full;
  if (slots <= 0) return full;
  let total = full;
  // The strongest stand-ins count first: more of the need, then the need's own ranking.
  backups.sort((a, b) => b.weight - a.weight || b.rank - a.rank);
  for (const b of backups) {
    if (slots <= 0) break;
    // A stand-in counts only if its effects stack with the ones already counted: a second relic
    // with the same non-stacking effect (Defeating enemies +1 twice) adds nothing in one build.
    const own = b.effect !== null ? [b.effect] : (b.matched ?? []);
    if (own.some((e) => [...counted].some((x) => !index.stacks(x, e)))) continue;
    for (const e of own) counted.add(e);
    total += b.weight + Math.max(0, b.rank) * RANK_BONUS;
    slots--;
  }
  return total;
}

const contributionKey = (c: Contribution) =>
  `${c.full ? 'F' : 'B'}|${c.effect}|${c.weight}|${c.rank}|${c.matched?.join(',') ?? ''}`;

function bucketCoverage(bucket: Bucket, index: EffectIndex): number {
  bucket.current ??= coverage(bucket, index);
  return bucket.current;
}

function coverageWithout(bucket: Bucket, index: EffectIndex, c: Contribution): number {
  const key = contributionKey(c);
  let value = bucket.without.get(key);
  if (value === undefined) {
    value = coverage(bucket, index, c);
    bucket.without.set(key, value);
  }
  return value;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const isHard = (i: Importance) => i === 'high' || i === 'mustKeep';

interface Evaluation {
  /** null: selling it would leave a need short. */
  verdict: Verdict | null;
  why: WhyLine[];
  risk: number;
  cover?: Unit;
  /** Leaves a High or Must keep need short. */
  hard: boolean;
}

/** Full copies left in a bucket without `skip`. */
const fullWithout = (b: Bucket, skip: Contribution) =>
  b.members.reduce((n, c) => n + (c.unit.alive && c.full && c !== skip ? 1 : 0), 0);

/** The best kept relic carrying everything `u` is wanted for (same kind and color), if any. */
function findCover(
  u: Unit,
  byUnit: Map<Unit, Map<Bucket, Contribution>>,
): { cover: Unit; more: number } | null {
  const [first, ...rest] = u.contributions;
  if (!first) return null;
  const covers: Unit[] = [];
  for (const m of first.bucket.members) {
    const v = m.unit;
    if (v === u || !v.alive || v.color !== u.color || v.deep !== u.deep) continue;
    const ok = [first, ...rest].every((c) => {
      const vc = byUnit.get(v)?.get(c.bucket);
      // At least as good for this need: full if this one is, and each effect at the same level or
      // higher (a +1 doesn't cover a +4 even when both are enough for the need).
      return (
        !!vc &&
        (vc.full || (!c.full && vc.weight >= c.weight)) &&
        c.levels.every((level, i) => (vc.levels[i] ?? -1) >= level)
      );
    });
    if (ok) covers.push(v);
  }
  if (covers.length === 0) return null;
  // Prefer covers that will always be there (unique or already pinned), then the most valuable.
  covers.sort(
    (a, b) =>
      Number(b.pinned || !b.sellable) - Number(a.pinned || !a.sellable) ||
      b.value - a.value ||
      a.index - b.index,
  );
  const best = covers[0] as Unit;
  return { cover: best, more: new Set(covers.map((c) => c.key)).size - 1 };
}

function evaluate(
  u: Unit,
  index: EffectIndex,
  byUnit: Map<Unit, Map<Bucket, Contribution>>,
  aliveCopies: (key: string) => number,
  ignoredFamilies: ReadonlySet<string>,
): Evaluation {
  if (u.contributions.length === 0) {
    const effects = relicEffects(u.spec);
    const ignored = effects.filter((e) => ignoredFamilies.has(index.meta(e)?.family ?? ''));
    return {
      verdict: u.godroll ? 'review' : 'unwanted',
      why: [{ kind: 'unwanted', effects, ignored }],
      risk: u.godroll ? GODROLL_RISK : 0,
      hard: false,
    };
  }
  const why: WhyLine[] = [];
  let shortAny = false;
  let hard = false;
  let spareRisk = 0;
  let breakRisk = 0;
  for (const c of u.contributions) {
    const b = c.bucket;
    const before = bucketCoverage(b, index);
    const after = coverageWithout(b, index, c);
    const loss = before - after;
    const short = loss > EPS && after + EPS < b.target;
    why.push({
      kind: 'need',
      group: b.group,
      label: b.label,
      color: b.color,
      importance: b.importance,
      keep: fullWithout(b, c),
      coverage: Math.round(after * 100) / 100,
      want: b.target,
      short,
    });
    if (short) {
      shortAny = true;
      if (isHard(b.importance)) hard = true;
      breakRisk = Math.max(breakRisk, BREAK_RISK[b.importance] * (0.5 + 0.5 * Math.min(1, loss)));
    } else if (loss > EPS) {
      spareRisk = Math.max(spareRisk, SPARE_RISK[b.importance] / 2 ** (after - b.target));
    }
  }
  // Short lines first, then the tightest margins.
  why.sort((a, b) =>
    a.kind === 'need' && b.kind === 'need'
      ? Number(b.short) - Number(a.short) || a.keep - a.want - (b.keep - b.want)
      : 0,
  );
  if (shortAny) return { verdict: null, why, risk: Math.min(99, breakRisk), hard };

  const found = findCover(u, byUnit);
  if (found) {
    const { cover, more } = found;
    const copies = aliveCopies(cover.key) - (cover.key === u.key ? 1 : 0);
    const permanent = !cover.sellable;
    // Low: something you keep has it all; a bit higher when that is your last copy of it.
    const risk = permanent ? 1 : copies > 1 ? 3 : 8;
    return {
      verdict: 'covered',
      why: [{ kind: 'covered', by: cover.spec, copies, permanent, more }, ...why],
      risk: Math.max(risk, Math.min(spareRisk, 20)),
      cover,
      hard: false,
    };
  }
  return { verdict: 'spares', why, risk: Math.max(5, Math.min(55, spareRisk)), hard: false };
}

/** The reason in one line of text. */
export function reasonText(why: WhyLine[], name: (spec: RelicSpec) => string): string {
  return why
    .map((w) => {
      if (w.kind === 'unwanted') {
        return w.effects.length ? 'Nothing on it is in your plan' : 'No effects';
      }
      if (w.kind === 'covered') {
        const copies = w.permanent ? 'unique, always kept' : `you keep ${w.copies}`;
        return `Covered by ${name(w.by)} (${copies})${w.more ? `, +${w.more} more` : ''}`;
      }
      const backups =
        w.coverage > w.keep + EPS ? ` (+${fmt(w.coverage - w.keep)} from backups)` : '';
      return `${groupPrefix(w.group)}${w.label}${w.color ? ` (${w.color})` : ''}: keep ${w.keep}${backups}, want ${w.want}${w.short ? ' — SHORT' : ''}`;
    })
    .join('; ');
}

export interface PlanOptions {
  onProgress?: ProgressCallback;
}

/** Relics and needs, matched: what both the Sell Planner and Secondary Pool Picks count with. */
export interface PoolModel {
  index: EffectIndex;
  units: Unit[];
  buckets: Bucket[];
  byUnit: Map<Unit, Map<Bucket, Contribution>>;
  /** Families the plan ignores on purpose. */
  ignoredFamilies: Set<string>;
  warnings: string[];
}

/** Match every relic of `pool` against every need of `config` (one bucket per need and color). */
export function buildPoolModel(pool: RelicSpec[], config: SellConfig): PoolModel {
  const index = buildEffectIndex(effectiveRules(config.effectRules));
  const rules = rollRules();
  const neverSell = new Set(config.neverSell);
  const warnings: string[] = [];

  const units: Unit[] = pool.map((spec, i) => ({
    index: i,
    spec,
    key: specKey(spec),
    color: colorOf(spec.itemId),
    deep: catalog().relic(spec.itemId)?.deep ?? false,
    sellable: rules.isSellable(spec.itemId) && !neverSell.has(spec.itemId),
    alive: true,
    contributions: [],
    value: 0,
    godroll: false,
    stackingUnknown: false,
    pinned: false,
    covers: 0,
  }));

  // Buckets: one per need and color (perColor) or one per need (any).
  const buckets: Bucket[] = [];
  const ignoredFamilies = new Set<string>();
  for (const group of config.groups) {
    for (const need of group.needs) {
      if (need.importance === 'ignore') {
        for (const id of needEffectIds(need)) {
          const family = index.meta(id)?.family;
          if (family) ignoredFamilies.add(family);
        }
        continue;
      }
      if (need.copies <= 0) continue;
      const label = needLabel(need, index);
      const colors = need.colors?.length ? need.colors : [...RELIC_COLORS];
      const forColor = (color: ColorName | null): Bucket => ({
        group: group.name || '(unnamed group)',
        label,
        color,
        importance: need.importance,
        target: need.copies,
        need,
        members: [],
        current: undefined,
        without: new Map(),
      });
      const byColor = new Map<ColorName | null, Bucket>();
      if (need.colorScope === 'perColor') for (const c of colors) byColor.set(c, forColor(c));
      else byColor.set(null, forColor(null));
      buckets.push(...byColor.values());

      if (need.kind === 'effect' && need.copies > 1 && !index.stacks(need.effect, need.effect)) {
        warnings.push(
          `${group.name} › ${label}: ${need.copies} copies wanted${need.colorScope === 'perColor' ? ' per color' : ''}, but it doesn't stack with itself.`,
        );
      }

      const relicKind = needRelicKind(need);
      for (const unit of units) {
        if (unit.color && !colors.includes(unit.color)) continue;
        if (
          (relicKind === 'normal' || relicKind === 'deep') &&
          unit.deep !== (relicKind === 'deep')
        ) {
          continue;
        }
        const bucket = byColor.get(need.colorScope === 'perColor' ? unit.color : null);
        if (!bucket) continue;
        const match = matchNeed(config, index, need, unit.spec);
        if (!match) continue;
        const c: Contribution = { bucket, unit, ...match };
        bucket.members.push(c);
        unit.contributions.push(c);
        // Higher levels than needed add value, so lower ones are sold first.
        unit.value += IMPORTANCE_WEIGHT[need.importance] * (match.weight + 0.1 * match.surplus);
        if (match.effect !== null && !index.stackingKnown(match.effect))
          unit.stackingUnknown = true;
      }
    }
  }

  const byUnit = new Map<Unit, Map<Bucket, Contribution>>();
  for (const u of units) byUnit.set(u, new Map(u.contributions.map((c) => [c.bucket, c])));
  for (const unit of units) {
    for (const curse of unit.spec.curses) {
      if (curse !== null) unit.value -= CURSE_VALUE[cursePenalty(config, undefined, curse)];
    }
    // Between equals, keep the one with more effects.
    unit.value += 0.001 * unit.spec.effects.filter((e) => e !== null).length;
    if (unit.sellable && unit.contributions.length === 0) {
      unit.godroll = looksLikeGodroll(unit.spec, index, config, ignoredFamilies);
    }
  }
  return { index, units, buckets, byUnit, ignoredFamilies, warnings };
}

export function planSell(
  pool: RelicSpec[],
  config: SellConfig,
  options: PlanOptions = {},
): SellPlan {
  const { index, units, buckets, byUnit, ignoredFamilies, warnings } = buildPoolModel(pool, config);

  const alive = new Map<string, number>();
  for (const u of units) alive.set(u.key, (alive.get(u.key) ?? 0) + 1);
  const aliveCopies = (key: string) => alive.get(key) ?? 0;

  // Rule-based selection: the safe relic with the strongest reason, least valuable first.
  const candidates = units.filter((u) => u.sellable);
  const evaluations = new Map<Unit, Evaluation>();
  const reevaluate = (u: Unit) =>
    evaluations.set(u, evaluate(u, index, byUnit, aliveCopies, ignoredFamilies));
  for (const u of candidates) reevaluate(u);
  const sold: { unit: Unit; ev: Evaluation }[] = [];
  const total = candidates.length;
  let remaining = candidates.slice();
  for (;;) {
    let best: Unit | undefined;
    let bestEv: Evaluation | undefined;
    for (const u of remaining) {
      const ev = evaluations.get(u) as Evaluation;
      if (u.pinned || ev.verdict === null) continue;
      if (
        !best ||
        !bestEv?.verdict ||
        VERDICT_RANK[ev.verdict] < VERDICT_RANK[bestEv.verdict] ||
        (ev.verdict === bestEv.verdict &&
          (u.value < best.value - EPS ||
            (Math.abs(u.value - best.value) <= EPS && u.index < best.index)))
      ) {
        best = u;
        bestEv = ev;
      }
    }
    if (!best || !bestEv) break;
    sold.push({ unit: best, ev: bestEv });
    best.alive = false;
    alive.set(best.key, aliveCopies(best.key) - 1);
    remaining = remaining.filter((u) => u !== best);
    const dirty = new Set<Unit>();
    if (bestEv.cover) {
      bestEv.cover.pinned = true;
      bestEv.cover.covers++;
    }
    for (const c of best.contributions) {
      c.bucket.current = undefined;
      c.bucket.without.clear();
      for (const m of c.bucket.members) if (m.unit.alive && m.unit.sellable) dirty.add(m.unit);
    }
    for (const u of dirty) reevaluate(u);
    options.onProgress?.(sold.length, total);
  }
  options.onProgress?.(total, total);

  const owned = new Map<string, number>();
  for (const u of units) owned.set(u.key, (owned.get(u.key) ?? 0) + 1);
  const name = (spec: RelicSpec) => catalog().relic(spec.itemId)?.name ?? `Relic ${spec.itemId}`;

  // Collapse identical relics with the same reason into one line.
  const lines = new Map<string, SellEntry>();
  for (const { unit, ev } of sold) {
    const risk = Math.round(ev.risk);
    const lineKey = `${unit.key}#${ev.verdict}#${risk}`;
    const line = lines.get(lineKey);
    if (line) {
      line.count++;
      continue;
    }
    const flags: SellFlag[] = [];
    if (unit.godroll) {
      flags.push(
        goodAttributes(unit.spec, index, config, ignoredFamilies) >= 3 ? 'godroll' : 'goodRoll',
      );
    }
    if (unit.stackingUnknown) flags.push('stackingUnknown');
    lines.set(lineKey, {
      spec: unit.spec,
      key: unit.key,
      count: 1,
      owned: owned.get(unit.key) ?? 1,
      verdict: ev.verdict as Verdict,
      risk,
      why: ev.why,
      reason: reasonText(ev.why, name),
      flags,
    });
  }
  const sell = [...lines.values()];

  // What's left: covers of sold relics and relics guarding High / Must keep needs are kept; the
  // rest would leave a Low or Normal need short.
  const shortLines = new Map<string, ShortEntry>();
  const keptByKey = new Map<string, KeptEntry>();
  for (const u of remaining) {
    const ev = evaluations.get(u) as Evaluation;
    if (!u.pinned && !ev.hard && ev.verdict === null) {
      const risk = Math.round(ev.risk);
      const lineKey = `${u.key}#${risk}`;
      const line = shortLines.get(lineKey);
      if (line) line.count++;
      else {
        const why = ev.why.filter((w) => w.kind !== 'need' || w.short);
        shortLines.set(lineKey, {
          spec: u.spec,
          key: u.key,
          count: 1,
          owned: owned.get(u.key) ?? 1,
          risk,
          why,
          reason: reasonText(why, name),
        });
      }
      continue;
    }
    const reasons = [
      ...(u.pinned ? [`Covers ${u.covers} relic(s) in the sell list`] : []),
      ...ev.why.flatMap((w) =>
        w.kind === 'need' && w.short
          ? [
              `${groupPrefix(w.group)}${w.label}${w.color ? ` (${w.color})` : ''}: only ${w.keep} of ${w.want} left without it`,
            ]
          : [],
      ),
    ];
    const entry = keptByKey.get(u.key) ?? {
      spec: u.spec,
      key: u.key,
      count: 0,
      owned: owned.get(u.key) ?? 1,
      reasons,
    };
    entry.count++;
    keptByKey.set(u.key, entry);
  }

  // Need status before selling anything.
  for (const u of units) u.alive = true;
  const needs: NeedStatus[] = buckets.map((b) => ({
    group: b.group,
    label: b.label,
    color: b.color,
    importance: b.importance,
    target: b.target,
    full: b.members.filter((c) => c.full).length,
    coverage: Math.round(coverage(b, index) * 100) / 100,
  }));

  return {
    sell,
    short: [...shortLines.values()].sort((a, b) => a.risk - b.risk),
    kept: [...keptByKey.values()],
    unsellable: units.filter((u) => !u.sellable).length,
    needs,
    warnings,
  };
}

/**
 * Terminology (owner): a **godroll** is a relic with 3 good attributes together, a **good roll** one
 * with 2. A good attribute, as the tool can tell, is an effect at the top level of its leveled
 * family (e.g. Physical Attack Up +4); effects from the same family, families ignored on purpose
 * and relics with a dealbreaker curse don't count.
 */
export type RollQuality = 'godroll' | 'goodRoll';

/** How many good attributes the relic has together (see `RollQuality`); 0 with a dealbreaker. */
export function goodAttributes(
  spec: RelicSpec,
  index: EffectIndex,
  config: SellConfig,
  ignoredFamilies: ReadonlySet<string> = new Set(),
): number {
  for (const curse of spec.curses) {
    if (curse !== null && cursePenalty(config, undefined, curse) === 'dealbreaker') return 0;
  }
  const top = new Set<string>();
  for (const id of spec.effects) {
    if (id === null) continue;
    const meta = index.meta(id);
    if (!meta || ignoredFamilies.has(meta.family)) continue;
    const levels = index.family(meta.family).filter((m) => poolsMatch(m, meta));
    const max = Math.max(...levels.map((m) => m.level));
    if (new Set(levels.map((m) => m.level)).size >= 2 && meta.level === max) top.add(meta.family);
  }
  return top.size;
}

/** Godroll (3 good attributes), good roll (2), or neither. */
export function rollQuality(
  spec: RelicSpec,
  index: EffectIndex,
  config: SellConfig,
  ignoredFamilies?: ReadonlySet<string>,
): RollQuality | null {
  const good = goodAttributes(spec, index, config, ignoredFamilies);
  return good >= 3 ? 'godroll' : good === 2 ? 'goodRoll' : null;
}

/**
 * Sell Planner's review flag for relics the config doesn't cover: every slot holds a good
 * attribute (3 on a 3-slot relic: a godroll; 2 on a 2-slot one: a good roll).
 */
export function looksLikeGodroll(
  spec: RelicSpec,
  index: EffectIndex,
  config: SellConfig,
  ignoredFamilies: ReadonlySet<string> = new Set(),
): boolean {
  const good = goodAttributes(spec, index, config, ignoredFamilies);
  const slots = rollRules().slotCount(spec.itemId) || spec.effects.filter((e) => e !== null).length;
  return good >= 2 && good >= Math.min(3, slots);
}

/** "Group › " for needs from older plans' named groups; nothing for the one list. */
export const groupPrefix = (group: string) => (group === DEFAULT_GROUP ? '' : `${group} › `);
