import { describe, expect, it } from 'vitest';
import type { RelicSpec } from '../builds/builds.ts';
import { emptyConfig, type Need, type SellConfig } from '../sell/config.ts';
import { picksToCsv } from './csv.ts';
import { pickFromSecondary } from './picks.ts';

const RED = 102;
const BLUE = 111;
const DEEP_RED = 2000002;
const UNSELLABLE_RED = 1180;

const MAGIC_1 = 7001501;
const MAGIC_2 = 7001502;
const MAGIC_3 = 6001500;
const VIGOR_3 = 7000002;
const STR_1 = 7000300;
const STR_3 = 7000302;
const DEX_3 = 7000402;
const HP_LOSS = 6850500;
const ALL_RES_DOWN = 6850200;

const relic = (
  itemId: number,
  effects: (number | null)[],
  curses: (number | null)[] = [],
): RelicSpec => ({
  itemId,
  effects: [effects[0] ?? null, effects[1] ?? null, effects[2] ?? null],
  curses: [curses[0] ?? null, curses[1] ?? null, curses[2] ?? null],
});

const config = (needs: Need[], patch: Partial<SellConfig> = {}): SellConfig => ({
  ...emptyConfig(),
  groups: [{ name: 'General', needs }],
  ...patch,
});

const effectNeed = (effect: number, extra: Partial<Need> = {}): Need =>
  ({
    kind: 'effect',
    effect,
    copies: 1,
    colorScope: 'any',
    importance: 'normal',
    ...extra,
  }) as Need;

const taken = (r: ReturnType<typeof pickFromSecondary>) => r.picks.reduce((n, p) => n + p.count, 0);

