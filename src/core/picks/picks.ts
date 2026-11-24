/**
 * Secondary Pool Picks: which relics of a second pool (another character or
 * save) fill what your main Relic Pool lacks for a sell plan's needs.
 *
 * The Secondary Pool is assumed to be a copy of the Relic Pool that drifted apart, so first the
 * relics both have are set aside: each Relic Pool relic removes one Secondary copy that looks the
 * same (`lookKey`: color, deep or normal, slot count, and effects with their curses, in any order
 * and by canonical id). The relic's name and item id are ignored.
 * Only what is left (the available pool: relics really earned on the other side) is considered.
 *
 * Counting is the Sell Planner's (same buckets, colors, levels, backups,
 * stacking and curse rules, see core/sell/planner.ts):
 * - A need is short when the Relic Pool's coverage is below its copies.
 *   Unsellable (unique) relics count like any other.
 * - Picks: the fewest Secondary relics that bring every short need as close to
 *   its target as the Secondary Pool allows. Greedy (most weighted help first:
 *   importance × coverage gained), then picks that no longer help are dropped.
 * - Upgrades: Secondary relics better than a copy the Relic Pool counts for a
 *   need that is already met (every effect at the same or a higher level and
 *   one higher, or the same levels with milder curses).
 * - Possible godrolls and good rolls: Secondary relics the plan doesn't want with 3 good attributes
 *   together (godroll) or 2 (good roll), see `RollQuality`, unless the Relic Pool has the same relic.
 *   Godrolls first.
 * A unique relic (one the game won't sell) the Relic Pool already has is skipped.
 */
import type { RelicSpec } from '../builds/builds.ts';
import { catalog, rollRules } from '../catalog/catalog.ts';
import {
  type ColorName,
  cursePenalty,
  type Importance,
  needEffectIds,
  type SellConfig,
} from '../sell/config.ts';
import {
  type Bucket,
  buildPoolModel,
  type Contribution,
  CURSE_VALUE,
  coverage,
  IMPORTANCE_WEIGHT,
  type PoolModel,
  type RollQuality,
  rollQuality,
  type Unit,
} from '../sell/planner.ts';

const EPS = 1e-9;

/**
 * How relics are matched across pools: color, deep or normal, slot count, and each effect with its
 * curse (aliases as their canonical effect, in any order). Name and item id don't matter.
 */
export function lookKey(spec: RelicSpec): string {
  const info = catalog().relic(spec.itemId);
  const canon = (id: number | null) => (id === null ? '-' : String(catalog().canonicalEffect(id)));
  const pairs = spec.effects
    .map((e, i) => `${canon(e)}/${canon(spec.curses[i] ?? null)}`)
    .filter((p) => p !== '-/-')
    .sort();
  const head = info
    ? `${info.color}|${info.deep ? 'D' : 'N'}|${rollRules().slotCount(spec.itemId)}`
    : `#${spec.itemId}`;
  return `${head}|${pairs.join(',')}`;
}

/** A need a picked relic helps fill. */
export interface PickFill {
  group: string;
  label: string;
  color: ColorName | null;
  importance: Importance;
  want: number;
  /** Coverage from the Relic Pool alone (backups at their weight). */
  have: number;
  /** Coverage with every pick. */
  after: number;
  /** This relic counts as a lower-level / partial backup, not a full copy. */
  backup: boolean;
}

export interface PickEntry {
  spec: RelicSpec;
  key: string;
  /** Copies to take on this line. */
  count: number;
  /** Copies of this relic in the available pool (Secondary minus shared copies). */
  available: number;
  fills: PickFill[];
  reason: string;
}

/** A need where a Secondary relic beats a copy the Relic Pool counts. */
export interface UpgradeLine {
  group: string;
  label: string;
  color: ColorName | null;
  importance: Importance;
  /** The Relic Pool copy it beats (the weakest one counted). */
  over: RelicSpec;
  /** Higher level somewhere (else: same levels, milder curses). */
  higher: boolean;
}

export interface UpgradeEntry {
  spec: RelicSpec;
  key: string;
  count: number;
  available: number;
  better: UpgradeLine[];
  reason: string;
}

