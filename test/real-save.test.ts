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
import { extractBuilds } from '../src/core/builds/builds.ts';
import { catalog, rollRules } from '../src/core/catalog/catalog.ts';
import { readSaveFile } from '../src/core/save/read-save.ts';

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

  it('parses quickly', async () => {
    const start = performance.now();
    await readSaveFile(bytes);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
