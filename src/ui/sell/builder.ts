/**
 * The combo builder's state and edits, kept by the page so other tabs (results) can fill it.
 * Pure functions: no React.
 */
import type { RelicSpec } from '../../core/builds/builds.ts';
import { catalog } from '../../core/catalog/catalog.ts';
import type { ComboNeed, Need } from '../../core/sell/config.ts';
import type { EffectIndex } from '../../core/sell/effects.ts';

export interface Builder {
  /** Effects the relic must all have. */
  all: number[];
  /** "Any of" slots (may be empty while being filled). */
  anyOf: number[][];
  /** The combo being edited (saving replaces it), or null for a new combo. */
  editing: { group: number; need: number } | null;
  /** Bumped when another tab fills the builder, so it scrolls into view and takes the focus. */
  focus: number;
}

export const emptyBuilder = (focus = 0): Builder => ({ all: [], anyOf: [], editing: null, focus });

/** Where an effect sits in the builder: the "all of" row, an "any of" slot, or a new slot. */
export type Place = 'all' | number | 'newSlot';

const without = (list: number[], id: number) => list.filter((x) => x !== id);

/** Remove `id` from `from`; slots left empty by the move are dropped. */
export function removeEffect(b: Builder, id: number, from: Place): Builder {
  if (from === 'all') return { ...b, all: without(b.all, id) };
  if (from === 'newSlot') return b;
  return { ...b, anyOf: b.anyOf.map((s, i) => (i === from ? without(s, id) : s)) };
}

/** Add `id` to `to` (no duplicates in one place). */
export function addEffect(b: Builder, id: number, to: Place): Builder {
  if (to === 'all') return b.all.includes(id) ? b : { ...b, all: [...b.all, id] };
  if (to === 'newSlot') return { ...b, anyOf: [...b.anyOf, [id]] };
  return {
    ...b,
    anyOf: b.anyOf.map((s, i) => (i === to && !s.includes(id) ? [...s, id] : s)),
  };
}

/** Drag and drop: move `id` from one place to another. */
export function moveEffect(b: Builder, id: number, from: Place, to: Place): Builder {
  if (from === to) return b;
  const moved = addEffect(removeEffect(b, id, from), id, to);
  // A slot emptied by the move goes away (but not one the user just added and hasn't filled).
  if (typeof from !== 'number' || (moved.anyOf[from]?.length ?? 1) > 0) return moved;
  return { ...moved, anyOf: moved.anyOf.filter((_, i) => i !== from) };
}

/** The combo the builder would add, or null if it needs more (2+ slots in total). */
export function builderDraft(b: Builder): ComboNeed | null {
  const filled = b.anyOf.filter((s) => s.length > 0);
  // A one-option slot is just another required effect.
  const all = [...new Set([...b.all, ...filled.filter((s) => s.length === 1).flat()])];
  const anyOf = filled.filter((s) => s.length > 1);
  if (all.length + anyOf.length < 2) return null;
  const need: ComboNeed = {
    kind: 'combo',
    effects: all,
    copies: 1,
    colorScope: 'perColor',
    importance: 'mustKeep',
    relics: 'any',
  };
  if (anyOf.length) need.anyOf = anyOf;
  return need;
}

/** Load a combo into the builder to edit it. */
export const builderFromNeed = (
  need: ComboNeed,
  at: { group: number; need: number } | null,
  focus: number,
): Builder => ({
  all: [...need.effects],
  anyOf: (need.anyOf ?? []).map((s) => [...s]),
  editing: at,
  focus,
});

/** A relic's effects (not its curses) as a new combo. */
export function builderFromRelic(spec: RelicSpec, index: EffectIndex, focus: number): Builder {
  const all = spec.effects
    .filter((e): e is number => e !== null)
    .map((e) => catalog().canonicalEffect(e))
    .filter((e) => index.meta(e) !== undefined);
  return { all: [...new Set(all)], anyOf: [], editing: null, focus };
}

/**
 * The edited combo with the builder's effects: keeps copies, importance, colors, curses and the
 * levels of effects still in it.
 */
export function applyEdit(old: Need, draft: ComboNeed): ComboNeed {
  const ids = new Set([...draft.effects, ...(draft.anyOf ?? []).flat()]);
  const base: ComboNeed =
    old.kind === 'combo'
      ? { ...old }
      : { ...draft, copies: old.copies, importance: old.importance, colorScope: old.colorScope };
  const { anyOf: _a, minLevels: _m, exactLevels: _e, ...rest } = base;
  const next: ComboNeed = { ...rest, effects: draft.effects };
  if (draft.anyOf) next.anyOf = draft.anyOf;
  const minLevels = Object.fromEntries(
    Object.entries(old.kind === 'combo' ? (old.minLevels ?? {}) : {}).filter(([id]) =>
      ids.has(Number(id)),
    ),
  );
  if (Object.keys(minLevels).length) next.minLevels = minLevels;
  const exact = (old.kind === 'combo' ? (old.exactLevels ?? []) : []).filter((id) => ids.has(id));
  if (exact.length) next.exactLevels = exact;
  return next;
}

/** Keep `editing` on the same combo when the list changes: a need moved (or removed, to = null). */
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
