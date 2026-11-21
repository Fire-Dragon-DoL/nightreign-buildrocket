import { describe, expect, it } from 'vitest';
import type { RelicSpec } from '../builds/builds.ts';
import { rollRules } from '../catalog/catalog.ts';
import { emptyConfig, type Need, type SellConfig } from './config.ts';
import { buildEffectIndex } from './effects.ts';
import { GODROLL_RISK, looksLikeGodroll, planSell } from './planner.ts';

// Relics (sellable unless noted): normal 3-slot per color, deep 3-slot red, an unsellable one.
const RED = 102;
const BLUE = 111;
const DEEP_RED = 2000002;
const UNSELLABLE_RED = 1180;

// Effects
const MAGIC_1 = 7001501;
const MAGIC_2 = 7001502;
const MAGIC_3 = 6001500;
const MAGIC_4 = 6001501;
const FIRE_4 = 6001601;
const INCANT_2 = 6611302;
const MAX_FP = 6610500;
const VIGOR_3 = 7000002;
const STR_1 = 7000300;
const STR_3 = 7000302;
const DEX_3 = 7000402;
const STAMINA_0 = 7100100;
const STAMINA_1 = 7100110;
// Curses
const SLEEP_BUILDUP = 6820500;
const ALL_RES_DOWN = 6850200;
const HP_LOSS = 6850500;

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
  groups: [{ name: 'Build', needs }],
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

/** Every sold copy's risk in sell order (lines expanded). */
const risks = (pool: RelicSpec[], cfg: SellConfig) =>
  planSell(pool, cfg).sell.flatMap((line) => Array<number>(line.count).fill(line.risk));

describe('planSell basics', () => {
  it('everything not in the config is safe to sell, identical relics on one line', () => {
    const r = relic(RED, [MAGIC_1]);
    const plan = planSell([r, r, r, relic(BLUE, [STR_1])], emptyConfig());
    expect(plan.sell).toHaveLength(2);
    expect(plan.sell[0]).toMatchObject({
      count: 3,
      owned: 3,
      risk: 0,
      reason: 'Not wanted by your config',
    });
    expect(plan.kept).toEqual([]);
  });

  it('sells spares first, then gets riskier as copies run out', () => {
    const r = relic(RED, [MAGIC_2]);
    const cfg = config([effectNeed(MAGIC_2, { copies: 2, importance: 'high' })]);
    const order = risks([r, r, r], cfg);
    expect(order).toEqual([35, 90, 90]);
    expect(planSell([r, r, r], cfg).sell[0]?.reason).toContain('exactly 2 left after selling');
  });

  it('counts per color', () => {
    const cfg = config([effectNeed(MAGIC_2, { colorScope: 'perColor', importance: 'mustKeep' })]);
    const plan = planSell(
      [relic(RED, [MAGIC_2]), relic(BLUE, [MAGIC_2]), relic(BLUE, [MAGIC_2])],
      cfg,
    );
    expect(plan.sell).toHaveLength(1);
    expect(plan.sell[0]?.spec.itemId).toBe(BLUE);
    expect(plan.kept.map((k) => k.spec.itemId).sort()).toEqual([RED, BLUE].sort());
    expect(plan.needs.filter((n) => n.label === 'Magic Attack Power Up +2')).toHaveLength(4);
  });

  it('a higher level counts fully toward a lower-level need', () => {
    const cfg = config([effectNeed(MAGIC_1, { importance: 'mustKeep' })]);
    const plan = planSell([relic(RED, [MAGIC_2])], cfg);
    expect(plan.kept).toHaveLength(1);
  });

  it('unsellable relics never show up but count toward needs', () => {
    const cfg = config([effectNeed(MAGIC_2, { importance: 'mustKeep' })]);
    const plan = planSell([relic(UNSELLABLE_RED, [MAGIC_2]), relic(RED, [MAGIC_2])], cfg);
    expect(rollRules().isSellable(UNSELLABLE_RED)).toBe(false);
    expect(plan.unsellable).toBe(1);
    expect(plan.sell).toHaveLength(1);
    expect(plan.sell[0]?.spec.itemId).toBe(RED);
    expect(plan.sell[0]?.risk).toBeLessThan(100);
  });

  it('the never-sell list protects relics by item id', () => {
    const plan = planSell([relic(RED, [STR_1])], { ...emptyConfig(), neverSell: [RED] });
    expect(plan.sell).toEqual([]);
    expect(plan.unsellable).toBe(1);
  });
});

