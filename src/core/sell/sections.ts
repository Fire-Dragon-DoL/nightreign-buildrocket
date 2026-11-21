/**
 * The sell list grouped the way the game's relic menu sorts things (deep or
 * normal → color → size), with a suggested in-game search per group.
 */
import { type RelicSpec, specKey } from '../builds/builds.ts';
import { catalog, RELIC_COLOR_NAMES, rollRules } from '../catalog/catalog.ts';
import type { SellEntry, SellPlan } from './planner.ts';

/** In-game search limits: up to 3 AND-ed filters, each OR-ing up to 4 effects. */
export const MAX_FILTERS = 3;
export const MAX_EFFECTS_PER_FILTER = 4;

export interface SearchSuggestion {
  /** AND of filters; a filter matches a relic carrying any of its effects. Empty = no filter. */
  filters: number[][];
  /** Relics of this group the search shows (owned, sellable or not). */
  shows: number;
  /** Of those, copies to sell. */
  sell: number;
}

export interface SellSection {
  key: string;
  deep: boolean;
  color: string;
  size: number;
  entries: SellEntry[];
  /** Copies to sell in this section. */
  count: number;
  search: SearchSuggestion;
}

const sectionKey = (spec: RelicSpec) => {
  const info = catalog().relic(spec.itemId);
  return {
    deep: info?.deep ?? false,
    color: info ? RELIC_COLOR_NAMES[info.color] : 'Unknown',
    size: rollRules().slotCount(spec.itemId),
  };
};
const keyOf = (k: ReturnType<typeof sectionKey>) => `${k.deep ? 'D' : 'N'}|${k.color}|${k.size}`;
const COLOR_ORDER = ['Red', 'Blue', 'Yellow', 'Green'];

interface Item {
  effects: number[];
  /** Owned copies of this exact relic. */
  owned: number;
  /** Copies to sell. */
  sell: number;
}

const matches = (filters: number[][], effects: number[]) =>
  filters.every((filter) => filter.some((e) => effects.includes(e)));

function evaluate(filters: number[][], items: Item[]): { shows: number; sell: number } {
  let shows = 0;
  let sell = 0;
  for (const item of items) {
    if (!matches(filters, item.effects)) continue;
    shows += item.owned;
    sell += item.sell;
  }
  return { shows, sell };
}

/** Selling the most while showing the fewest relics to keep. */
const score = (r: { shows: number; sell: number }) => r.sell - (r.shows - r.sell);

/** Greedy search: add one effect at a time (to a filter, or as a new filter) while it helps. */
export function suggestSearch(items: Item[]): SearchSuggestion {
  let filters: number[][] = [];
  let best = evaluate(filters, items);
  const candidates = [...new Set(items.filter((i) => i.sell > 0).flatMap((i) => i.effects))];
  for (;;) {
    let next: number[][] | undefined;
    let nextResult = best;
    const consider = (f: number[][]) => {
      const r = evaluate(f, items);
      if (score(r) > score(nextResult)) {
        next = f;
        nextResult = r;
      }
    };
    for (const effect of candidates) {
      if (filters.length < MAX_FILTERS) consider([...filters, [effect]]);
      filters.forEach((filter, i) => {
        if (filter.length >= MAX_EFFECTS_PER_FILTER || filter.includes(effect)) return;
        consider(filters.map((f, j) => (j === i ? [...f, effect] : f)));
      });
    }
    if (!next) break;
    filters = next;
    best = nextResult;
  }
  return { filters, ...best };
}

export function sectionPlan(plan: SellPlan, pool: RelicSpec[]): SellSection[] {
  const sections = new Map<string, SellSection>();
  for (const entry of plan.sell) {
    const k = sectionKey(entry.spec);
    const key = keyOf(k);
    const section = sections.get(key) ?? {
      key,
      ...k,
      entries: [],
      count: 0,
      search: { filters: [], shows: 0, sell: 0 },
    };
    section.entries.push(entry);
    section.count += entry.count;
    sections.set(key, section);
  }
  // Items per section: every owned relic of that kind, with how many copies the plan sells.
  const sellCount = new Map<string, number>();
  for (const e of plan.sell) sellCount.set(e.key, (sellCount.get(e.key) ?? 0) + e.count);
  const items = new Map<string, Map<string, Item>>();
  for (const spec of pool) {
    const key = keyOf(sectionKey(spec));
    if (!sections.has(key)) continue;
    const byKey = items.get(key) ?? new Map<string, Item>();
    const k = specKey(spec);
    const item = byKey.get(k) ?? {
      effects: spec.effects.filter((e): e is number => e !== null),
      owned: 0,
      sell: sellCount.get(k) ?? 0,
    };
    item.owned++;
    byKey.set(k, item);
    items.set(key, byKey);
  }
  for (const section of sections.values()) {
    section.search = suggestSearch([...(items.get(section.key)?.values() ?? [])]);
  }
  return [...sections.values()].sort(
    (a, b) =>
      Number(a.deep) - Number(b.deep) ||
      COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color) ||
      a.size - b.size,
  );
}
