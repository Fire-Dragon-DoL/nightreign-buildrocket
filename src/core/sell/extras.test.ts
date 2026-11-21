import { describe, expect, it } from 'vitest';
import type { Build, RelicSpec } from '../builds/builds.ts';
import { emptyConfig } from './config.ts';
import { sellPlanToCsv } from './csv.ts';
import { planSell } from './planner.ts';
import { sectionPlan, suggestSearch } from './sections.ts';
import { seedFromBuild } from './seed.ts';

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
    const combos = group.needs.filter((n) => n.kind === 'combo');
    expect(combos).toHaveLength(2);
    expect(combos[1]).toMatchObject({
      effects: [6001601, 6611302, 6610500],
      colors: ['Red'],
      importance: 'high',
      curseOverrides: { 6850500: 'fine' },
    });
    const magic = group.needs.filter((n) => n.kind === 'effect' && n.effect === 7001502);
    expect(magic.map((n) => [n.colors, n.copies])).toEqual([
      [['Red'], 2],
      [['Blue'], 1],
    ]);
  });
});

describe('search suggestions', () => {
  it('finds a filter that shows the sell rows and few keepers', () => {
    const s = suggestSearch([
      { effects: [1, 2], owned: 1, sell: 1 },
      { effects: [1, 3], owned: 2, sell: 2 },
      { effects: [4], owned: 3, sell: 0 },
      { effects: [5, 2], owned: 1, sell: 0 },
    ]);
    expect(s.filters).toEqual([[1]]);
    expect(s).toMatchObject({ shows: 3, sell: 3 });
  });

  it('needs no filter when everything goes', () => {
    expect(suggestSearch([{ effects: [1], owned: 2, sell: 2 }]).filters).toEqual([]);
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
  expect(lines[0]?.startsWith('﻿Risk,Sell,Owned,Relic,Relic ID,')).toBe(true);
  expect(lines[1]).toContain(
    '0,1,1,Grand Burning Scene,102,Red,no,3,[Relic] Magic Attack Power Up +2,7001502',
  );
  expect(lines[2]).toContain('possible godroll');
});