describe('combos', () => {
  const godroll = [FIRE_4, INCANT_2, MAX_FP];
  const combo: Need = {
    kind: 'combo',
    effects: godroll,
    copies: 1,
    colorScope: 'any',
    importance: 'mustKeep',
  };

  it('a superset relic matches, partial matches are weaker backups sold first', () => {
    const full = relic(DEEP_RED, godroll, [ALL_RES_DOWN, HP_LOSS, SLEEP_BUILDUP]);
    const partial = relic(DEEP_RED, [FIRE_4, INCANT_2]);
    const plan = planSell([partial, full], config([combo]));
    expect(plan.kept.map((k) => k.key)).toEqual([plan.kept[0]?.key]);
    expect(plan.kept[0]?.spec).toEqual(full);
    expect(plan.sell[0]?.spec).toEqual(partial);
  });

  it('partial matches never add up to replace the real thing', () => {
    const full = relic(DEEP_RED, godroll);
    const partials = [1, 2, 3, 4, 5].map(() => relic(DEEP_RED, [FIRE_4]));
    const plan = planSell([full, ...partials], config([combo]));
    expect(plan.kept.map((k) => k.spec)).toEqual([full]);
    // The target is met by the real relic, so partial backups are free to sell.
    expect(plan.sell[0]).toMatchObject({ count: 5, risk: 0 });
  });

  it('subset: a two-effect combo matches a three-effect relic', () => {
    const need: Need = { ...combo, effects: [MAGIC_2, VIGOR_3] };
    const plan = planSell([relic(RED, [MAGIC_2, VIGOR_3, STR_1])], config([need]));
    expect(plan.kept).toHaveLength(1);
  });

  it('partial matches alone keep a short need covered a bit', () => {
    const plan = planSell([relic(DEEP_RED, [FIRE_4])], config([{ ...combo, importance: 'high' }]));
    expect(plan.needs[0]?.full).toBe(0);
    expect(plan.needs[0]?.coverage).toBeCloseTo(0.25);
    expect(plan.sell[0]?.risk).toBeGreaterThan(40);
  });
});

describe('curses', () => {
  it('curses can be wanted (Executor: sleep buildup + all resistances down)', () => {
    const cfg = config([
      effectNeed(SLEEP_BUILDUP, { importance: 'mustKeep' }),
      effectNeed(ALL_RES_DOWN, { importance: 'mustKeep' }),
    ]);
    const plan = planSell(
      [relic(DEEP_RED, [FIRE_4], [SLEEP_BUILDUP]), relic(DEEP_RED, [MAGIC_3], [ALL_RES_DOWN])],
      cfg,
    );
    expect(plan.kept).toHaveLength(2);
  });

  it('a dealbreaker curse stops a relic from counting, unless the need tolerates it', () => {
    const cursed = relic(DEEP_RED, [MAGIC_4], [HP_LOSS]);
    const base = config([effectNeed(MAGIC_4, { importance: 'mustKeep' })]);
    base.effectRules.curseDefaults[HP_LOSS] = 'dealbreaker';
    expect(planSell([cursed], base).kept).toHaveLength(0);

    const tolerant = config([
      effectNeed(MAGIC_4, { importance: 'mustKeep', curseOverrides: { [HP_LOSS]: 'fine' } }),
    ]);
    tolerant.effectRules.curseDefaults[HP_LOSS] = 'dealbreaker';
    expect(planSell([cursed], tolerant).kept).toHaveLength(1);
  });

  it('curses are fine by default', () => {
    const plan = planSell(
      [relic(DEEP_RED, [MAGIC_4], [HP_LOSS])],
      config([effectNeed(MAGIC_4, { importance: 'mustKeep' })]),
    );
    expect(plan.kept).toHaveLength(1);
  });
});

