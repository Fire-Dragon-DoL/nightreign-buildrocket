import { type Build, type RelicSpec, specKey } from '../builds/builds.ts';
import { relicName } from '../catalog/catalog.ts';

/** One relic the pool lacks, with the builds it blocks. */
export interface MissingRelic {
  spec: RelicSpec;
  /** Copies needed: the most copies of this relic any single build uses. */
  needed: number;
  /** Identical copies the pool already has. */
  owned: number;
  /** needed - owned (always > 0). */
  missing: number;
  /**
   * Indices (into the builds passed in) of the builds that cannot be made
   * because of this relic: they use more copies of it than the pool has.
   */
  builds: number[];
}

export interface MissingRelicsResult {
  /** Missing relics, the ones blocking the most builds first. */
  missing: MissingRelic[];
  /** Indices of builds the pool can already make. */
  complete: number[];
  /** Indices of builds that need at least one relic the pool lacks. */
  blocked: number[];
}

export type ProgressCallback = (done: number, total: number) => void;

/** Copies of each relic, keyed by `specKey`. */
export function countSpecs(relics: Iterable<RelicSpec>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const relic of relics) {
    const key = specKey(relic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * The smallest relic collection that can make every build: each relic as many
 * times as the build using it most needs it. Used as the pool when a builds
 * file carries no inventory (relics can be shared between presets in game,
 * so a relic used by two builds is one relic).
 */
export function relicsOfBuilds(builds: Build[]): RelicSpec[] {
  const most = new Map<string, { spec: RelicSpec; count: number }>();
  for (const build of builds) {
    const inBuild = new Map<string, { spec: RelicSpec; count: number }>();
    for (const relic of build.relics) {
      if (!relic) continue;
      const key = specKey(relic);
      const entry = inBuild.get(key) ?? { spec: relic, count: 0 };
      entry.count++;
      inBuild.set(key, entry);
    }
    for (const [key, entry] of inBuild) {
      if ((most.get(key)?.count ?? 0) < entry.count) most.set(key, entry);
    }
  }
  return [...most.values()].flatMap(({ spec, count }) => Array.from({ length: count }, () => spec));
}

/**
 * Which relics `pool` lacks to make every one of `builds`. Relics are matched
 * by exact content (item, effects and curses: `specKey`). One relic can sit
 * in several presets, so the copies needed per relic is the maximum used by
 * any single build, not the sum.
 */
export function findMissingRelics(
  builds: Build[],
  pool: Iterable<RelicSpec>,
  onProgress?: ProgressCallback,
): MissingRelicsResult {
  const owned = countSpecs(pool);
  const byKey = new Map<string, MissingRelic>();
  const blocked = new Set<number>();

  builds.forEach((build, index) => {
    const used = new Map<string, { spec: RelicSpec; count: number }>();
    for (const relic of build.relics) {
      if (!relic) continue;
      const key = specKey(relic);
      const entry = used.get(key) ?? { spec: relic, count: 0 };
      entry.count++;
      used.set(key, entry);
    }
    for (const [key, { spec, count }] of used) {
      const have = owned.get(key) ?? 0;
      if (count <= have) continue;
      blocked.add(index);
      const missing = byKey.get(key) ?? { spec, needed: 0, owned: have, missing: 0, builds: [] };
      missing.needed = Math.max(missing.needed, count);
      missing.missing = missing.needed - have;
      missing.builds.push(index);
      byKey.set(key, missing);
    }
    onProgress?.(index + 1, builds.length);
  });

  const missing = [...byKey.values()].sort(
    (a, b) =>
      b.builds.length - a.builds.length ||
      relicName(a.spec.itemId).localeCompare(relicName(b.spec.itemId)) ||
      specKey(a.spec).localeCompare(specKey(b.spec)),
  );
  const all = builds.map((_, i) => i);
  return {
    missing,
    complete: all.filter((i) => !blocked.has(i)),
    blocked: all.filter((i) => blocked.has(i)),
  };
}
