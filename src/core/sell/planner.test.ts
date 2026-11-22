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

describe('what can be sold, and why', () => {
  it('relics with nothing wanted go first, identical ones on one line', () => {
    const r = relic(RED, [MAGIC_1]);
    const plan = planSell([r, r, r, relic(BLUE, [STR_1])], emptyConfig());
    expect(plan.sell).toHaveLength(2);
    expect(plan.sell[0]).toMatchObject({ count: 3, owned: 3, risk: 0, verdict: 'unwanted' });
    expect(plan.sell[0]?.why).toEqual([{ kind: 'unwanted', effects: [MAGIC_1], ignored: [] }]);
    expect(plan.sell[0]?.reason).toBe('Nothing on it is in your plan');
    expect(plan.kept).toEqual([]);
  });

  it('says which effects the plan ignores on purpose', () => {
    const plan = planSell(
      [relic(RED, [STR_1, MAGIC_1])],
      config([effectNeed(STR_1, { importance: 'ignore' })]),
    );
    expect(plan.sell[0]?.why[0]).toMatchObject({ kind: 'unwanted', ignored: [STR_1] });
  });

  it('sells a copy covered by an identical one, keeps what the plan needs', () => {
    const r = relic(RED, [MAGIC_2]);
    const plan = planSell(
      [r, r, r],
      config([effectNeed(MAGIC_2, { copies: 2, importance: 'high' })]),
    );
    expect(plan.sell).toHaveLength(1);
    expect(plan.sell[0]).toMatchObject({ count: 1, verdict: 'covered' });
    expect(plan.sell[0]?.why[0]).toMatchObject({
      kind: 'covered',
      by: r,
      copies: 2,
      permanent: false,
    });
    expect(plan.sell[0]?.why[1]).toMatchObject({ kind: 'need', keep: 2, want: 2, short: false });
    expect(plan.kept[0]).toMatchObject({ count: 2 });
    expect(plan.short).toEqual([]);
  });

  it('orders by reason: nothing wanted, covered, spares', () => {
    const pool = [
      relic(RED, [MAGIC_2, VIGOR_3]), // kept: covers the next one
      relic(RED, [MAGIC_2]), // covered
      relic(BLUE, [VIGOR_3]), // spare: Vigor counts in total, the red one has it
      relic(BLUE, [STR_1]), // nothing wanted
    ];
    const plan = planSell(
      pool,
      config([
        effectNeed(MAGIC_2, { importance: 'low', colorScope: 'perColor', colors: ['Red'] }),
        effectNeed(VIGOR_3, { importance: 'low' }),
      ]),
    );
    expect(plan.sell.map((e) => [e.spec.effects[0], e.verdict])).toEqual([
      [STR_1, 'unwanted'],
      [MAGIC_2, 'covered'],
      [VIGOR_3, 'spares'],
    ]);
    expect(plan.sell[2]?.why[0]).toMatchObject({
      kind: 'need',
      label: 'Vigor +3',
      keep: 1,
      want: 1,
    });
  });

  it('a cover is kept, so its reason stays true', () => {
    const r = relic(RED, [MAGIC_2]);
    const plan = planSell([r, r], config([effectNeed(MAGIC_2, { importance: 'low' })]));
    expect(plan.sell).toHaveLength(1);
    expect(plan.kept[0]?.reasons[0]).toBe('Covers 1 relic(s) in the sell list');
  });

  it('covers must have the same color', () => {
    const plan = planSell(
      [relic(RED, [MAGIC_2]), relic(BLUE, [MAGIC_2])],
      config([effectNeed(MAGIC_2, { importance: 'low' })]),
    );
    expect(plan.sell[0]?.verdict).toBe('spares');
  });

  it('a unique relic is a permanent cover', () => {
    const plan = planSell(
      [relic(UNSELLABLE_RED, [MAGIC_2]), relic(RED, [MAGIC_2])],
      config([effectNeed(MAGIC_2, { importance: 'mustKeep' })]),
    );
    expect(rollRules().isSellable(UNSELLABLE_RED)).toBe(false);
    expect(plan.unsellable).toBe(1);
    expect(plan.sell[0]?.spec.itemId).toBe(RED);
    expect(plan.sell[0]?.why[0]).toMatchObject({ kind: 'covered', permanent: true });
    expect(plan.sell[0]?.reason).toContain('unique, always kept');
  });

  it('relics leaving a Low or Normal need short are listed apart; High ones are kept', () => {
    const normal = planSell([relic(RED, [MAGIC_2])], config([effectNeed(MAGIC_2)]));
    expect(normal.sell).toEqual([]);
    expect(normal.short[0]?.why[0]).toMatchObject({ kind: 'need', keep: 0, want: 1, short: true });
    expect(normal.short[0]?.risk).toBe(75);
    const high = planSell(
      [relic(RED, [MAGIC_2])],
      config([effectNeed(MAGIC_2, { importance: 'high' })]),
    );
    expect(high.short).toEqual([]);
    expect(high.kept[0]?.reasons[0]).toContain('only 0 of 1 left without it');
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
    const plan = planSell(
      [relic(RED, [MAGIC_2])],
      config([effectNeed(MAGIC_1, { importance: 'mustKeep' })]),
    );
    expect(plan.kept).toHaveLength(1);
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

  it('a superset relic matches; partial ones are covered by it', () => {
    const full = relic(DEEP_RED, godroll, [ALL_RES_DOWN, HP_LOSS, SLEEP_BUILDUP]);
    const partial = relic(DEEP_RED, [FIRE_4, INCANT_2]);
    const plan = planSell([partial, full], config([combo]));
    expect(plan.kept.map((k) => k.spec)).toEqual([full]);
    expect(plan.sell[0]?.spec).toEqual(partial);
    expect(plan.sell[0]?.why[0]).toMatchObject({ kind: 'covered', by: full });
  });

  it('partial matches never add up to replace the real thing', () => {
    const full = relic(DEEP_RED, godroll);
    const partials = [1, 2, 3, 4, 5].map(() => relic(DEEP_RED, [FIRE_4]));
    const plan = planSell([full, ...partials], config([combo]));
    expect(plan.kept.map((k) => k.spec)).toEqual([full]);
    expect(plan.sell[0]).toMatchObject({ count: 5, verdict: 'covered' });
    expect(plan.sell[0]?.why[0]).toMatchObject({ kind: 'covered', by: full, copies: 1 });
  });

  it('subset: a two-effect combo matches a three-effect relic', () => {
    const need: Need = { ...combo, effects: [MAGIC_2, VIGOR_3] };
    const plan = planSell([relic(RED, [MAGIC_2, VIGOR_3, STR_1])], config([need]));
    expect(plan.kept).toHaveLength(1);
  });

  it('a partial match alone keeps a short need covered a bit', () => {
    const plan = planSell([relic(DEEP_RED, [FIRE_4])], config([{ ...combo, importance: 'high' }]));
    expect(plan.needs[0]?.full).toBe(0);
    expect(plan.needs[0]?.coverage).toBeCloseTo(0.25);
    expect(plan.sell).toEqual([]);
    expect(plan.kept).toHaveLength(1);
  });
});

describe('levels and relic kinds', () => {
  const PHYS_1 = 7001401;
  const PHYS_2 = 7001402;
  const PHYS_3 = 6001400;
  const PHYS_4 = 6001401;
  const BESTIAL = 7044400;
  // Physical Attack Up +4 with Bestial Incantations, or a lower Physical level (+1 at least).
  const combo: Need = {
    kind: 'combo',
    effects: [PHYS_4, BESTIAL],
    minLevels: { [PHYS_4]: 1 },
    relics: 'any', // as the Groups tab sets it: the levels live on both kinds of relic
    copies: 1,
    colorScope: 'any',
    importance: 'mustKeep',
  };

  it('a combo member can accept lower levels, on normal or deep relics', () => {
    const plan = planSell([relic(RED, [PHYS_1, BESTIAL])], config([combo]));
    expect(plan.needs[0]).toMatchObject({
      label: 'Physical Attack Up +1 or higher + Improved Bestial Incantations',
      full: 1,
    });
    const deep = planSell([relic(DEEP_RED, [PHYS_3, BESTIAL])], config([combo]));
    expect(deep.needs[0]?.full).toBe(1);
  });

  it('keeps the highest level: the lower one is sold, and is not called a cover', () => {
    const high = relic(DEEP_RED, [PHYS_4, BESTIAL]);
    const low = relic(RED, [PHYS_2, BESTIAL]);
    const plan = planSell([high, low], config([combo]));
    expect(plan.sell.map((e) => e.spec)).toEqual([low]);
    expect(plan.kept.map((k) => k.spec)).toEqual([high]);
    // Different kinds and colors: the +4 relic is a spare, not a cover, of the +2 one.
    expect(plan.sell[0]?.verdict).toBe('spares');
  });

  it('a lower level never covers a higher one', () => {
    const plus4 = relic(DEEP_RED, [PHYS_4]);
    const plus3 = relic(DEEP_RED, [PHYS_3]);
    const plan = planSell(
      [plus4, plus3, plus3],
      config([effectNeed(PHYS_4, { minLevel: 3, copies: 1, importance: 'low' })]),
    );
    // Both +3 go, the +4 stays: a +3 can't stand for it even though either meets the need.
    expect(plan.kept.map((k) => k.spec)).toEqual([plus4]);
    expect(plan.sell.reduce((n, e) => n + e.count, 0)).toBe(2);
    expect(plan.sell.every((e) => e.spec === plus3)).toBe(true);
  });

  it('Auto relics (plans saved before the setting) match by the effect, as before', () => {
    const deepPlus2 = relic(DEEP_RED, [PHYS_2]);
    const need = (relics?: 'normal' | 'deep' | 'any') =>
      config([effectNeed(PHYS_2, { importance: 'mustKeep', ...(relics ? { relics } : {}) })]);
    // A deep relic carrying the normal +2 effect counts, as it did when the plan was made.
    expect(planSell([deepPlus2], need()).kept).toHaveLength(1);
    expect(planSell([deepPlus2], need('normal')).kept).toEqual([]);
    expect(planSell([deepPlus2], need('deep')).kept).toHaveLength(1);
    expect(planSell([deepPlus2], need('any')).kept).toHaveLength(1);
    // Auto keeps normal and deep levels apart: a deep +3 doesn't count for a normal +2 need.
    expect(planSell([relic(DEEP_RED, [PHYS_3])], need()).kept).toEqual([]);
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

  it('annoying curses still count; the worse-cursed twin goes first', () => {
    const clean = relic(DEEP_RED, [MAGIC_4]);
    const cursed = relic(DEEP_RED, [MAGIC_4], [HP_LOSS]);
    const cfg = config([effectNeed(MAGIC_4, { importance: 'mustKeep' })]);
    cfg.effectRules.curseDefaults[HP_LOSS] = 'annoying';
    const plan = planSell([clean, cursed], cfg);
    expect(plan.sell[0]?.spec).toEqual(cursed);
    expect(plan.sell[0]?.why[0]).toMatchObject({ kind: 'covered', by: clean });
  });
});

describe('backups', () => {
  it('a lower level stands in for a missing higher one, weighted by strength', () => {
    const plan = planSell([relic(DEEP_RED, [MAGIC_3])], config([effectNeed(MAGIC_4)]));
    expect(plan.needs[0]?.coverage).toBeCloseTo(0.88, 2);
    expect(plan.short[0]?.reason).toBe('Build › Magic Attack Power Up +4: keep 0, want 1 — SHORT');
    expect(plan.short[0]?.why[0]).toMatchObject({ kind: 'need', keep: 0, want: 1, short: true });
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
    // That second +0 can go, covered by the +1 relic (which is then kept); the last +0 would
    // leave the need shorter.
    expect(plan.sell).toHaveLength(1);
    expect(plan.sell[0]?.spec.effects[0]).toBe(STAMINA_0);
    expect(plan.sell[0]?.why[0]).toMatchObject({ kind: 'covered', by: pool[0] });
    expect(plan.short.map((e) => e.spec.effects[0])).toEqual([STAMINA_0]);
    expect(plan.kept[0]?.spec.effects[0]).toBe(STAMINA_1);
  });

  it('warns when more copies are wanted than can stack', () => {
    const plan = planSell([], config([effectNeed(STAMINA_0, { copies: 2 })]));
    expect(plan.warnings[0]).toContain("doesn't stack with itself");
  });
});

describe('godroll heuristic', () => {
  it('flags relics whose every slot is at the top level of its family', () => {
    const index = buildEffectIndex();
    const roll = relic(RED, [VIGOR_3, STR_3, DEX_3]);
    expect(looksLikeGodroll(roll, index, emptyConfig())).toBe(true);
    expect(looksLikeGodroll(relic(RED, [VIGOR_3, STR_1]), index, emptyConfig())).toBe(false);
    // Two top-level effects are not enough on a 3-slot relic, but are on a 2-slot one.
    expect(looksLikeGodroll(relic(RED, [VIGOR_3, STR_3, STR_1]), index, emptyConfig())).toBe(false);
    expect(looksLikeGodroll(relic(101, [VIGOR_3, STR_3]), index, emptyConfig())).toBe(true);
  });

  it('possible godrolls come last, for review', () => {
    const roll = relic(RED, [VIGOR_3, STR_3, DEX_3]);
    const plan = planSell([roll, relic(RED, [STR_1])], emptyConfig());
    expect(plan.sell.map((e) => e.verdict)).toEqual(['unwanted', 'review']);
    expect(plan.sell[1]).toMatchObject({ risk: GODROLL_RISK, flags: ['godroll'] });
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
  });
});

it('reports progress', () => {
  const calls: number[] = [];
  planSell([relic(RED, [STR_1]), relic(BLUE, [STR_1])], emptyConfig(), {
    onProgress: (done) => calls.push(done),
  });
  expect(calls.at(-1)).toBe(2);
});

describe('combos with "any of" slots', () => {
  const DRAGON = 7044600;
  const AFFINITY_2 = 6610802;
  // Dragon Communion + any of Incantations +2 / Fire +4 / Affinity +2, 3 in total.
  const combo: Need = {
    kind: 'combo',
    effects: [DRAGON],
    anyOf: [[INCANT_2, FIRE_4, AFFINITY_2]],
    relics: 'any',
    copies: 3,
    colorScope: 'any',
    importance: 'mustKeep',
  };

  it('any option fills the slot, and all options count toward the same copies', () => {
    const relics = [
      relic(DEEP_RED, [DRAGON, INCANT_2]),
      relic(DEEP_RED, [DRAGON, FIRE_4]),
      relic(DEEP_RED, [DRAGON, AFFINITY_2]),
      relic(DEEP_RED, [DRAGON, MAX_FP]),
    ];
    const plan = planSell(relics, config([combo]));
    expect(plan.needs[0]).toMatchObject({
      label:
        'Improved Dragon Communion Incantations + any of (Improved Incantations +2 / Fire Attack Power Up +4 / Improved Affinity Attack Power +2)',
      full: 3,
    });
    // Dragon Communion without any of the options doesn't count: it can go.
    expect(plan.sell.map((e) => e.spec)).toEqual([relics[3]]);
    expect(plan.kept).toHaveLength(3);
  });

  it('copies are shared: beyond the target, extra pairings are spares', () => {
    const relics = [
      relic(DEEP_RED, [DRAGON, INCANT_2]),
      relic(DEEP_RED, [DRAGON, INCANT_2]),
      relic(DEEP_RED, [DRAGON, FIRE_4]),
      relic(DEEP_RED, [DRAGON, AFFINITY_2]),
    ];
    const plan = planSell(relics, config([combo]));
    expect(plan.kept).toHaveLength(3);
    expect(plan.sell.reduce((n, e) => n + e.count, 0)).toBe(1);
  });

  it('a relic with another option is not a cover', () => {
    const fire = relic(DEEP_RED, [DRAGON, FIRE_4]);
    const incant = relic(DEEP_RED, [DRAGON, INCANT_2]);
    const plan = planSell([fire, incant], config([{ ...combo, copies: 1, importance: 'low' }]));
    expect(plan.sell).toHaveLength(1);
    expect(plan.sell[0]?.verdict).toBe('spares');
  });
});
