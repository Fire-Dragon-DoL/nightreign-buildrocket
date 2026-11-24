import { describe, expect, it, vi } from 'vitest';
import type { RelicSpec } from '../builds/builds.ts';
import { catalog } from '../catalog/catalog.ts';
import { emptyConfig, type Need } from './config.ts';
import { buildEffectIndex } from './effects.ts';
import { planSell } from './planner.ts';
import { parseRnp, serializeRnp } from './rnp.ts';
import { sectionPlan } from './sections.ts';
import { seedFromBuild } from './seed.ts';

// Official effect data as the extractor writes it: The Wylder's Earring's "+1 additional Character
// Skill use" (11000) is the same effect as Wylder's regular one (7033200).
vi.mock('../catalog/game-data.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../catalog/game-data.ts')>();
  return {
    ...real,
    rawEffectDetails: {
      effects: {
        '7033200': {
          name: '+1 additional Character Skill use',
          heroes: ['Wylder'],
          rolls: true,
          filter: 50,
          debuff: false,
        },
        '11000': {
          name: '+1 additional Character Skill use',
          heroes: [],
          rolls: false,
          filter: 50,
          debuff: false,
          same: 7033200,
        },
        '7000700': { name: 'Arcane +1', heroes: [], rolls: true, filter: 60, debuff: false },
        '7000701': { name: 'Arcane +2', heroes: [], rolls: true, filter: 60, debuff: false },
      },
      filters: {
        '50': { name: 'Character Skill', category: 1 },
        '60': { name: 'Arcane', category: 2 },
      },
    },
  };
});

const SKILL = 7033200;
const EARRING_SKILL = 11000;
const EARRING = 11001; // The Wylder's Earring (unsellable)
const RED = 102;
const relic = (itemId: number, effects: number[]): RelicSpec => ({
  itemId,
  effects: [effects[0] ?? null, effects[1] ?? null, effects[2] ?? null],
  curses: [null, null, null],
});
const need = (effect: number, extra: Partial<Need> = {}): Need =>
  ({
    kind: 'effect',
    effect,
    copies: 1,
    colorScope: 'any',
    importance: 'mustKeep',
    ...extra,
  }) as Need;

describe('aliases (same effect in game, different id)', () => {
  it('the catalog resolves an alias to its effect and uses official names', () => {
    expect(catalog().canonicalEffect(EARRING_SKILL)).toBe(SKILL);
    expect(catalog().canonicalEffect(SKILL)).toBe(SKILL);
    expect(catalog().effect(7000700)?.name).toBe('Arcane +1');
  });

  it('the effect list shows one row, with the hero from the data', () => {
    const index = buildEffectIndex();
    const rows = index.all().filter((m) => m.name.endsWith('+1 additional Character Skill use'));
    expect(rows.map((m) => [m.id, m.name, m.hero])).toEqual([
      [SKILL, '[Wylder] +1 additional Character Skill use', 1],
      [7270100, '[Ironeye] +1 additional Character Skill use', 3],
    ]);
    expect(index.meta(EARRING_SKILL)?.id).toBe(SKILL);
    expect(index.sameEffect(EARRING_SKILL, SKILL)).toBe(true);
  });

  it('effects no relic carries are not listed', () => {
    const ids = buildEffectIndex()
      .all()
      .map((m) => m.id);
    expect(ids).not.toContain(17000); // "permanently increased for each evergaol prisoner"
    expect(ids).toContain(7060000);
  });

  it('an alias counts as a copy of its effect', () => {
    // The unsellable earring already covers the need, so the regular relic is a spare.
    const plan = planSell([relic(EARRING, [EARRING_SKILL]), relic(RED, [SKILL])], {
      ...emptyConfig(),
      groups: [{ name: 'Wylder', needs: [need(SKILL)] }],
    });
    expect(plan.needs[0]?.full).toBe(2);
    expect(plan.sell[0]?.why).toContainEqual(
      expect.objectContaining({ kind: 'need', keep: 1, want: 1 }),
    );
  });

  it('.rsp files and seeding store the effect, not the alias', () => {
    const doc = JSON.parse(
      serializeRnp({ ...emptyConfig(), groups: [{ name: 'x', needs: [need(EARRING_SKILL)] }] }),
    );
    const parsed = parseRnp(JSON.stringify(doc));
    expect(parsed.config.groups[0]?.needs[0]).toMatchObject({ effect: SKILL });
    expect(parsed.warnings[0]).toContain('same effect');

    const group = seedFromBuild({
      character: 'c',
      heroId: 1,
      name: 'b',
      vesselId: 1000,
      relics: [relic(RED, [EARRING_SKILL, 7000700]), null, null, null, null, null],
    });
    expect(group.needs.find((n) => n.kind === 'combo')).toMatchObject({
      effects: [SKILL, 7000700],
    });
  });

  it('search hints use the game filter names', () => {
    const pool = [relic(RED, [7000700]), relic(RED, [7000701])];
    const sections = sectionPlan(planSell(pool, emptyConfig()), pool);
    expect(sections[0]?.search.filters).toEqual([]);
    const keep = [...pool, relic(RED, [SKILL])];
    const plan = planSell(keep, {
      ...emptyConfig(),
      groups: [{ name: 'g', needs: [need(SKILL)] }],
    });
    expect(sectionPlan(plan, keep)[0]?.search.filters).toEqual([['Arcane']]);
  });
});
