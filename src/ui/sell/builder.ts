/**
 * The combo builder's state and edits, kept by the page so other tabs (results) can fill it.
 * Pure functions: no React.
 *
 * A builder makes one or more needs:
 * - "All of": effects every one of them has.
 * - "Any of" slots: any one option fills the slot, all options share the same copies.
 * - Permutation columns: one pick per column, a separate need for every combination of picks.
 *   Several levels of one effect in a column ("Poisoned +0 / +1 / +2") make each pick count that
 *   level only, since an effect that doesn't stack with itself is wanted once per level.
 * One effect in total makes a single-effect need: the step before a good roll (2 together) and a
 * godroll (3).
 */
import type { RelicSpec } from '../../core/builds/builds.ts';
import { catalog } from '../../core/catalog/catalog.ts';
import type {
  ColorScope,
  ComboNeed,
  EffectNeed,
  Importance,
  Need,
  NeedBase,
} from '../../core/sell/config.ts';
import type { EffectIndex } from '../../core/sell/effects.ts';

/** What every need the builder adds gets (each can be changed afterwards). */
export interface BuilderSettings {
  copies: number;
  colorScope: ColorScope;
  importance: Importance;
}

export const DEFAULT_BUILDER_SETTINGS: BuilderSettings = {
  copies: 1,
  colorScope: 'perColor',
  importance: 'mustKeep',
};

export interface Builder {
  /** Effects the relic must all have. */
  all: number[];
  /** "Any of" slots (may be empty while being filled). */
  anyOf: number[][];
  /** Permutation columns: one need per combination of picks (may be empty while being filled). */
  perms: number[][];
  settings: BuilderSettings;
  /** The need being edited (saving replaces it), or null for new needs. */
  editing: { group: number; need: number } | null;
  /** Bumped when another tab fills the builder, so it scrolls into view and takes the focus. */
  focus: number;
}

export const emptyBuilder = (focus = 0, settings = DEFAULT_BUILDER_SETTINGS): Builder => ({
  all: [],
  anyOf: [],
  perms: [],
  settings,
  editing: null,
  focus,
});

/**
 * Where an effect sits: the "all of" row, an "any of" slot, a permutation column, or a new slot
 * or column (drop targets). Strings, so they compare by value and fit in drag data.
 */
export type Place = 'all' | `any:${number}` | `perm:${number}` | 'newAny' | 'newPerm';

const without = (list: number[], id: number) => list.filter((x) => x !== id);
const indexOf = (place: Place, kind: 'any' | 'perm'): number | null =>
  place.startsWith(`${kind}:`) ? Number(place.slice(kind.length + 1)) : null;

/** Remove `id` from `from`. */
export function removeEffect(b: Builder, id: number, from: Place): Builder {
  if (from === 'all') return { ...b, all: without(b.all, id) };
  const any = indexOf(from, 'any');
  if (any !== null) return { ...b, anyOf: b.anyOf.map((s, i) => (i === any ? without(s, id) : s)) };
  const perm = indexOf(from, 'perm');
  if (perm !== null) {
    return { ...b, perms: b.perms.map((s, i) => (i === perm ? without(s, id) : s)) };
  }
  return b;
}

/** Add `id` to `to` (no duplicates in one place). */
export function addEffect(b: Builder, id: number, to: Place): Builder {
  const add = (s: number[]) => (s.includes(id) ? s : [...s, id]);
  if (to === 'all') return { ...b, all: add(b.all) };
  if (to === 'newAny') return { ...b, anyOf: [...b.anyOf, [id]] };
  if (to === 'newPerm') return { ...b, perms: [...b.perms, [id]] };
  const any = indexOf(to, 'any');
  if (any !== null) return { ...b, anyOf: b.anyOf.map((s, i) => (i === any ? add(s) : s)) };
  const perm = indexOf(to, 'perm');
  if (perm !== null) return { ...b, perms: b.perms.map((s, i) => (i === perm ? add(s) : s)) };
  return b;
}

/** Drag and drop: move `id` from one place to another. A slot or column emptied by it goes away. */
export function moveEffect(b: Builder, id: number, from: Place, to: Place): Builder {
  if (from === to) return b;
  const moved = addEffect(removeEffect(b, id, from), id, to);
  const any = indexOf(from, 'any');
  if (any !== null && moved.anyOf[any]?.length === 0) {
    return { ...moved, anyOf: moved.anyOf.filter((_, i) => i !== any) };
  }
  const perm = indexOf(from, 'perm');
  if (perm !== null && moved.perms[perm]?.length === 0) {
    return { ...moved, perms: moved.perms.filter((_, i) => i !== perm) };
  }
  return moved;
}

/** Every combination of one pick per column (one empty combination without columns). */
function product(columns: number[][]): number[][] {
  return columns.reduce<number[][]>(
    (acc, column) => acc.flatMap((picked) => column.map((id) => [...picked, id])),
    [[]],
  );
}

/** Picks that count their level only: effects sharing a column with another level of themselves. */
function exactPicks(columns: number[][], index: EffectIndex | undefined): Set<number> {
  const exact = new Set<number>();
  if (!index) return exact;
  for (const column of columns) {
    const families = column.map((id) => index.meta(id)?.family);
    column.forEach((id, i) => {
      const family = families[i];
      if (family && families.some((f, j) => j !== i && f === family)) exact.add(id);
    });
  }
  return exact;
}

/**
 * The needs the builder would add: one per combination of permutation picks, each with the
 * "all of" effects and the "any of" slots. Empty when nothing is picked.
 */