/** A relic with good attributes together that the plan doesn't mention. */
export interface RollEntry {
  spec: RelicSpec;
  key: string;
  count: number;
  available: number;
  /** Godroll: 3 good attributes together; good roll: 2. */
  roll: RollQuality;
}

/** A need the Relic Pool is short of. */
export interface PickNeed {
  group: string;
  label: string;
  color: ColorName | null;
  importance: Importance;
  want: number;
  have: number;
  /** With the picks. */
  after: number;
}

export interface PicksResult {
  picks: PickEntry[];
  upgrades: UpgradeEntry[];
  /** Possible godrolls, then possible good rolls. */
  rolls: RollEntry[];
  /** Needs the Relic Pool is short of, with and without the picks. */
  needs: PickNeed[];
  /** Secondary relics skipped: unique relics the Relic Pool already has. */
  skippedUnique: number;
  /** Secondary relics set aside because the Relic Pool has the same copy. */
  shared: number;
  /** Relics in the available pool (Secondary minus shared copies). */
  availableCount: number;
  warnings: string[];
}

export type ProgressCallback = (done: number, total: number) => void;

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** Coverage counted toward the target (anything past it helps nothing). */
const capped = (b: Bucket, model: PoolModel) => Math.min(b.target, coverage(b, model.index));

/** Unwanted curses on a relic, for one need: lower is better. */
function curseBurden(config: SellConfig, c: Contribution): number {
  const wanted = needEffectIds(c.bucket.need);
  let n = 0;
  for (const curse of c.unit.spec.curses) {
    if (curse === null || wanted.includes(curse)) continue;
    n += CURSE_VALUE[cursePenalty(config, c.bucket.need, curse)];
  }
  return n;
}

const totalBurden = (config: SellConfig, u: Unit) =>
  u.spec.curses.reduce<number>(
    (n, curse) => n + (curse === null ? 0 : CURSE_VALUE[cursePenalty(config, undefined, curse)]),
    0,
  );

/** `a` is better than `b` for the same need: no level lower, and one higher or milder curses. */
function better(config: SellConfig, a: Contribution, b: Contribution): boolean | 'higher' {
  if (!a.full) return false;
  let higher = false;
  for (let i = 0; i < Math.max(a.levels.length, b.levels.length); i++) {
    const la = a.levels[i] ?? -1;
    const lb = b.levels[i] ?? -1;
    if (la < lb) return false;
    if (la > lb) higher = true;
  }
  if (!b.full) return 'higher';
  if (higher) return 'higher';
  return curseBurden(config, a) < curseBurden(config, b) - EPS;
}

/** Strongest first: more levels above the minimum, then milder curses. */
const strength = (config: SellConfig) => (a: Contribution, b: Contribution) =>
  Number(b.full) - Number(a.full) ||
  b.surplus - a.surplus ||
  curseBurden(config, a) - curseBurden(config, b) ||
  a.unit.index - b.unit.index;

function fillsText(fills: PickFill[]): string {
  return fills
    .map(
      (f) =>
        `${f.label}${f.color ? ` (${f.color})` : ''}: have ${fmt(f.have)}, ${fmt(f.after)} with picks, want ${f.want}${f.backup ? ' (as a backup)' : ''}`,
    )
    .join('; ');
}

