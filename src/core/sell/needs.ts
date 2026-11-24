/**
 * Helpers on needs: default levels, identity, and merging lists of needs
 * (one plan is one list of needs; groups only survive for older files).
 */

import { rollRules } from '../catalog/catalog.ts';
import { IMPORTANCES, type Need, needEffectIds, RELIC_COLORS } from './config.ts';
import type { EffectIndex } from './effects.ts';

/**
 * Lowest level that should count for `id` by default: for an effect that stacks with itself, the
 * lowest level of its family that can roll on the same kinds of relics (keep the highest, fall
 * back down). Deep of Night relics also roll some normal levels: Physical Attack Up +4 is deep
 * only, and deep relics roll +2, +3 and +4, so +4 falls back to +2. For the rest, its own level.
 */
export function defaultMinLevel(index: EffectIndex, id: number): number | undefined {
  const meta = index.meta(id);
  if (!meta || !index.stacks(id, id)) return undefined;
  const family = index.family(meta.family);
  const on = rollRules().rollsOn(meta.id);
  const shares = (other: number) => {
    const o = rollRules().rollsOn(other);
    return (on.normal && o.normal) || (on.deep && o.deep);
  };
  // Effects no random relic rolls (fixed-effect relics, unknown ids): by the effect's own kind.
  const candidates =
    on.normal || on.deep
      ? family.filter((m) => shares(m.id))
      : family.filter((m) => m.pool === meta.pool || m.pool === 'any');
  const lowest = Math.min(meta.level, ...candidates.map((m) => m.level));
  return lowest < meta.level ? lowest : undefined;
}

/** The need with default levels filled in where it has none. */
export function withDefaultLevels(need: Need, index: EffectIndex): Need {
  if (need.kind === 'effect') {
    if (need.minLevel !== undefined || need.exactLevel) return need;
    const level = defaultMinLevel(index, need.effect);
    return level === undefined ? need : { ...need, minLevel: level };
  }
  const minLevels = { ...need.minLevels };
  for (const id of needEffectIds(need)) {
    if (minLevels[id] !== undefined || need.exactLevels?.includes(id)) continue;
    const level = defaultMinLevel(index, id);
    if (level !== undefined) minLevels[id] = level;
  }
  return Object.keys(minLevels).length ? { ...need, minLevels } : need;
}

/**
 * What a need asks for, without how many or how much it matters: equal keys = the same need.
 * Written differently but meaning the same also gives equal keys: members in any order, a level
 * set to the effect's own level or left unset (with `index`), every color ticked or none.
 */
export function needKey(need: Need, index?: EffectIndex): string {
  const picked = need.colorScope === 'perColor' ? [...new Set(need.colors ?? [])].sort() : [];
  const colors = picked.length === RELIC_COLORS.length ? '' : picked.join('/');
  const member = (id: number, min: number | undefined, exact: boolean) =>
    `${id}@${min ?? index?.meta(id)?.level ?? ''}${exact ? '!' : ''}`;
  const what =
    need.kind === 'effect'
      ? `E${member(need.effect, need.minLevel, need.exactLevel === true)}`
      : `C${[...new Set(need.effects)]
          .sort((a, b) => a - b)
          .map((id) => member(id, need.minLevels?.[id], need.exactLevels?.includes(id) ?? false))
          .join(',')}${(need.anyOf ?? [])
          .map(
            (slot) =>
              `|any:${[...new Set(slot)]
                .sort((a, b) => a - b)
                .map((id) =>
                  member(id, need.minLevels?.[id], need.exactLevels?.includes(id) ?? false),
                )
                .join(',')}`,
          )
          .sort()
          .join('')}`;
  return `${what}|${need.colorScope}|${colors}|${need.relics ?? 'auto'}`;
}

/** What adding a need to a list does: a new need, more copies / importance for one, or nothing. */
export type MergeOutcome = 'added' | 'updated' | 'duplicate';

const rank = (n: Need) => IMPORTANCES.indexOf(n.importance);

/**
 * Add `incoming` needs to `existing`: a need already there keeps the larger copy count and the
 * higher importance (copies a set of builds needs = the most any one build uses, never the sum).
 */
export function mergeNeeds(
  existing: Need[],
  incoming: Need[],
  /** Lets "level left unset" and "set to its own level" count as the same. */
  index?: EffectIndex,
): { needs: Need[]; added: number; updated: number; duplicates: number; outcomes: MergeOutcome[] } {
  const needs = existing.slice();
  const at = new Map(needs.map((n, i) => [needKey(n, index), i]));
  let added = 0;
  let updated = 0;
  let duplicates = 0;
  const outcomes: MergeOutcome[] = [];
  for (const n of incoming) {
    const key = needKey(n, index);
    const i = at.get(key);
    if (i === undefined) {
      at.set(key, needs.length);
      needs.push(n);
      added++;
      outcomes.push('added');
      continue;
    }
    const old = needs[i] as Need;
    const merged: Need = {
      ...old,
      copies: Math.max(old.copies, n.copies),
      importance: rank(n) > rank(old) ? n.importance : old.importance,
    };
    if (merged.copies !== old.copies || merged.importance !== old.importance) {
      needs[i] = merged;
      updated++;
      outcomes.push('updated');
    } else {
      duplicates++;
      outcomes.push('duplicate');
    }
  }
  return { needs, added, updated, duplicates, outcomes };
}
