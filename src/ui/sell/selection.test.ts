import { describe, expect, it } from 'vitest';
import type { Need } from '../../core/sell/config.ts';
import { parseRnp, serializeRnp } from '../../core/sell/rnp.ts';
import {
  clickSelect,
  emptySelection,
  isSelected,
  planNeeds,
  selectAll,
  selectedIn,
  selectedNeeds,
  selectionAfterMove,
  selectionAfterRemove,
  sharedPlan,
} from './selection.ts';

const ticked = (s: ReturnType<typeof emptySelection>, group = 0) =>
  [0, 1, 2, 3, 4, 5].filter((i) => isSelected(s, group, i));

const need = (effect: number): Need => ({
  kind: 'effect',
  effect,
  copies: 1,
  colorScope: 'perColor',
  importance: 'normal',
});

describe('needs selection', () => {
  it('ticks and unticks one need per click', () => {
    let s = clickSelect(emptySelection(), 0, 2, false);
    expect(ticked(s)).toEqual([2]);
    s = clickSelect(s, 0, 2, false);
    expect(ticked(s)).toEqual([]);
  });

  it('Shift-click ticks the range from the last click, in either direction', () => {
    let s = clickSelect(emptySelection(), 0, 1, false);
    s = clickSelect(s, 0, 4, true);
    expect(ticked(s)).toEqual([1, 2, 3, 4]);
    // Another Shift-click keeps the same start.
    s = clickSelect(clickSelect(emptySelection(), 0, 4, false), 0, 2, true);
    expect(ticked(s)).toEqual([2, 3, 4]);
  });

  it('Shift-click on a ticked need unticks the range', () => {
    let s = selectAll(emptySelection(), 0, 6, true);
    s = clickSelect(s, 0, 1, false); // unticks 1, anchor at 1
    s = clickSelect(s, 0, 3, true); // 3 is ticked: untick 1..3
    expect(ticked(s)).toEqual([0, 4, 5]);
  });

  it('Shift-click without an earlier click (or in another group) ticks just that one', () => {
    expect(ticked(clickSelect(emptySelection(), 0, 3, true))).toEqual([3]);
    const s = clickSelect(clickSelect(emptySelection(), 1, 0, false), 0, 3, true);
    expect(ticked(s)).toEqual([3]);
    expect(selectedIn(s, 1)).toBe(1);
  });

  it('follows needs that move or are removed', () => {
    const s = clickSelect(clickSelect(emptySelection(), 0, 1, false), 0, 3, false);
    expect(ticked(selectionAfterMove(s, 0, 1, 4))).toEqual([2, 4]);
    expect(ticked(selectionAfterMove(s, 0, 4, 0))).toEqual([2, 4]);
    expect(ticked(selectionAfterRemove(s, 0, 1))).toEqual([2]);
    expect(ticked(selectionAfterRemove(s, 0, 2))).toEqual([1, 2]);
  });

  it('exports the ticked needs in list order, alone in a plan that reads back', () => {
    const config = { ...sharedPlan([need(7001502), need(7001503), need(7001504)]) };
    const s = clickSelect(clickSelect(emptySelection(), 0, 2, false), 0, 0, false);
    const picked = selectedNeeds(config, s);
    expect(picked.map((n) => n.kind === 'effect' && n.effect)).toEqual([7001502, 7001504]);
    const back = parseRnp(serializeRnp(sharedPlan(picked))).config;
    expect(planNeeds(back)).toEqual(picked);
  });
});
