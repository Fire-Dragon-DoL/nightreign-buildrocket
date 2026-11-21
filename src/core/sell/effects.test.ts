import { describe, expect, it } from 'vitest';
import { buildEffectIndex, FALLBACK_BACKUP_WEIGHT, parseEffectName } from './effects.ts';

const index = buildEffectIndex();

describe('effect families', () => {
  it('reads family, level and hero from names', () => {
    expect(parseEffectName('[Relic] Magic Attack Power Up +2')).toEqual({
      name: 'Magic Attack Power Up +2',
      family: 'Magic Attack Power Up',
      level: 2,
      hero: 0,
    });
    expect(
      parseEffectName('[Relic - Duchess] Improved Character Skill Attack Power'),
    ).toMatchObject({
      family: '[Duchess] Improved Character Skill Attack Power',
      level: 0,
      hero: 4,
    });
  });

  it('reads heroes of unique relic effects', () => {
    expect(
      parseEffectName(
        '[Special Relic - Recluse] Suffer blood loss and increase attack power upon Art activation',
      ),
    ).toMatchObject({
      hero: 7,
      family: '[Recluse] Suffer blood loss and increase attack power upon Art activation',
    });
  });

  it('puts normal +0..+2 and deep +3/+4 in one family', () => {
    const magic = index.family('Magic Attack Power Up');
    expect(magic.map((m) => [m.id, m.level, m.pool])).toEqual([
      [7001500, 0, 'normal'],
      [7001501, 1, 'normal'],
      [7001502, 2, 'normal'],
      [6001500, 3, 'deep'],
      [6001501, 4, 'deep'],
    ]);
    expect(index.maxLevel('Magic Attack Power Up')).toBe(4);
  });

  it('splits same-named normal and deep effects at the same level', () => {
    expect(index.meta(7000090)?.family).toBe('Increased Maximum HP');
    expect(index.meta(6610400)?.family).toBe('Increased Maximum HP (deep)');
  });

  it('treats two ids with the same name and level as one effect', () => {
    expect(index.sameEffect(7001402, 7001409)).toBe(true);
    expect(index.sameEffect(7001401, 7001402)).toBe(false);
  });
});

describe('stacking defaults', () => {
  it('Magic Attack stacks with itself and across levels', () => {
    expect(index.stacks(7001502, 7001502)).toBe(true);
    expect(index.stacks(6001500, 6001501)).toBe(true);
  });

  it('Art gauge on kill +0 and +1 stack although they share a compatibility id', () => {
    expect(index.stacks(7090000, 6090000)).toBe(true);
    expect(index.stacks(7090000, 7090000)).toBe(false);
  });

  it('Post-Damage HP restoration: +1 stacks with +2, neither with +0', () => {
    expect(index.stacks(6005600, 6005601)).toBe(true);
    expect(index.stacks(7005600, 6005600)).toBe(false);
    expect(index.stacks(7005600, 6005601)).toBe(false);
    expect(index.stacks(6005600, 6005600)).toBe(false);
  });

  it('Improved Critical Hits: +0 stacks with +0 and +1, +1 not with itself', () => {
    expect(index.stacks(7040200, 7040200)).toBe(true);
    expect(index.stacks(7040200, 7040201)).toBe(true);
    expect(index.stacks(7040201, 7040201)).toBe(false);
  });

  it('starting weapon element does not stack with starting weapon status', () => {
    expect(index.stacks(7120100, 7120600)).toBe(false);
    expect(index.stacks(7120000, 7120100)).toBe(false);
  });

  it('unknown stacking defaults to stacking, flagged as unknown', () => {
    expect(index.stackingKnown(7037600)).toBe(false);
    expect(index.stacks(7037600, 7037600)).toBe(true);
    expect(index.stackingKnown(7001500)).toBe(true);
  });

  it('curses stack with themselves', () => {
    expect(index.stacks(6850200, 6850200)).toBe(true);
  });
});

describe('backup weights', () => {
  it('uses the ratio of strengths: Magic Attack +3 for a +4 need', () => {
    expect(index.backupWeight(6001500, 6001501)).toBeCloseTo(0.105 / 0.12);
    expect(index.backupWeight(7001502, 7001501)).toBe(0.99);
  });

  it('stats are linear by points', () => {
    expect(index.backupWeight(7000301, 7000302)).toBeCloseTo(2 / 3);
  });

  it('falls back when a value is unknown', () => {
    expect(index.backupWeight(7005600, 6005600)).toBe(FALLBACK_BACKUP_WEIGHT);
  });
});