export function builderDrafts(b: Builder, index?: EffectIndex): Need[] {
  const filledAny = b.anyOf.filter((s) => s.length > 0);
  // A one-option slot is just another required effect.
  const required = [...b.all, ...filledAny.filter((s) => s.length === 1).flat()];
  const anyOf = filledAny.filter((s) => s.length > 1);
  const columns = b.perms.filter((c) => c.length > 0);
  const exact = exactPicks(columns, index);
  const level = (id: number) => index?.meta(id)?.level ?? 0;
  const drafts: Need[] = [];
  for (const picks of product(columns)) {
    const effects = [...new Set([...required, ...picks])];
    if (effects.length + anyOf.length === 0) continue;
    const exactHere = picks.filter((id) => exact.has(id));
    if (effects.length === 1 && anyOf.length === 0) {
      const id = effects[0] as number;
      const single: EffectNeed = { kind: 'effect', effect: id, ...b.settings, relics: 'any' };
      if (exactHere.includes(id)) {
        single.minLevel = level(id);
        single.exactLevel = true;
      }
      drafts.push(single);
      continue;
    }
    const need: ComboNeed = { kind: 'combo', effects, ...b.settings, relics: 'any' };
    if (anyOf.length) need.anyOf = anyOf.map((s) => [...s]);
    if (exactHere.length) {
      need.minLevels = Object.fromEntries(exactHere.map((id) => [id, level(id)]));
      need.exactLevels = exactHere;
    }
    drafts.push(need);
  }
  return drafts;
}

/** How many needs the builder would add. */
export const builderCount = (b: Builder): number => builderDrafts(b).length;

/** A short readable name for a draft (preview list). */
export function draftLabel(need: Need, index: EffectIndex): string {
  const name = (id: number) => {
    const exact =
      need.kind === 'effect' ? need.exactLevel === true : (need.exactLevels?.includes(id) ?? false);
    const meta = index.meta(id);
    if (!meta) return String(id);
    // "Family +0 only": the base effect's name has no level in it.
    return exact ? `${meta.family} +${meta.level} only` : meta.name;
  };
  if (need.kind === 'effect') return name(need.effect);
  return [
    ...need.effects.map(name),
    ...(need.anyOf ?? []).map((s) => `any of (${s.map(name).join(' / ')})`),
  ].join(' + ');
}

/** Load a need into the builder to edit it (or to start a variant of it). */
export const builderFromNeed = (
  need: Need,
  at: { group: number; need: number } | null,
  focus: number,
): Builder => ({
  all: need.kind === 'effect' ? [need.effect] : [...need.effects],
  anyOf: need.kind === 'effect' ? [] : (need.anyOf ?? []).map((s) => [...s]),
  perms: [],
  settings: { copies: need.copies, colorScope: need.colorScope, importance: need.importance },
  editing: at,
  focus,
});

/** A relic's effects (not its curses) as a new combo. */
export function builderFromRelic(spec: RelicSpec, index: EffectIndex, focus: number): Builder {
  const all = spec.effects
    .filter((e): e is number => e !== null)
    .map((e) => catalog().canonicalEffect(e))
    .filter((e) => index.meta(e) !== undefined);
  return { ...emptyBuilder(focus), all: [...new Set(all)] };
}

/**
 * The edited need with the builder's effects and settings (copies, count, importance). Keeps its
 * colors, curse tolerance, relic kind and the levels of effects still in it.
 */
export function applyEdit(old: Need, draft: Need): Need {
  const base: NeedBase = {
    copies: draft.copies,
    colorScope: draft.colorScope,
    importance: draft.importance,
    ...(old.colors ? { colors: old.colors } : {}),
    ...(old.curseOverrides ? { curseOverrides: old.curseOverrides } : {}),
    ...((old.relics ?? draft.relics) ? { relics: old.relics ?? draft.relics } : {}),
  };
  const oldMin: Record<number, number> =
    old.kind === 'combo'
      ? { ...old.minLevels }
      : old.minLevel !== undefined
        ? { [old.effect]: old.minLevel }
        : {};
  const oldExact =
    old.kind === 'combo' ? (old.exactLevels ?? []) : old.exactLevel ? [old.effect] : [];

  if (draft.kind === 'effect') {
    const next: EffectNeed = { ...base, kind: 'effect', effect: draft.effect };
    const min = draft.minLevel ?? oldMin[draft.effect];
    if (min !== undefined) next.minLevel = min;
    if (draft.exactLevel || oldExact.includes(draft.effect)) next.exactLevel = true;
    return next;
  }
  const ids = new Set([...draft.effects, ...(draft.anyOf ?? []).flat()]);
  const next: ComboNeed = { ...base, kind: 'combo', effects: draft.effects };
  if (draft.anyOf) next.anyOf = draft.anyOf;
  const minLevels = Object.fromEntries(
    Object.entries({ ...oldMin, ...draft.minLevels }).filter(([id]) => ids.has(Number(id))),
  );
  if (Object.keys(minLevels).length) next.minLevels = minLevels;
  const exact = [...new Set([...oldExact, ...(draft.exactLevels ?? [])])].filter((id) =>
    ids.has(id),
  );
  if (exact.length) next.exactLevels = exact;
  return next;
}

/** Keep `editing` on the same need when the list changes: a need moved (or removed, to = null). */
export function followEdit(b: Builder, group: number, from: number, to: number | null): Builder {
  const at = b.editing;
  if (!at || at.group !== group) return b;
  let need = at.need;
  if (need === from) {
    if (to === null) return { ...b, editing: null };
    need = to;
  } else {
    if (from < need) need--;
    if (to !== null && to <= need) need++;
  }
  return need === at.need ? b : { ...b, editing: { group, need } };
}
