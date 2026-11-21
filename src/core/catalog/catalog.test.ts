import { describe, expect, it } from 'vitest';
import {
  catalog,
  cleanEffectName,
  effectName,
  heroName,
  RelicColor,
  relicName,
  vesselName,
} from './catalog.ts';

describe('catalog', () => {
  it('knows relics with color and deep flag', () => {
    expect(catalog().relic(1003201)).toEqual({
      id: 1003201,
      name: 'Polished Luminous Scene',
      deep: false,
      color: RelicColor.Yellow,
    });
  });

  it('converts the per-hero allow list into hero ids', () => {
    const effect = catalog().effect(10000);
    expect(effect?.tier).toBe('special');
    expect(effect?.heroes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('knows vessels and their slot colors', () => {
    expect(catalog().vessel(1000)).toMatchObject({
      hero: 1,
      slots: [0, 0, 1],
      deepSlots: [0, 0, 1],
    });
  });

  it('has a reasonable amount of data', () => {
    expect([...catalog().relics()].length).toBeGreaterThan(800);
    expect([...catalog().effects()].length).toBeGreaterThan(500);
    expect([...catalog().vessels()].length).toBeGreaterThan(70);
  });

  it('falls back to readable names for unknown ids', () => {
    expect(relicName(1)).toBe('Antique');
    expect(relicName(-5)).toBe('Unknown relic (-5)');
    expect(effectName(42)).toBe('Unknown effect (42)');
    expect(vesselName(42)).toBe('Unknown vessel (42)');
    expect(heroName(6)).toBe('Revenant');
    expect(heroName(99)).toBe('Unknown hero (99)');
  });
});

describe('official effect data (data/game/effect_details.json)', () => {
  it('uses the official names, with a cleaned community name where the game has none', () => {
    expect(catalog().effect(7001502)?.name).toBe('Magic Attack Power Up +2');
    expect(catalog().effect(7033200)?.name).toBe('[Wylder] +1 additional Character Skill use');
    expect(catalog().effect(7034500)?.name).toBe(
      '[Executor] While Character Skill is active, unlocking use of cursed sword restores HP',
    );
    expect(catalog().effect(6500800)?.name).toBe(
      '[Scholar] Reduced FP consumption when using Character Skill on self',
    );
  });

  it('cleans community names', () => {
    expect(cleanEffectName('[Relic - Recluse] Improved Vigor- Endurance- and Dexterity')).toBe(
      '[Recluse] Improved Vigor, Endurance, and Dexterity',
    );
    expect(cleanEffectName('[Special Relic] Taking attacks improves attack power.')).toBe(
      'Taking attacks improves attack power',
    );
  });

  it('folds identical effects into one, stored under the regular id', () => {
    // The Wylder's Earring's copy, and two unique-only copies (the 7-digit id wins).
    expect(catalog().canonicalEffect(11000)).toBe(7033200);
    expect(catalog().canonicalEffect(7033200)).toBe(7033200);
    expect(catalog().canonicalEffect(10002)).toBe(7035900);
    expect(catalog().canonicalEffect(7001409)).toBe(7001402);
    expect(catalog().canonicalEffect(7126002)).toBe(7126000);
  });

  it('knows the in-game search filter of each effect', () => {
    const filter = catalog().effect(6001501)?.filter ?? 0;
    expect(catalog().filterName(filter)).toBe('Magic Attack Power Up');
    expect(catalog().effect(7001500)?.filter).toBe(filter);
  });
});
