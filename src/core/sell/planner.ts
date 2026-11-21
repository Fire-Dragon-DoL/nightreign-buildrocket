/**
 * Sell Planner: rank every sellable relic by how risky it is to sell, given
 * what the config wants to keep.
 *
 * Model (see claude/plan-sell-planner.md):
 * - A need wants `copies` relics with an effect (or a combo of effects on one
 *   relic), per color or in total. A relic is one copy of each effect it
 *   carries and of each combo it matches. Higher levels count fully, lower
 *   levels and partial combos are backups worth less than a copy: they stand
 *   in for missing copies only, one each (and only if they stack with the
 *   copies already counted).
 * - Unsellable relics never appear in the list but count toward every need.
 * - Planning is greedy over the whole list: repeatedly sell the relic whose
 *   sale is least risky right now, assuming everything before it is sold.
 *   So "sell everything above this line" is safe in the order shown.
 */
import { type RelicSpec, specKey } from '../builds/builds.ts';
import { catalog, effectName, RELIC_COLOR_NAMES, rollRules } from '../catalog/catalog.ts';
import {
  type ColorName,
  type CursePenalty,
  cursePenalty,
  effectiveRules,
  type Importance,
  type Need,
  RELIC_COLORS,
  type SellConfig,
} from './config.ts';
import { buildEffectIndex, type EffectIndex, type EffectMeta } from './effects.ts';

/** A partial combo match is worth this much of the members it has. */
export const PARTIAL_COMBO_FACTOR = 0.75;
/** Risk floor for relics flagged as possible godrolls. */
export const GODROLL_RISK = 60;

const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  ignore: 0,
  low: 1,
  normal: 2,
  high: 4,
  mustKeep: 8,
};
/** Risk of selling the last copies a need can't spare, by importance. */
const BREAK_RISK: Record<Importance, number> = {
  ignore: 0,
  low: 55,
  normal: 75,
  high: 90,
  mustKeep: 100,
};
/** Risk of selling a spare when exactly the target is left; it halves with each extra spare. */
const SPARE_RISK: Record<Importance, number> = {
  ignore: 0,
  low: 10,
  normal: 20,
  high: 35,
  mustKeep: 50,
};
const CURSE_VALUE: Record<CursePenalty, number> = { fine: 0, annoying: 0.5, dealbreaker: 1 };
const EPS = 1e-9;

export type SellFlag = 'godroll' | 'stackingUnknown';

/** One line of the sell list: `count` identical relics (same `specKey`) at one risk. */
export interface SellEntry {
  spec: RelicSpec;
  key: string;
  /** Copies to sell on this line. */
  count: number;
  /** Copies of this relic owned in total. */
  owned: number;
  /** 0 = safe to sell, 99 = very risky (100 = never, those are in `kept`). */
  risk: number;
  /** Why it's safe, or what it would hurt. */
  reason: string;
  flags: SellFlag[];
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
  /** Sorted by risk, safest first. */
  sell: SellEntry[];
  /** Sellable relics the plan keeps (risk 100), with their reasons. */
  kept: KeptEntry[];
  /** Relics the game won't let you sell (or on the never-sell list); they count toward needs. */
  unsellable: number;
  needs: NeedStatus[];
  warnings: string[];
}

export type ProgressCallback = (done: number, total: number) => void;

interface Unit {
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
}

interface Contribution {
  bucket: Bucket;
  unit: Unit;
  full: boolean;
  weight: number;
  /** Matching effect, for stacking checks (null for combos: they are about one relic). */
  effect: number | null;
}

interface Bucket {
  group: string;
  label: string;
  color: ColorName | null;
  importance: Importance;
  target: number;
  members: Contribution[];
  /** Coverage cache, cleared when a member is sold. */
  current: number | undefined;
  without: Map<string, number>;
}