describe('backups', () => {
  it('a lower level stands in for a missing higher one, weighted by strength', () => {
    const plan = planSell([relic(DEEP_RED, [MAGIC_3])], config([effectNeed(MAGIC_4)]));
    expect(plan.needs[0]?.coverage).toBeCloseTo(0.88, 2);
    expect(plan.sell[0]?.reason).toContain('only 0 of 1 left');
  });

  it('a backup only counts if it stacks with the copies already counted', () => {
    // Stamina recovery on hits: +0 and +1 stack, +0 doesn't stack with itself.
    const index = buildEffectIndex();
    expect(index.stacks(STAMINA_0, STAMINA_1)).toBe(true);
    expect(index.stacks(STAMINA_0, STAMINA_0)).toBe(false);
    const pool = [relic(RED, [STAMINA_1]), relic(RED, [STAMINA_0]), relic(RED, [STAMINA_0])];
    const plan = planSell(pool, config([effectNeed(STAMINA_1, { copies: 3 })]));
    // 1 full + one +0 backup (2/3: restores 2 vs 3 stamina); the second +0 adds nothing.
    expect(plan.needs[0]?.coverage).toBeCloseTo(1 + 2 / 3, 2);
    expect(plan.sell[0]?.reason).toBe('Plenty of spares');
    expect(plan.sell[0]?.risk).toBe(0);
  });

  it('warns when more copies are wanted than can stack', () => {
    const plan = planSell([], config([effectNeed(STAMINA_0, { copies: 2 })]));
    expect(plan.warnings[0]).toContain("doesn't stack with itself");
  });
});

describe('godroll heuristic', () => {
  it('flags relics with several top-level effects the config ignores', () => {
    const index = buildEffectIndex();
    const roll = relic(RED, [VIGOR_3, STR_3, DEX_3]);
    expect(looksLikeGodroll(roll, index, emptyConfig())).toBe(true);
    expect(looksLikeGodroll(relic(RED, [VIGOR_3, STR_1]), index, emptyConfig())).toBe(false);
    // Two top-level effects are not enough on a 3-slot relic, but are on a 2-slot one.
    expect(looksLikeGodroll(relic(RED, [VIGOR_3, STR_3, STR_1]), index, emptyConfig())).toBe(false);
    expect(looksLikeGodroll(relic(101, [VIGOR_3, STR_3]), index, emptyConfig())).toBe(true);
    const plan = planSell([roll], emptyConfig());
    expect(plan.sell[0]).toMatchObject({ risk: GODROLL_RISK, flags: ['godroll'] });
  });

  it('effects ignored on purpose do not count, nor relics the config uses', () => {
    const index = buildEffectIndex();
    const roll = relic(RED, [VIGOR_3, STR_3, DEX_3]);
    const ignoring = config([
      effectNeed(VIGOR_3, { importance: 'ignore' }),
      effectNeed(STR_3, { importance: 'ignore' }),
    ]);
    expect(looksLikeGodroll(roll, index, ignoring, new Set(['Vigor', 'Strength']))).toBe(false);
    expect(planSell([roll], ignoring).sell[0]?.flags).toEqual([]);
    expect(planSell([roll], config([effectNeed(DEX_3, { copies: 0 })])).sell[0]?.risk).toBe(
      GODROLL_RISK,
    );
  });
});

it('reports progress', () => {
  const calls: number[] = [];
  planSell([relic(RED, [STR_1]), relic(BLUE, [STR_1])], emptyConfig(), {
    onProgress: (done) => calls.push(done),
  });
  expect(calls.at(-1)).toBe(2);
});
