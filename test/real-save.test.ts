/**
 * Tests against a REAL save file, which is never committed (it holds the
 * owner's Steam id). Provide one to run these:
 *   - set NR_SAVE_FILE=/path/to/NR0000.sl2, or
 *   - drop a .sl2 / .co2 file into test/fixtures/local/
 * Without one, this suite is skipped.
 *
 * Assertions are invariants that hold for any healthy save, so they work
 * with anybody's file.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractBuilds,
  extractCharacterBuilds,
  specKey,
  toSpec,
} from '../src/core/builds/builds.ts';
import { catalog, rollRules } from '../src/core/catalog/catalog.ts';
import { readSaveFile } from '../src/core/save/read-save.ts';
import { emptyConfig, type SellConfig } from '../src/core/sell/config.ts';
import { buildEffectIndex } from '../src/core/sell/effects.ts';
import { planSell } from '../src/core/sell/planner.ts';
import { seedFromBuild } from '../src/core/sell/seed.ts';

function findSaveFile(): string | undefined {
  if (process.env.NR_SAVE_FILE) return resolve(process.env.NR_SAVE_FILE);
  const dir = resolve(import.meta.dirname, 'fixtures/local');
  if (!existsSync(dir)) return undefined;
  const file = readdirSync(dir).find((f) => /\.(sl2|co2)$/i.test(f));
  return file ? join(dir, file) : undefined;
}

const savePath = findSaveFile();

describe.skipIf(!savePath)('real save file', async () => {
  const bytes = savePath ? new Uint8Array(readFileSync(savePath)) : new Uint8Array();
  const save = savePath ? await readSaveFile(bytes) : undefined;
  if (!save) return;

  it('has intact checksums', () => {
    expect(save.checksumMismatches).toEqual([]);
  });

  it('has a Steam id and at least one named character', () => {
    expect(save.steamId).toMatch(/^7656\d{13}$/);
    expect(save.characters.length).toBeGreaterThan(0);
    for (const c of save.characters) expect(c.name.length).toBeGreaterThan(0);
  });

  it('has 10 heroes per character', () => {
    for (const c of save.characters) {
      expect(c.heroes.map((h) => h.heroId).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
    }
  });

  it('only has relics with known item ids and unique handles', () => {
    for (const c of save.characters) {
      expect(new Set(c.relics.map((r) => r.handle)).size).toBe(c.relics.length);
      const unknown = c.relics.filter((r) => !catalog().relic(r.itemId));
      expect(unknown).toEqual([]);
    }
  });

  it('only has effects the catalog knows (allowing a handful of unknowns)', () => {
    const unknown = new Set<number>();
    for (const c of save.characters) {
      for (const r of c.relics) {
        for (const id of [...r.effects, ...r.curses]) {
          if (id !== null && !catalog().effect(id)) unknown.add(id);
        }
      }
    }
    expect(unknown.size).toBeLessThanOrEqual(5);
  });

  it('puts curses only on deep relics, and only curse-tier effects in curse slots', () => {
    for (const c of save.characters) {
      for (const r of c.relics) {
        const curses = r.curses.filter((x) => x !== null);
        if (curses.length === 0) continue;
        expect(catalog().relic(r.itemId)?.deep).toBe(true);
        for (const id of curses) expect(catalog().effect(id)?.tier ?? 'curse').toBe('curse');
      }
    }
  });

  it('has presets whose relics are all owned by the character', () => {
    for (const c of save.characters) {
      const owned = new Set(c.relics.map((r) => r.handle));
      for (const p of c.presets) {
        for (const handle of p.relics) if (handle !== null) expect(owned).toContain(handle);
        expect(catalog().vessel(p.vesselId)).toBeDefined();
      }
    }
  });

  it('extracts builds whose relics are all resolved', () => {
    const builds = extractBuilds(save);
    const presetSlots = save.characters.flatMap((c) => c.presets.flatMap((p) => p.relics));
    expect(builds.length).toBe(save.characters.reduce((n, c) => n + c.presets.length, 0));
    expect(builds.flatMap((b) => b.relics).filter((r) => r !== null).length).toBe(
      presetSlots.filter((h) => h !== null).length,
    );
  });

  it('only has relics the game can roll', () => {
    const rules = rollRules();
    for (const c of save.characters) {
      const broken = c.relics.filter((r) => rules.check(r).length > 0);
      expect(broken).toEqual([]);
    }
  });

  it('plans relic sales for every relic, quickly, keeping what the builds use', () => {
    for (const c of save.characters) {
      const pool = c.relics.map(toSpec);
      const empty = planSell(pool, emptyConfig());
      const listed = (p: ReturnType<typeof planSell>) =>
        p.sell.reduce((n, e) => n + e.count, 0) +
        p.short.reduce((n, e) => n + e.count, 0) +
        p.kept.reduce((n, k) => n + k.count, 0) +
        p.unsellable;
      expect(listed(empty)).toBe(pool.length);
      expect(empty.kept).toEqual([]);

      // Every build at "must keep": every relic a build uses stays.
      const config: SellConfig = {
        ...emptyConfig(),
        groups: extractCharacterBuilds(c).map((b) => {
          const group = seedFromBuild(b);
          return {
            ...group,
            needs: group.needs.map((n) => ({ ...n, importance: 'mustKeep' as const })),
          };
        }),
      };
      const start = performance.now();
      const plan = planSell(pool, config);
      expect(performance.now() - start).toBeLessThan(5000);
      expect(listed(plan)).toBe(pool.length);
      // Every suggestion says why; reasons come in order (nothing wanted, covered, spares, review).
      const rank = { unwanted: 0, covered: 1, spares: 2, review: 3 };
      const order = plan.sell.map((e) => rank[e.verdict]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      for (const e of plan.sell) {
        expect(e.why.length).toBeGreaterThan(0);
        expect(e.risk).toBeLessThan(100);
      }
      // Each build relic's effects (same color) are still on some relic that is kept.
      const left = new Map<string, number>();
      for (const spec of pool) left.set(specKey(spec), (left.get(specKey(spec)) ?? 0) + 1);
      for (const e of plan.sell) left.set(e.key, (left.get(e.key) ?? 0) - e.count);
      const remaining = pool.filter((spec) => {
        const n = left.get(specKey(spec)) ?? 0;
        left.set(specKey(spec), n - 1);
        return n > 0;
      });
      const color = (id: number) => catalog().relic(id)?.color;
      const index = buildEffectIndex();
      // Same family at the same or a higher level counts (higher levels count fully).
      const covers = (have: (number | null)[], want: number) => {
        const w = index.meta(want);
        return have.some((h) => {
          const m = h === null ? undefined : index.meta(h);
          return (
            h === want ||
            (!!m && !!w && m.family === w.family && m.pool === w.pool && m.level >= w.level)
          );
        });
      };
      for (const build of extractCharacterBuilds(c)) {
        for (const relic of build.relics) {
          if (!relic) continue;
          const effects = relic.effects.filter((e) => e !== null);
          const kept = remaining.some(
            (p) =>
              color(p.itemId) === color(relic.itemId) && effects.every((e) => covers(p.effects, e)),
          );
          expect(kept, `${build.name}: ${specKey(relic)}`).toBe(true);
        }
      }
    }
  });

  it('parses quickly', async () => {
    const start = performance.now();
    await readSaveFile(bytes);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