interface Match {
  full: boolean;
  weight: number;
  effect: number | null;
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
const relicEffects = (spec: RelicSpec): number[] =>
  [...spec.effects, ...spec.curses].filter((e): e is number => e !== null);

function needLabel(need: Need, index: EffectIndex): string {
  if (need.kind === 'combo') {
    return need.effects.map((id) => index.meta(id)?.name ?? effectName(id)).join(' + ');
  }
  const meta = index.meta(need.effect);
  const name = meta?.name ?? effectName(need.effect);
  if (!meta || need.minLevel === undefined || need.minLevel === meta.level) return name;
  return `${meta.family} +${need.minLevel}`;
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
): Match | null {
  let best: Match | null = null;
  const wantedId = effectAtLevel(index, wanted, minLevel);
  for (const id of effects) {
    const meta = index.meta(id);
    if (!meta || meta.family !== wanted.family || !poolsMatch(meta, wanted)) continue;
    if (meta.level >= minLevel) return { full: true, weight: 1, effect: id };
    const weight = index.backupWeight(id, wantedId);
    if (weight > 0 && (!best || weight > best.weight)) best = { full: false, weight, effect: id };
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
  const wantedIds = need.kind === 'effect' ? [need.effect] : need.effects;
  for (const curse of spec.curses) {
    if (curse === null || wantedIds.includes(curse)) continue;
    if (cursePenalty(config, need, curse) === 'dealbreaker') return null;
  }
  if (need.kind === 'effect') {
    const meta = index.meta(need.effect);
    if (!meta)
      return effects.includes(need.effect) ? { full: true, weight: 1, effect: need.effect } : null;
    return matchEffect(index, meta, need.minLevel ?? meta.level, effects);
  }
  let total = 0;
  let allFull = true;
  for (const id of need.effects) {
    const meta = index.meta(id);
    const m = meta
      ? matchEffect(index, meta, meta.level, effects)
      : effects.includes(id)
        ? { full: true, weight: 1, effect: id }
        : null;
    if (!m?.full) allFull = false;
    total += m?.weight ?? 0;
  }
  if (allFull) return { full: true, weight: 1, effect: null };
  if (total <= 0) return null;
  return {
    full: false,
    weight: (PARTIAL_COMBO_FACTOR * total) / need.effects.length,
    effect: null,
  };
}

/**
 * Coverage of a bucket: full copies, plus backups standing in for the copies
 * still missing (one backup per missing copy, best first, and only if it
 * stacks with what is already counted). Backups never add up to replace a
 * copy, and they are worth nothing while the target is met. `skip` is left out.
 */
function coverage(bucket: Bucket, index: EffectIndex, skip?: Contribution): number {
  let full = 0;
  const counted = new Set<number>();
  const backups: Contribution[] = [];
  for (const c of bucket.members) {
    if (!c.unit.alive || c === skip) continue;
    if (c.full) {
      full += 1;
      if (c.effect !== null) counted.add(c.effect);
    } else backups.push(c);
  }
  let slots = bucket.target - full;
  if (slots <= 0) return full;
  let total = full;
  backups.sort((a, b) => b.weight - a.weight);
  for (const b of backups) {
    if (slots <= 0) break;
    if (b.effect !== null) {
      let ok = true;
      for (const x of counted) {
        if (!index.stacks(x, b.effect)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      counted.add(b.effect);
    }
    total += b.weight;
    slots--;
  }
  return total;
}

const contributionKey = (c: Contribution) => `${c.full ? 'F' : 'B'}|${c.effect}|${c.weight}`;

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

const colorSuffix = (b: Bucket) => (b.color ? ` (${b.color})` : '');
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

interface Assessment {
  risk: number;
  reason: string;
}

/** Risk of selling `unit` now, with the reason from the need it hurts most. */
function assess(unit: Unit, index: EffectIndex): Assessment {
  let worst: Assessment = { risk: 0, reason: '' };
  let sum = 0;
  for (const c of unit.contributions) {
    const b = c.bucket;
    const before = bucketCoverage(b, index);
    const after = coverageWithout(b, index, c);
    const loss = before - after;
    if (loss <= EPS) continue;
    const where = `${b.group} › ${b.label}${colorSuffix(b)}`;
    let risk: number;
    let reason: string;
    if (after + EPS >= b.target) {
      const spares = after - b.target;
      risk = SPARE_RISK[b.importance] / 2 ** spares;
      reason =
        spares > EPS
          ? `${where}: ${fmt(spares)} spare left after selling`
          : `${where}: exactly ${b.target} left after selling`;
    } else {
      // Must keep means must keep; otherwise losing a backup hurts less than losing a copy.
      risk =
        b.importance === 'mustKeep'
          ? 100
          : BREAK_RISK[b.importance] * (0.5 + 0.5 * Math.min(1, loss));
      reason = `${where}: only ${fmt(after)} of ${b.target} left after selling`;
    }
    sum += risk;
    if (risk > worst.risk) worst = { risk, reason };
  }
  let risk = worst.risk >= 100 ? 100 : Math.min(99, worst.risk + 0.1 * (sum - worst.risk));
  let reason = worst.reason;
  if (unit.godroll && risk < GODROLL_RISK) {
    risk = GODROLL_RISK;
    reason = 'Possible godroll: matches nothing in your config, review before selling';
  }
  if (!reason)
    reason = unit.contributions.length ? 'Plenty of spares' : 'Not wanted by your config';
  return { risk, reason };
}

export interface PlanOptions {
  onProgress?: ProgressCallback;
}

export function planSell(
  pool: RelicSpec[],
  config: SellConfig,
  options: PlanOptions = {},
): SellPlan {
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
  }));

  // Buckets: one per need and color (perColor) or one per need (any).
  const buckets: Bucket[] = [];
  const ignoredFamilies = new Set<string>();
  for (const group of config.groups) {
    for (const need of group.needs) {
      if (need.importance === 'ignore') {
        for (const id of need.kind === 'effect' ? [need.effect] : need.effects) {
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

      for (const unit of units) {
        if (unit.color && !colors.includes(unit.color)) continue;
        const bucket = byColor.get(need.colorScope === 'perColor' ? unit.color : null);
        if (!bucket) continue;
        const match = matchNeed(config, index, need, unit.spec);
        if (!match) continue;
        const c: Contribution = { bucket, unit, ...match };
        bucket.members.push(c);
        unit.contributions.push(c);
        unit.value += IMPORTANCE_WEIGHT[need.importance] * match.weight;
        if (match.effect !== null && !index.stackingKnown(match.effect))
          unit.stackingUnknown = true;
      }
    }
  }

  for (const unit of units) {
    for (const curse of unit.spec.curses) {
      if (curse !== null) unit.value -= CURSE_VALUE[cursePenalty(config, undefined, curse)];
    }
    if (unit.sellable && unit.contributions.length === 0) {
      unit.godroll = looksLikeGodroll(unit.spec, index, config, ignoredFamilies);
    }
  }

  // Greedy: sell the least risky relic, update, repeat.
  const candidates = units.filter((u) => u.sellable);
  const assessments = new Map<Unit, Assessment>();
  for (const u of candidates) assessments.set(u, assess(u, index));
  const sold: { unit: Unit; risk: number; reason: string }[] = [];
  const total = candidates.length;
  let remaining = candidates.slice();
  while (remaining.length > 0) {
    let best: Unit | undefined;
    let bestA: Assessment | undefined;
    for (const u of remaining) {
      const a = assessments.get(u) as Assessment;
      if (
        !best ||
        !bestA ||
        a.risk < bestA.risk - EPS ||
        (Math.abs(a.risk - bestA.risk) <= EPS &&
          (u.value < best.value - EPS ||
            (Math.abs(u.value - best.value) <= EPS && u.index < best.index)))
      ) {
        best = u;
        bestA = a;
      }
    }
    if (!best || !bestA || bestA.risk >= 100) break;
    sold.push({ unit: best, risk: bestA.risk, reason: bestA.reason });
    best.alive = false;
    remaining = remaining.filter((u) => u !== best);
    const dirty = new Set<Unit>();
    for (const c of best.contributions) {
      c.bucket.current = undefined;
      c.bucket.without.clear();
      for (const m of c.bucket.members) if (m.unit.alive && m.unit.sellable) dirty.add(m.unit);
    }
    for (const u of dirty) assessments.set(u, assess(u, index));
    options.onProgress?.(sold.length, total);
  }
  options.onProgress?.(total, total);

  // Collapse identical relics at the same (rounded) risk into one line.
  const owned = new Map<string, number>();
  for (const u of units) owned.set(u.key, (owned.get(u.key) ?? 0) + 1);
  const lines = new Map<string, SellEntry>();
  for (const { unit, risk, reason } of sold) {
    const rounded = Math.round(risk);
    const lineKey = `${unit.key}#${rounded}`;
    const line = lines.get(lineKey);
    if (line) {
      line.count++;
      continue;
    }
    const flags: SellFlag[] = [];
    if (unit.godroll) flags.push('godroll');
    if (unit.stackingUnknown) flags.push('stackingUnknown');
    lines.set(lineKey, {
      spec: unit.spec,
      key: unit.key,
      count: 1,
      owned: owned.get(unit.key) ?? 1,
      risk: rounded,
      reason,
      flags,
    });
  }
  const sell = [...lines.values()].sort((a, b) => a.risk - b.risk);

  const keptByKey = new Map<string, KeptEntry>();
  for (const u of remaining) {
    const entry = keptByKey.get(u.key) ?? {
      spec: u.spec,
      key: u.key,
      count: 0,
      owned: owned.get(u.key) ?? 1,
      reasons: [
        ...new Set(
          u.contributions
            .filter(
              (c) =>
                c.bucket.importance === 'mustKeep' ||
                coverageWithout(c.bucket, index, c) < c.bucket.target,
            )
            .map((c) => `${c.bucket.group} › ${c.bucket.label}${colorSuffix(c.bucket)}`),
        ),
      ],
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
    kept: [...keptByKey.values()],
    unsellable: units.filter((u) => !u.sellable).length,
    needs,
    warnings,
  };
}

/**
 * Flag-only heuristic for relics the config doesn't cover: every slot (3 on a
 * 3-slot relic, 2 on a 2-slot one) holds an effect at the top level of its
 * leveled family, all from different families, none ignored on purpose, and
 * no dealbreaker curse.
 */
export function looksLikeGodroll(
  spec: RelicSpec,
  index: EffectIndex,
  config: SellConfig,
  ignoredFamilies: ReadonlySet<string> = new Set(),
): boolean {
  for (const curse of spec.curses) {
    if (curse !== null && cursePenalty(config, undefined, curse) === 'dealbreaker') return false;
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
  const slots = rollRules().slotCount(spec.itemId) || spec.effects.filter((e) => e !== null).length;
  return top.size >= 2 && top.size >= Math.min(3, slots);
}
