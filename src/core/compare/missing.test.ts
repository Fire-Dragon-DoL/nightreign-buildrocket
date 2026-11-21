import { describe, expect, it } from 'vitest';
import type { Build, RelicSpec } from '../builds/builds.ts';
import { missingRelicsToCsv } from './csv.ts';
import { findMissingRelics, relicsOfBuilds } from './missing.ts';

const relic = (itemId: number, effect: number, curse: number | null = null): RelicSpec => ({
  itemId,
  effects: [effect, null, null],
  curses: [curse, null, null],
});

const A = relic(100, 7000000);
const B = relic(2000, 6000000, 6850000);
const C = relic(1003201, 7036400);

const build = (name: string, relics: (RelicSpec | null)[]): Build => ({
  character: 'Src',
  heroId: 1,
  name,
  vesselId: 1000,
  relics: [...relics, ...Array<null>(6 - relics.length).fill(null)],
});

describe('findMissingRelics', () => {
  it('finds nothing missing when the pool is the builds own relics', () => {
    const builds = [build('one', [A, B]), build('two', [A, C])];
    const result = findMissingRelics(builds, relicsOfBuilds(builds));
    expect(result.missing).toEqual([]);
    expect(result.complete).toEqual([0, 1]);
    expect(result.blocked).toEqual([]);
  });

  it('lists each missing relic once, with only the builds it blocks', () => {
    const builds = [build('one', [A, B]), build('two', [A, C]), build('three', [C])];
    const result = findMissingRelics(builds, [C]);
    expect(result.missing.map((m) => [m.spec, m.builds])).toEqual([
      [A, [0, 1]],
      [B, [0]],
    ]);
    expect(result.complete).toEqual([2]);
    expect(result.blocked).toEqual([0, 1]);
  });

  it('matches by exact content: a different curse is a different relic', () => {
    const cursedDifferently = relic(2000, 6000000, 6850001);
    const result = findMissingRelics([build('one', [B])], [cursedDifferently]);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]?.owned).toBe(0);
  });

  it('needs as many copies as the build using a relic most, not the sum over builds', () => {
    const builds = [build('double', [A, A]), build('single', [A]), build('also single', [A])];
    const result = findMissingRelics(builds, [A]);
    expect(result.missing).toEqual([{ spec: A, needed: 2, owned: 1, missing: 1, builds: [0] }]);
    expect(result.complete).toEqual([1, 2]);
  });

  it('ignores empty slots and reports progress per build', () => {
    const progress: [number, number][] = [];
    findMissingRelics([build('a', [null]), build('b', [])], [], (d, t) => progress.push([d, t]));
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe('relicsOfBuilds', () => {
  it('keeps the most copies any single build uses', () => {
    const pool = relicsOfBuilds([build('a', [A, A, B]), build('b', [A, B, B])]);
    expect(pool.filter((r) => r === A)).toHaveLength(2);
    expect(pool.filter((r) => r === B)).toHaveLength(2);
  });
});

describe('missingRelicsToCsv', () => {
  it('writes a BOM, a header and one row per missing relic with names and ids', () => {
    const builds = [build('Bleed, "fast"', [A, B]), build('two', [A])];
    const csv = missingRelicsToCsv(findMissingRelics(builds, []), builds);
    expect(csv.startsWith('﻿Relic,Relic ID,Color,Deep,Effect 1,Effect 1 ID,Curse 1')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^Delicate Burning Scene,100,Red,no,[^,]+,7000000,,,/);
    expect(lines[1]).toMatch(/,1,0,1,"Bleed, ""fast"" \(Wylder\); two \(Wylder\)"$/);
    expect(lines[2]).toContain(',6850000,');
  });
});
