import { describe, expect, it } from 'vitest';
import { type ComboNeed, emptyConfig, type SellConfig } from '../../core/sell/config.ts';
import { buildEffectIndex } from '../../core/sell/effects.ts';
import {
  addEffect,
  applyEdit,
  builderDrafts,
  builderFromNeed,
  builderFromRelic,
  draftLabel,
  emptyBuilder,
  followEdit,
  moveEffect,
} from './builder.ts';
import { moveNeed } from './configEdit.ts';

const DRAGON = 7044600;
const INCANT_2 = 6611302;
const FIRE_4 = 6001601;
const AFFINITY_2 = 6610802;

const POISON_0 = 7260000; // Attack power up when facing poison-afflicted enemy
const POISON_1 = 6260000; // … +1
const POISON_2 = 6260001; // … +2
const GIANT = 7044200; // Improved Giants' Flame Incantations
const FRENZIED = 7044500; // Improved Frenzied Flame Incantations
const PHYS_4 = 6001401;
const MAGIC_4 = 6001501;
const FROST_0 = 7260400;
const FROST_1 = 6260400;
const FROST_2 = 6260401;
const index = buildEffectIndex();

describe('combo builder', () => {
  it('moves effects between rows; an emptied slot or column goes away', () => {
    let b = { ...emptyBuilder(), all: [DRAGON, INCANT_2, FIRE_4, GIANT] };
    b = moveEffect(b, INCANT_2, 'all', 'newAny');
    b = moveEffect(b, FIRE_4, 'all', 'any:0');
    b = moveEffect(b, GIANT, 'all', 'newPerm');
    expect(b).toMatchObject({ all: [DRAGON], anyOf: [[INCANT_2, FIRE_4]], perms: [[GIANT]] });
    b = moveEffect(b, GIANT, 'perm:0', 'any:0');
    b = moveEffect(b, INCANT_2, 'any:0', 'all');
    expect(b).toMatchObject({ all: [DRAGON, INCANT_2], anyOf: [[FIRE_4, GIANT]], perms: [] });
  });

  it('one effect is a single-effect need; one-option slots are required effects', () => {
    expect(builderDrafts({ ...emptyBuilder(), all: [DRAGON] })).toEqual([
      {
        kind: 'effect',
        effect: DRAGON,
        copies: 1,
        colorScope: 'perColor',
        importance: 'mustKeep',
        relics: 'any',
      },
    ]);
    const [draft] = builderDrafts({ ...emptyBuilder(), all: [DRAGON], anyOf: [[FIRE_4], []] });
    expect(draft).toMatchObject({ kind: 'combo', effects: [DRAGON, FIRE_4] });
    expect(draft && 'anyOf' in draft).toBe(false);
  });

  it('permutations make a combo per combination; levels of one effect count only themselves', () => {
    // Any of Affinity / Incantations / Fire, with each poison level, with each flame: 3 × 2 = 6.
    const b = {
      ...emptyBuilder(),
      anyOf: [[AFFINITY_2, INCANT_2, FIRE_4]],
      perms: [
        [POISON_0, POISON_1, POISON_2],
        [GIANT, FRENZIED],
      ],
      settings: { copies: 3, colorScope: 'perColor' as const, importance: 'high' as const },
    };
    const drafts = builderDrafts(b, index) as ComboNeed[];
    expect(drafts).toHaveLength(6);
    expect(drafts.map((d) => draftLabel(d, index))[0]).toBe(
      "Attack power up when facing poison-afflicted enemy only + Improved Giants' Flame Incantations + any of (Improved Affinity Attack Power +2 / Improved Incantations +2 / Fire Attack Power Up +4)",
    );
    expect(drafts[2]).toMatchObject({
      effects: [POISON_1, GIANT],
      anyOf: [[AFFINITY_2, INCANT_2, FIRE_4]],
      exactLevels: [POISON_1],
      minLevels: { [POISON_1]: 1 },
      copies: 3,
      colorScope: 'perColor',
      importance: 'high',
    });
    // Different effects in a column (the flames) keep their usual levels.
    expect(drafts.every((d) => !d.exactLevels?.includes(GIANT))).toBe(true);
  });

  it('Physical or Magic +4 with each Frost level: 6 separate combos', () => {
    const b = {
      ...emptyBuilder(),
      perms: [
        [PHYS_4, MAGIC_4],
        [FROST_2, FROST_1, FROST_0],
      ],
    };
    const drafts = builderDrafts(b, index) as ComboNeed[];
    expect(drafts.map((d) => d.effects)).toEqual([
      [PHYS_4, FROST_2],
      [PHYS_4, FROST_1],
      [PHYS_4, FROST_0],
      [MAGIC_4, FROST_2],
      [MAGIC_4, FROST_1],
      [MAGIC_4, FROST_0],
    ]);
    expect(drafts.map((d) => d.exactLevels)).toEqual(
      [FROST_2, FROST_1, FROST_0, FROST_2, FROST_1, FROST_0].map((id) => [id]),
    );
  });

  it('editing keeps colors and curse tolerance, takes the builder settings and levels', () => {
    const old: ComboNeed = {
      kind: 'combo',
      effects: [DRAGON],
      anyOf: [[INCANT_2, FIRE_4]],
      minLevels: { [FIRE_4]: 1, [INCANT_2]: 0 },
      copies: 3,
      colorScope: 'perColor',
      colors: ['Red'],
      importance: 'high',
      relics: 'any',
    };
    const b = builderFromNeed(old, { group: 0, need: 2 }, 1);
    expect(b.settings).toEqual({ copies: 3, colorScope: 'perColor', importance: 'high' });
    // Swap Incantations for Affinity in the "any of" slot.
    const edited = addEffect(moveEffect(b, INCANT_2, 'any:0', 'all'), AFFINITY_2, 'any:0');
    const [draft] = builderDrafts({ ...edited, all: [DRAGON] }, index);
    expect(edited.editing).toEqual({ group: 0, need: 2 });
    expect(applyEdit(old, draft as ComboNeed)).toEqual({
      ...old,
      anyOf: [[FIRE_4, AFFINITY_2]],
      minLevels: { [FIRE_4]: 1 },
    });
  });

  it('a single effect can be edited into a combo', () => {
    const old = {
      kind: 'effect' as const,
      effect: DRAGON,
      copies: 2,
      colorScope: 'any' as const,
      importance: 'high' as const,
      colors: ['Blue' as const],
    };
    const b = addEffect(builderFromNeed(old, { group: 0, need: 0 }, 1), FIRE_4, 'all');
    const [draft] = builderDrafts(b, index);
    expect(applyEdit(old, draft as ComboNeed)).toEqual({
      kind: 'combo',
      effects: [DRAGON, FIRE_4],
      copies: 2,
      colorScope: 'any',
      importance: 'high',
      colors: ['Blue'],
      relics: 'any',
    });
  });

  it('a relic fills "all of" with its effects, not its curses', () => {
    const b = builderFromRelic(
      { itemId: 2000002, effects: [DRAGON, FIRE_4, null], curses: [6850500, null, null] },
      index,
      3,
    );
    expect(b).toMatchObject({ all: [DRAGON, FIRE_4], anyOf: [], perms: [], focus: 3 });
  });
});

