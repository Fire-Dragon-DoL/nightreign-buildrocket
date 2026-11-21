import { describe, expect, it } from 'vitest';
import { effectiveRules, emptyConfig, type SellConfig } from './config.ts';
import { defaultEffectRules } from './effects.ts';
import { parseRsp, RSP_FORMAT, RspError, serializeRsp } from './rsp.ts';

const sample = (): SellConfig => ({
  effectRules: {
    families: { 7001500: { family: 'Magic Attack Power Up', level: 0 } },
    stacksWithSelf: { 7037600: false },
    noStack: [[7001500, 7001501]],
    stack: [[6005600, 7005600]],
    curseDefaults: { 6850500: 'dealbreaker' },
  },
  groups: [
    {
      name: 'Executor bleed',
      needs: [
        { kind: 'effect', effect: 6820500, copies: 1, colorScope: 'any', importance: 'mustKeep' },
        {
          kind: 'effect',
          effect: 7001502,
          minLevel: 1,
          copies: 2,
          colorScope: 'perColor',
          colors: ['Red', 'Green'],
          importance: 'high',
          curseOverrides: { 6850500: 'fine' },
        },
        {
          kind: 'combo',
          effects: [6001601, 6611302, 6610500],
          copies: 1,
          colorScope: 'any',
          importance: 'normal',
        },
      ],
    },
  ],
  neverSell: [1180],
});

describe('.rsp files', () => {
  it('round-trips a config', () => {
    const text = serializeRsp(sample(), new Date('2026-11-21T00:00:00Z'));
    const parsed = parseRsp(text);
    expect(parsed.config).toEqual(sample());
    expect(parsed.warnings).toEqual([]);
  });

  it('writes names next to ids so the file is readable', () => {
    const doc = JSON.parse(serializeRsp(sample()));
    expect(doc.format).toBe(RSP_FORMAT);
    expect(doc.version).toBe(1);
    expect(doc.groups[0].needs[1].effect).toEqual({
      id: 7001502,
      name: 'Magic Attack Power Up +2',
    });
    expect(doc.neverSell[0].name).toBe('Grand Burning Scene');
  });

  it('keeps unknown ids and warns about them', () => {
    const doc = JSON.parse(serializeRsp(emptyConfig()));
    doc.groups = [
      {
        name: 'x',
        needs: [
          { kind: 'effect', effect: { id: 1 }, copies: 1, colorScope: 'any', importance: 'low' },
        ],
      },
    ];
    const parsed = parseRsp(JSON.stringify(doc));
    expect(parsed.config.groups[0]?.needs[0]).toMatchObject({ effect: 1 });
    expect(parsed.warnings).toEqual(['Unknown effect id 1 (kept as is).']);
  });

  it('rejects other files and invalid values', () => {
    expect(() => parseRsp('nope')).toThrow(RspError);
    expect(() => parseRsp('{"format":"x"}')).toThrow('Not a Buildrocket sell plan');
    const doc = JSON.parse(serializeRsp(sample()));
    doc.groups[0].needs[0].importance = 'very';
    expect(() => parseRsp(JSON.stringify(doc))).toThrow('Invalid importance');
  });
});

describe('effective rules', () => {
  it('applies overrides on top of the defaults', () => {
    const defaults = defaultEffectRules();
    expect(defaults.noStack).toContainEqual([6005600, 7005600]);
    const rules = effectiveRules(sample().effectRules, defaults);
    expect(rules.noStack).not.toContainEqual([6005600, 7005600]);
    expect(rules.noStack).toContainEqual([7001500, 7001501]);
    expect(rules.stacksWithSelf[7037600]).toBe(false);
  });
});
