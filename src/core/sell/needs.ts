/**
 * Helpers on needs: default levels, identity, and merging lists of needs
 * (one plan is one list of needs; groups only survive for older files).
 */
import { IMPORTANCES, type Need, needEffectIds } from './config.ts';
import type { EffectIndex } from './effects.ts';

/**
 * Lowest level that should count for `id` by default: for an effect that stacks with itself, the
 * lowest level of its family on the same kind of relic (keep the highest, fall back down); for
 * the rest, its own level.
 */
export function defaultMinLevel(index: EffectIndex, id: number): number | undefined {
  const meta = index.meta(id);
  if (!meta || !index.stacks(id, id)) return undefined;
  const levels = index
    .family(meta.family)
    .filter((m) => m.pool === meta.pool || m.pool === 'any')
    .map((m) => m.level);
  const lowest = Math.min(...levels);
  return lowest < meta.level ? lowest : undefined;
}

/** The need with default levels filled in where it has none. */
export function withDefaultLevels(need: Need, index: EffectIndex): Need {
  if (need.kind === 'effect') {
    if (need.minLevel !== undefined) return need;
    const level = defaultMinLevel(index, need.effect);
    return level === undefined ? need : { ...need, minLevel: level };
  }
  const minLevels = { ...need.minLevels };
  for (const id of needEffectIds(need)) {
    if (minLevels[id] !== undefined) continue;
    const level = defaultMinLevel(index, id);
    if (level !== undefined) minLevels[id] = level;
  }
  return Object.keys(minLevels).length ? { ...need, minLevels } : need;
}

/** What a need asks for, without how many or how much it matters: equal keys = the same need. */
export function needKey(need: Need): string {
  const colors = need.colorScope === 'perColor' ? [...(need.colors ?? [])].sort().join('/') : '';
  const what =
    need.kind === 'effect'
      ? `E${need.effect}@${need.minLevel ?? ''}`
      : `C${[...need.effects]
          .sort((a, b) => a - b)
          .map((id) => `${id}@${need.minLevels?.[id] ?? ''}`)
          .join(',')}${(need.anyOf ?? [])
          .map(
            (slot) =>
              `|any:${[...slot]
                .sort((a, b) => a - b)
                .map((id) => `${id}@${need.minLevels?.[id] ?? ''}`)
                .join(',')}`,
          )
          .sort()
          .join('')}`;
  return `${what}|${need.colorScope}|${colors}|${need.relics ?? 'auto'}`;
}

const rank = (n: Need) => IMPORTANCES.indexOf(n.importance);

/**
 * Add `incoming` needs to `existing`: a need already there keeps the larger copy count and the
 * higher importance (copies a set of builds needs = the most any one build uses, never the sum).
 */
export function mergeNeeds(
  existing: Need[],
  incoming: Need[],
): { needs: Need[]; added: number; updated: number } {
  const needs = existing.slice();
  const at = new Map(needs.map((n, i) => [needKey(n), i]));
  let added = 0;
  let updated = 0;
  for (const n of incoming) {
    const key = needKey(n);
    const i = at.get(key);
    if (i === undefined) {
      at.set(key, needs.length);
      needs.push(n);
      added++;
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
    }
  }
  return { needs, added, updated };
}