describe('reordering needs', () => {
  it('the combo being edited is followed when rows move or go', () => {
    const b = { ...emptyBuilder(), editing: { group: 0, need: 2 } };
    expect(followEdit(b, 0, 2, 0).editing).toEqual({ group: 0, need: 0 });
    expect(followEdit(b, 0, 0, 3).editing).toEqual({ group: 0, need: 1 });
    expect(followEdit(b, 0, 4, 1).editing).toEqual({ group: 0, need: 3 });
    expect(followEdit(b, 0, 1, null).editing).toEqual({ group: 0, need: 1 });
    expect(followEdit(b, 0, 2, null).editing).toBeNull();
    expect(followEdit(b, 1, 0, null)).toBe(b);
  });

  it('moves a need up or down in its group', () => {
    const need = (effect: number) =>
      ({ kind: 'effect', effect, copies: 1, colorScope: 'any', importance: 'normal' }) as const;
    const config: SellConfig = {
      ...emptyConfig(),
      groups: [{ name: 'General', needs: [1, 2, 3].map(need) }],
    };
    const order = (c: SellConfig) =>
      c.groups[0]?.needs.map((n) => (n.kind === 'effect' ? n.effect : 0));
    expect(order(moveNeed(config, 0, 0, 2))).toEqual([2, 3, 1]);
    expect(order(moveNeed(config, 0, 2, 0))).toEqual([3, 1, 2]);
  });
});
