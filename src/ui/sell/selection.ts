/**
 * Needs ticked in the Needs & combos list (to export them). Kept as `group:need` positions, moved
 * along when needs are reordered or removed. Shift-click ticks (or unticks) a whole range.
 */
import { emptyConfig, type Need, type SellConfig } from '../../core/sell/config.ts';
import { DEFAULT_GROUP } from './configEdit.ts';

export interface Selection {
  keys: ReadonlySet<string>;
  /** Last box clicked without Shift: where a Shift-click range starts. */
  anchor: { group: number; need: number } | null;
}

export const emptySelection = (): Selection => ({ keys: new Set(), anchor: null });

const key = (group: number, need: number) => `${group}:${need}`;

export const isSelected = (s: Selection, group: number, need: number): boolean =>
  s.keys.has(key(group, need));

/**
 * Click on a need's box. With Shift (and an earlier click in the same group) every need between the
 * two gets the clicked box's new state; otherwise only that one changes.
 */
export function clickSelect(s: Selection, group: number, need: number, shift: boolean): Selection {
  const keys = new Set(s.keys);
  const on = !keys.has(key(group, need));
  const from = shift && s.anchor?.group === group ? s.anchor.need : need;
  for (let i = Math.min(from, need); i <= Math.max(from, need); i++) {
    if (on) keys.add(key(group, i));
    else keys.delete(key(group, i));
  }
  return { keys, anchor: shift && s.anchor ? s.anchor : { group, need } };
}

/** Tick every need of a group (`on`) or none. */
export function selectAll(s: Selection, group: number, count: number, on: boolean): Selection {
  const keys = new Set([...s.keys].filter((k) => !k.startsWith(`${group}:`)));
  if (on) for (let i = 0; i < count; i++) keys.add(key(group, i));
  return { keys, anchor: null };
}

export const selectedIn = (s: Selection, group: number): number =>
  [...s.keys].filter((k) => k.startsWith(`${group}:`)).length;

/** Positions of a group's needs after `change` maps old positions to new ones (null: removed). */
function remap(s: Selection, group: number, change: (i: number) => number | null): Selection {
  const keys = new Set<string>();
  for (const k of s.keys) {
    const [g, n] = k.split(':').map(Number) as [number, number];
    if (g !== group) keys.add(k);
    else {
      const to = change(n);
      if (to !== null) keys.add(key(g, to));
    }
  }
  return { keys, anchor: null };
}

/** The need at `from` moved to `to` (like `moveNeed`). */
export const selectionAfterMove = (s: Selection, group: number, from: number, to: number) =>
  remap(s, group, (i) => {
    if (i === from) return to;
    if (from < to && i > from && i <= to) return i - 1;
    if (to < from && i >= to && i < from) return i + 1;
    return i;
  });

/** The need at `removed` was deleted. */
export const selectionAfterRemove = (s: Selection, group: number, removed: number) =>
  remap(s, group, (i) => (i === removed ? null : i > removed ? i - 1 : i));

/** The ticked needs, in list order. */
export const selectedNeeds = (config: SellConfig, s: Selection): Need[] =>
  config.groups.flatMap((g, gi) => g.needs.filter((_, ni) => isSelected(s, gi, ni)));

/**
 * A plan holding only `needs`, to share: no stacking rules, curse defaults or never-sell list from
 * your own plan. Opens as a plan, or merges into one with "Import needs".
 */
export const sharedPlan = (needs: Need[]): SellConfig => ({
  ...emptyConfig(),
  groups: [{ name: DEFAULT_GROUP, needs }],
});

/** Every need of a plan (older plans may have several groups). */
export const planNeeds = (config: SellConfig): Need[] => config.groups.flatMap((g) => g.needs);
