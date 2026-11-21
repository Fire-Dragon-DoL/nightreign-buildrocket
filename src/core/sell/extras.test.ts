import { describe, expect, it } from 'vitest';
import type { Build, RelicSpec } from '../builds/builds.ts';
import { emptyConfig } from './config.ts';
import { sellPlanToCsv } from './csv.ts';
import { planSell } from './planner.ts';
import { sectionPlan, suggestSearch } from './sections.ts';
import { seedFromBuild, seedFromBuilds } from './seed.ts';

const relic = (itemId: number, effects: number[], curses: number[] = []): RelicSpec => ({
  itemId,
  effects: [effects[0] ?? null, effects[1] ?? null, effects[2] ?? null],
  curses: [curses[0] ?? null, curses[1] ?? null, curses[2] ?? null],
});
const RED = 102; // Grand Burning Scene, 3 slots
const RED_SMALL = 100; // Delicate Burning Scene, 1 slot
const BLUE = 111;
const DEEP_RED = 2000002;

describe('seed from builds', () => {
  it('makes one group per build with combos and per-color single needs', () => {
    const godroll = relic(DEEP_RED, [6001601, 6611302, 6610500], [6850500]);
    const build: Build = {
      character: 'Me',
      heroId: 8,
      name: 'Fire',
      vesselId: 1000,
      relics: [
        relic(RED, [7001502]),
        relic(RED, [7001502]),
        relic(BLUE, [7001502, 7000002]),
        godroll,
        null,
        null,
      ],
    };
    const group = seedFromBuild(build);
    expect(group.name).toBe('Fire (Executor)');
    // The unsellable relic (1180) is always kept: nothing imported for it.
    expect(group.needs.some((n) => n.kind === 'effect' && n.effect === 7000300)).toBe(false);
    const combos = group.needs.filter((n) => n.kind === 'combo');
    expect(combos).toHaveLength(2);
    expect(combos[1]).toMatchObject({
      effects: [6001601, 6611302, 6610500],
      colors: ['Red'],
      importance: 'mustKeep',
      curseOverrides: { 6850500: 'fine' },
    });
    const magic = group.needs.filter((n) => n.kind === 'effect' && n.effect === 7001502);
    expect(magic.map((n) => [n.colors, n.copies])).toEqual([
      [['Red'], 2],
      [['Blue'], 1],
    ]);
  });

  it('several builds merge into one list: copies = the most any single build uses', () => {
    const build = (name: string, relics: RelicSpec[]): Build => ({
      character: 'Me',
      heroId: 8,
      name,
      vesselId: 1000,
      relics: [...relics, null, null, null, null, null, null].slice(0, 6),
    });
    const a = build('A', [relic(RED, [7001502]), relic(RED, [7001502])]);
    const b = build('B', [relic(RED, [7001502]), relic(BLUE, [7001502])]);
    const needs = seedFromBuilds([a, b]);
    const magic = needs.filter((n) => n.kind === 'effect' && n.effect === 7001502);
    expect(magic.map((n) => [n.colors, n.copies])).toEqual([
      [['Red'], 2],
      [['Blue'], 1],
    ]);
  });
});

describe('search suggestions', () => {
  it('finds a filter that shows the sell rows and few keepers', () => {
    const s = suggestSearch([
      { effects: ['a', 'b'], owned: 1, sell: 1 },
      { effects: ['a', 'c'], owned: 2, sell: 2 },
      { effects: ['d'], owned: 3, sell: 0 },
      { effects: ['e', 'b'], owned: 1, sell: 0 },
    ]);
    expect(s.filters).toEqual([['a']]);
    expect(s).toMatchObject({ shows: 3, sell: 3 });
  });

  it('needs no filter when everything goes', () => {
    expect(suggestSearch([{ effects: ['a'], owned: 2, sell: 2 }]).filters).toEqual([]);
  });

  it('groups sell lines by deep, color and size', () => {
    const pool = [
      relic(RED, [7000300]),
      relic(RED_SMALL, [7000300]),
      relic(BLUE, [7000300]),
      relic(DEEP_RED, [6001500]),
    ];
    const sections = sectionPlan(planSell(pool, emptyConfig()), pool);
    expect(sections.map((s) => s.key)).toEqual(['N|Red|1', 'N|Red|3', 'N|Blue|3', 'D|Red|3']);
  });
});

it('exports the sell list as CSV, safest first', () => {
  const pool = [relic(RED, [7001502], []), relic(RED, [7000002, 7000302, 7000402])];
  const csv = sellPlanToCsv(planSell(pool, emptyConfig()));
  const lines = csv.split('\r\n');
  expect(lines[0]?.startsWith('﻿Risk,Why,Sell,Owned,Relic,Relic ID,')).toBe(true);
  expect(lines[1]).toContain(
    '0,nothing wanted,1,1,Grand Burning Scene,102,Red,no,3,Magic Attack Power Up +2,7001502',
  );
  expect(lines[2]).toContain('possible godroll');
});
