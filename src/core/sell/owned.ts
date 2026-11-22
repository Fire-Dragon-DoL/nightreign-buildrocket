/**
 * How many relics of each color carry an effect (aliases count as their effect), and how many
 * would be left after selling some.
 */
import type { RelicSpec } from '../builds/builds.ts';
import { catalog } from '../catalog/catalog.ts';

/** Effect id → relics carrying it, per color: [red, blue, yellow, green]. */
export type OwnedCounts = Map<number, number[]>;

const COLORS = 4;

/** Count `relics` (each `count` times) by effect and color. Relics of no color are skipped. */
export function countEffects(relics: { spec: RelicSpec; count: number }[]): OwnedCounts {
  const counts: OwnedCounts = new Map();
  for (const { spec, count } of relics) {
    const color = catalog().relic(spec.itemId)?.color;
    if (color === undefined || color < 0 || color >= COLORS) continue;
    // One relic counts once per effect, even if it carries it twice.
    const ids = new Set(
      [...spec.effects, ...spec.curses]
        .filter((e): e is number => e !== null)
        .map((e) => catalog().canonicalEffect(e)),
    );
    for (const id of ids) {
      const row = counts.get(id) ?? new Array<number>(COLORS).fill(0);
      row[color] = (row[color] ?? 0) + count;
      counts.set(id, row);
    }
  }
  return counts;
}

/** Owned counts of a whole pool. */
export const ownedCounts = (pool: RelicSpec[]): OwnedCounts =>
  countEffects(pool.map((spec) => ({ spec, count: 1 })));

/** Per color: owned now and left after `sold`. */
export function leftAfter(
  owned: OwnedCounts,
  sold: OwnedCounts,
  id: number,
): { owned: number; left: number }[] {
  const have = owned.get(id) ?? [];
  const gone = sold.get(id) ?? [];
  return Array.from({ length: COLORS }, (_, i) => {
    const n = have[i] ?? 0;
    return { owned: n, left: Math.max(0, n - (gone[i] ?? 0)) };
  });
}