export function pickFromSecondary(
  main: RelicSpec[],
  secondary: RelicSpec[],
  config: SellConfig,
  onProgress?: ProgressCallback,
): PicksResult {
  // The available pool: Secondary minus one copy per identical Relic Pool relic.
  const inMain = new Map<string, number>();
  for (const spec of main) {
    const key = lookKey(spec);
    inMain.set(key, (inMain.get(key) ?? 0) + 1);
  }
  const pool: RelicSpec[] = [];
  let shared = 0;
  for (const spec of secondary) {
    const key = lookKey(spec);
    const left = inMain.get(key) ?? 0;
    if (left > 0) {
      inMain.set(key, left - 1);
      shared++;
    } else pool.push(spec);
  }

  const model = buildPoolModel([...main, ...pool], config);
  const { units, buckets, index } = model;
  const rules = rollRules();
  const mainUnits = units.slice(0, main.length);
  const mainLooks = new Set(mainUnits.map((u) => lookKey(u.spec)));
  const mainItems = new Set(mainUnits.map((u) => u.spec.itemId));

  const available = new Map<string, number>();
  let skippedUnique = 0;
  const sec: Unit[] = [];
  for (const u of units.slice(main.length)) {
    u.alive = false;
    available.set(u.key, (available.get(u.key) ?? 0) + 1);
    if (!rules.isSellable(u.spec.itemId) && mainItems.has(u.spec.itemId)) skippedUnique++;
    else sec.push(u);
  }

  // How the Relic Pool stands alone.
  const have = new Map<Bucket, number>();
  for (const b of buckets) have.set(b, capped(b, model));
  const short = new Set(buckets.filter((b) => (have.get(b) ?? 0) + EPS < b.target));

  // Greedy: the relic that helps short needs most, until nothing helps.
  const current = new Map(have);
  const gainOf = (u: Unit): number => {
    let gain = 0;
    u.alive = true;
    for (const c of u.contributions) {
      if (!short.has(c.bucket)) continue;
      const delta = capped(c.bucket, model) - (current.get(c.bucket) ?? 0);
      if (delta > EPS) gain += IMPORTANCE_WEIGHT[c.bucket.importance] * delta;
    }
    u.alive = false;
    return gain;
  };
  // Equal help: milder curses, then the more valuable relic, then the first one.
  const tieBreak = (u: Unit, best: Unit): boolean => {
    const bu = totalBurden(config, u);
    const bb = totalBurden(config, best);
    if (Math.abs(bu - bb) > EPS) return bu < bb;
    if (Math.abs(u.value - best.value) > EPS) return u.value > best.value;
    return u.index < best.index;
  };
  const candidates = sec.filter((u) => u.contributions.some((c) => short.has(c.bucket)));
  const gains = new Map(candidates.map((u) => [u, gainOf(u)]));
  const picked: Unit[] = [];
  const total = candidates.length;
  for (;;) {
    let best: Unit | undefined;
    let bestGain = EPS;
    for (const u of candidates) {
      if (u.alive) continue;
      const g = gains.get(u) ?? 0;
      if (g > bestGain + EPS || (best && Math.abs(g - bestGain) <= EPS && tieBreak(u, best))) {
        best = u;
        bestGain = Math.max(g, bestGain);
      }
    }
    if (!best) break;
    best.alive = true;
    picked.push(best);
    const dirty = new Set<Unit>();
    for (const c of best.contributions) {
      if (!short.has(c.bucket)) continue;
      current.set(c.bucket, capped(c.bucket, model));
      for (const m of c.bucket.members) if (!m.unit.alive && gains.has(m.unit)) dirty.add(m.unit);
    }
    for (const u of dirty) gains.set(u, gainOf(u));
    onProgress?.(picked.length, total);
  }

  // Drop picks a later one made useless (a backup once a full copy came in).
  const helps = (u: Unit): boolean => {
    u.alive = false;
    const lost = u.contributions.some(
      (c) => short.has(c.bucket) && capped(c.bucket, model) + EPS < (current.get(c.bucket) ?? 0),
    );
    u.alive = true;
    return lost;
  };
  for (let i = picked.length - 1; i >= 0; i--) {
    const u = picked[i] as Unit;
    if (!helps(u)) {
      u.alive = false;
      picked.splice(i, 1);
      for (const c of u.contributions)
        if (short.has(c.bucket)) current.set(c.bucket, capped(c.bucket, model));
    }
  }
  onProgress?.(total, total);

  // What each pick fills: the needs that would lose coverage without it.
  const pickLines = new Map<string, PickEntry>();
  for (const u of picked) {
    const line = pickLines.get(u.key);
    if (line) {
      line.count++;
      continue;
    }
    u.alive = false;
    const fills: PickFill[] = [];
    for (const c of u.contributions) {
      const b = c.bucket;
      if (!short.has(b)) continue;
      if (capped(b, model) + EPS >= (current.get(b) ?? 0)) continue;
      fills.push({
        group: b.group,
        label: b.label,
        color: b.color,
        importance: b.importance,
        want: b.target,
        have: round(have.get(b) ?? 0),
        after: round(current.get(b) ?? 0),
        backup: !c.full,
      });
    }
    u.alive = true;
    fills.sort(
      (a, b) =>
        IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance] || a.have - b.have,
    );
    pickLines.set(u.key, {
      spec: u.spec,
      key: u.key,
      count: 1,
      available: available.get(u.key) ?? 1,
      fills,
      reason: fillsText(fills),
    });
  }
  const topImportance = (e: PickEntry) =>
    Math.max(0, ...e.fills.map((f) => IMPORTANCE_WEIGHT[f.importance]));
  const picks = [...pickLines.values()].sort(
    (a, b) => topImportance(b) - topImportance(a) || b.fills.length - a.fills.length,
  );

  // Upgrades over Relic Pool copies of needs that are met (with the picks).
  const pickedSet = new Set(picked);
  const secSet = new Set(sec);
  const upgradeLines = new Map<string, UpgradeEntry>();
  const upgradeUnits = new Map<string, Set<Unit>>();
  for (const b of buckets) {
    const counted = b.members
      .filter((c) => c.unit.alive && c.full)
      .sort(strength(config))
      .slice(0, b.target);
    if (counted.length < b.target) continue;
    const offers = b.members
      .filter((c) => c.full && !c.unit.alive && secSet.has(c.unit) && !pickedSet.has(c.unit))
      .sort(strength(config));
    let j = counted.length - 1;
    for (const offer of offers) {
      // Beat the weakest Relic Pool copy still counted (picks are already the best on offer).
      while (j >= 0 && pickedSet.has((counted[j] as Contribution).unit)) j--;
      if (j < 0) break;
      const weakest = counted[j] as Contribution;
      const verdict = better(config, offer, weakest);
      if (!verdict) break;
      j--;
      const u = offer.unit;
      const entry = upgradeLines.get(u.key) ?? {
        spec: u.spec,
        key: u.key,
        count: 0,
        available: available.get(u.key) ?? 1,
        better: [],
        reason: '',
      };
      const seen = upgradeUnits.get(u.key) ?? new Set();
      if (!seen.has(u)) {
        seen.add(u);
        entry.count = seen.size;
      }
      upgradeUnits.set(u.key, seen);
      if (!entry.better.some((l) => l.label === b.label && l.color === b.color)) {
        entry.better.push({
          group: b.group,
          label: b.label,
          color: b.color,
          importance: b.importance,
          over: weakest.unit.spec,
          higher: verdict === 'higher',
        });
      }
      upgradeLines.set(u.key, entry);
    }
  }
  const upgrades = [...upgradeLines.values()];
  for (const e of upgrades) {
    e.better.sort((a, b) => IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance]);
    e.reason = e.better
      .map(
        (l) =>
          `${l.label}${l.color ? ` (${l.color})` : ''}: ${l.higher ? 'higher level' : 'milder curses'} than one you count`,
      )
      .join('; ');
  }
  upgrades.sort(
    (a, b) =>
      Math.max(...b.better.map((l) => IMPORTANCE_WEIGHT[l.importance])) -
        Math.max(...a.better.map((l) => IMPORTANCE_WEIGHT[l.importance])) ||
      b.better.length - a.better.length,
  );

  // Possible godrolls and good rolls the plan doesn't mention.
  const rollLines = new Map<string, RollEntry>();
  for (const u of sec) {
    if (pickedSet.has(u) || u.contributions.length > 0 || mainLooks.has(lookKey(u.spec))) continue;
    const roll = rollQuality(u.spec, index, config, model.ignoredFamilies);
    if (!roll) continue;
    const line = rollLines.get(u.key);
    if (line) line.count++;
    else
      rollLines.set(u.key, {
        spec: u.spec,
        key: u.key,
        count: 1,
        available: available.get(u.key) ?? 1,
        roll,
      });
  }

  const needs: PickNeed[] = [...short].map((b) => ({
    group: b.group,
    label: b.label,
    color: b.color,
    importance: b.importance,
    want: b.target,
    have: round(have.get(b) ?? 0),
    after: round(current.get(b) ?? 0),
  }));
  needs.sort(
    (a, b) =>
      Number(a.after + EPS >= a.want) - Number(b.after + EPS >= b.want) ||
      IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance],
  );

  return {
    picks,
    upgrades,
    rolls: [...rollLines.values()].sort(
      (a, b) => Number(b.roll === 'godroll') - Number(a.roll === 'godroll'),
    ),
    needs,
    skippedUnique,
    shared,
    availableCount: pool.length,
    warnings: model.warnings,
  };
}
