import { describe, expect, it } from 'vitest';
import { catalog, effectName, heroName, RelicColor, relicName, vesselName } from './catalog.ts';

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
