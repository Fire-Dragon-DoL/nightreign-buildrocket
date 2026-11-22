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
          minLevels: { 6001601: 1 },
          relics: 'deep',
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

  it('round-trips combos with "any of" slots and their levels', () => {
    const config = sample();
    config.groups[0]?.needs.push({
      kind: 'combo',
      effects: [7044600],
      anyOf: [[6611302, 6001601, 6610802]],
      minLevels: { 6001601: 1 },
      relics: 'any',
      copies: 3,
      colorScope: 'perColor',
      importance: 'mustKeep',
    });
    const text = serializeRsp(config);
    expect(parseRsp(text).config).toEqual(config);
    const any = JSON.parse(text).groups[0].needs.at(-1).anyOf[0];
    expect(any[1]).toEqual({ id: 6001601, name: 'Fire Attack Power Up +4', minLevel: 1 });
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

  it('loads plans saved by earlier builds (no Relics setting, no combo levels)', () => {
    const old = {
      format: 'buildrocket-rsp',
      version: 1,
      savedAt: '2026-11-21T10:00:00.000Z',
      effectRules: { families: [], stacksWithSelf: [], noStack: [], stack: [], curseDefaults: [] },
      groups: [
        {
          name: 'Fire (Executor)',
          needs: [
            {
              kind: 'combo',
              effects: [{ id: 6001601, name: '[Relic] Fire Attack Power Up +4' }, { id: 6611302 }],
              copies: 1,
              colorScope: 'perColor',
              colors: ['Red'],
              importance: 'high',
              curseOverrides: [{ curse: { id: 6850500 }, penalty: 'fine' }],
            },
            {
              kind: 'effect',
              effect: { id: 7001502 },
              copies: 2,
              colorScope: 'any',
              importance: 'mustKeep',
            },
          ],
        },
      ],
      neverSell: [],
    };
    const parsed = parseRsp(JSON.stringify(old));
    expect(parsed.warnings).toEqual([]);
    const [combo, single] = parsed.config.groups[0]?.needs ?? [];
    expect(combo).toEqual({
      kind: 'combo',
      effects: [6001601, 6611302],
      copies: 1,
      colorScope: 'perColor',
      colors: ['Red'],
      importance: 'high',
      curseOverrides: { 6850500: 'fine' },
    });
    expect(single).not.toHaveProperty('relics');
    // Saving it again doesn't invent settings.
    expect(JSON.parse(serializeRsp(parsed.config)).groups[0].needs[1]).not.toHaveProperty('relics');
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