describe('Secondary Pool Picks', () => {
  it('only picks from copies the Relic Pool does not also have', () => {
    const fire = relic(RED, [7001602]);
    const r = pickFromSecondary(
      [fire, fire],
      [fire, fire, fire],
      config([effectNeed(7001602, { copies: 5 })]),
    );
    expect(r).toMatchObject({ shared: 2, availableCount: 1 });
    expect(r.picks[0]).toMatchObject({ count: 1, available: 1 });
    expect(r.needs[0]).toMatchObject({ have: 2, after: 3, want: 5 });
    // Nothing new on the other side: nothing to take, even when short.
    expect(
      pickFromSecondary([fire], [fire], config([effectNeed(7001602, { copies: 3 })])).picks,
    ).toEqual([]);
  });

  it('sets aside relics that look the same in game, whatever their item id or effect order', () => {
    // Deep Polished Luminous Scene: several item ids, same name, color and size.
    const left = relic(2000201, [6611302, 6001601], [null, ALL_RES_DOWN]);
    const right = relic(2010211, [6001601, 6611302], [ALL_RES_DOWN, null]);
    const r = pickFromSecondary([left], [right], config([effectNeed(6611302, { copies: 2 })]));
    expect(r).toMatchObject({ shared: 1, availableCount: 0, picks: [] });
    // A different curse is a different relic.
    const other = relic(2010211, [6001601, 6611302], [HP_LOSS, null]);
    expect(pickFromSecondary([left], [other], emptyConfig())).toMatchObject({ shared: 0 });
  });

  it('takes only the copies the Relic Pool lacks', () => {
    const m = relic(RED, [MAGIC_2]);
    const r = pickFromSecondary([m], [m, m, m, m], config([effectNeed(MAGIC_2, { copies: 2 })]));
    expect(r.picks).toHaveLength(1);
    expect(r.picks[0]).toMatchObject({ count: 1, available: 3 });
    expect(r.picks[0]?.fills[0]).toMatchObject({ have: 1, after: 2, want: 2, backup: false });
    expect(r.needs).toEqual([expect.objectContaining({ have: 1, after: 2, want: 2 })]);
  });

  it('nothing when the Relic Pool already covers the plan', () => {
    const m = relic(RED, [MAGIC_2]);
    const r = pickFromSecondary([m], [m], config([effectNeed(MAGIC_2)]));
    expect(r.picks).toEqual([]);
    expect(r.needs).toEqual([]);
  });

  it('prefers one relic that fills two needs over two relics', () => {
    const r = pickFromSecondary(
      [],
      [relic(RED, [MAGIC_2]), relic(RED, [STR_3]), relic(RED, [MAGIC_2, STR_3])],
      config([effectNeed(MAGIC_2), effectNeed(STR_3)]),
    );
    expect(taken(r)).toBe(1);
    expect(r.picks[0]?.spec.effects).toEqual([MAGIC_2, STR_3, null]);
    expect(r.picks[0]?.fills).toHaveLength(2);
  });

  it('colors must match for per-color needs', () => {
    const r = pickFromSecondary(
      [],
      [relic(BLUE, [MAGIC_2])],
      config([effectNeed(MAGIC_2, { colorScope: 'perColor', colors: ['Red'] })]),
    );
    expect(r.picks).toEqual([]);
    expect(r.needs).toEqual([expect.objectContaining({ color: 'Red', have: 0, after: 0 })]);
  });

  it('a dealbreaker curse does not fill a need', () => {
    const cfg = config([effectNeed(MAGIC_3)], {
      effectRules: { ...emptyConfig().effectRules, curseDefaults: { [HP_LOSS]: 'dealbreaker' } },
    });
    const r = pickFromSecondary([], [relic(DEEP_RED, [MAGIC_3], [HP_LOSS])], cfg);
    expect(r.picks).toEqual([]);
  });

  it('a full copy beats a lower-level backup; a backup is taken when nothing better exists', () => {
    const need = config([effectNeed(MAGIC_2)]);
    const both = pickFromSecondary([], [relic(RED, [MAGIC_1]), relic(RED, [MAGIC_2])], need);
    expect(taken(both)).toBe(1);
    expect(both.picks[0]?.spec.effects[0]).toBe(MAGIC_2);

    const only = pickFromSecondary([], [relic(RED, [MAGIC_1])], need);
    expect(only.picks[0]?.fills[0]?.backup).toBe(true);
    expect(only.needs[0]?.after).toBeLessThan(1);
  });

  it('unsellable relics in the Relic Pool count, and a unique one it has is skipped', () => {
    const r = pickFromSecondary(
      [relic(UNSELLABLE_RED, [])],
      [relic(UNSELLABLE_RED, []), relic(UNSELLABLE_RED, [MAGIC_1])],
      emptyConfig(),
    );
    // The identical one is shared; a different roll of a unique relic you have can't be added.
    expect(r).toMatchObject({ shared: 1, skippedUnique: 1 });
  });

  it('lists upgrades over a counted copy: higher level, or milder curses', () => {
    const higher = pickFromSecondary(
      [relic(RED, [MAGIC_1])],
      [relic(RED, [MAGIC_2]), relic(RED, [MAGIC_1])],
      config([effectNeed(MAGIC_1)]),
    );
    expect(higher.picks).toEqual([]);
    expect(higher.upgrades).toHaveLength(1);
    expect(higher.upgrades[0]?.spec.effects[0]).toBe(MAGIC_2);
    expect(higher.upgrades[0]?.better[0]).toMatchObject({ higher: true });

    const cfg = config([effectNeed(MAGIC_3)], {
      effectRules: { ...emptyConfig().effectRules, curseDefaults: { [HP_LOSS]: 'annoying' } },
    });
    const milder = pickFromSecondary(
      [relic(DEEP_RED, [MAGIC_3], [HP_LOSS])],
      [relic(DEEP_RED, [MAGIC_3], [ALL_RES_DOWN])],
      cfg,
    );
    expect(milder.upgrades[0]?.better[0]).toMatchObject({ higher: false });
  });

  it('flags possible godrolls the plan does not mention, unless the Relic Pool has one', () => {
    const god = relic(RED, [VIGOR_3, STR_3, DEX_3]);
    const r = pickFromSecondary([relic(RED, [STR_1])], [god, god], emptyConfig());
    expect(r.godrolls).toEqual([expect.objectContaining({ count: 2, available: 2 })]);
    expect(pickFromSecondary([god], [god], emptyConfig()).godrolls).toEqual([]);
  });

  it('exports every list as CSV', () => {
    const r = pickFromSecondary(
      [relic(RED, [MAGIC_1])],
      [relic(RED, [MAGIC_2]), relic(RED, [MAGIC_2]), relic(RED, [VIGOR_3, STR_3, DEX_3])],
      config([effectNeed(MAGIC_1, { copies: 2 })]),
    );
    const csv = picksToCsv(r);
    expect(csv.startsWith('\ufeffList,Take,Available,Relic')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual([
      'fills a need',
      'upgrade',
      'possible godroll',
    ]);
  });
});
