import { describe, expect, it } from 'vitest';
import { type ComboNeed, emptyConfig, type SellConfig } from '../../core/sell/config.ts';
import { buildEffectIndex } from '../../core/sell/effects.ts';
import {
  applyEdit,
  builderDraft,
  builderFromNeed,
  builderFromRelic,
  emptyBuilder,
  followEdit,
  moveEffect,
} from './builder.ts';
import { moveNeed } from './configEdit.ts';

const DRAGON = 7044600;
const INCANT_2 = 6611302;
const FIRE_4 = 6001601;
const AFFINITY_2 = 6610802;

describe('combo builder', () => {
  it('moves effects between "all of" and "any of" rows; an emptied slot goes away', () => {
    let b = { ...emptyBuilder(), all: [DRAGON, INCANT_2, FIRE_4] };
    b = moveEffect(b, INCANT_2, 'all', 'newSlot');
    b = moveEffect(b, FIRE_4, 'all', 0);
    expect(b).toMatchObject({ all: [DRAGON], anyOf: [[INCANT_2, FIRE_4]] });
    b = moveEffect(b, INCANT_2, 0, 'all');
    b = moveEffect(b, FIRE_4, 0, 'all');
    expect(b).toMatchObject({ all: [DRAGON, INCANT_2, FIRE_4], anyOf: [] });
  });

  it('a draft needs two slots; one-option slots are required effects', () => {
    expect(builderDraft({ ...emptyBuilder(), all: [DRAGON] })).toBeNull();
    const draft = builderDraft({ ...emptyBuilder(), all: [DRAGON], anyOf: [[FIRE_4], []] });
    expect(draft).toMatchObject({
      effects: [DRAGON, FIRE_4],
      copies: 1,
      colorScope: 'perColor',
      importance: 'mustKeep',
    });
    expect(draft?.anyOf).toBeUndefined();
  });

  it('editing keeps the combo settings and the levels of effects still in it', () => {
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
    // Swap Incantations for Affinity in the "any of" slot.
    const edited = moveEffect(b, INCANT_2, 0, 'all');
    const draft = builderDraft({
      ...edited,
      all: [DRAGON],
      anyOf: [[FIRE_4, AFFINITY_2]],
    }) as ComboNeed;
    expect(edited.editing).toEqual({ group: 0, need: 2 });
    expect(applyEdit(old, draft)).toEqual({
      ...old,
      anyOf: [[FIRE_4, AFFINITY_2]],
      minLevels: { [FIRE_4]: 1 },
    });
  });

  it('a relic fills "all of" with its effects, not its curses', () => {
    const b = builderFromRelic(
      { itemId: 2000002, effects: [DRAGON, FIRE_4, null], curses: [6850500, null, null] },
      buildEffectIndex(),
      3,
    );
    expect(b).toEqual({ all: [DRAGON, FIRE_4], anyOf: [], editing: null, focus: 3 });
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
