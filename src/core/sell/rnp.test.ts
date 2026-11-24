import { describe, expect, it } from 'vitest';
import { effectiveRules, emptyConfig, type SellConfig } from './config.ts';
import { defaultEffectRules } from './effects.ts';
import { parseRnp, RNP_FORMAT, RnpError, serializeRnp } from './rnp.ts';

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
    const text = serializeRnp(sample(), new Date('2026-11-21T00:00:00Z'));
    const parsed = parseRnp(text);
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
      exactLevels: [6001601],
      core: [7044600],
      relics: 'any',
      copies: 3,
      colorScope: 'perColor',
      importance: 'mustKeep',
    });
    const text = serializeRnp(config);
    expect(parseRnp(text).config).toEqual(config);
    const any = JSON.parse(text).groups[0].needs.at(-1).anyOf[0];
    expect(any[1]).toEqual({
      id: 6001601,
      name: 'Fire Attack Power Up +4',
      minLevel: 1,
      exact: true,
    });
  });

  it('round-trips "+N only" on single effects', () => {
    const config = sample();
    config.groups[0]?.needs.push({
      kind: 'effect',
      effect: 6090000,
      minLevel: 1,
      exactLevel: true,
      copies: 1,
      colorScope: 'any',
      importance: 'high',
    });
    expect(parseRnp(serializeRnp(config)).config).toEqual(config);
  });

  it('writes names next to ids so the file is readable', () => {
    const doc = JSON.parse(serializeRnp(sample()));
    expect(doc.format).toBe(RNP_FORMAT);
    expect(doc.version).toBe(1);
    expect(doc.groups[0].needs[1].effect).toEqual({
      id: 7001502,
      name: 'Magic Attack Power Up +2',
    });
    expect(doc.neverSell[0].name).toBe('Grand Burning Scene');
  });

  it('loads .rsp plans saved by earlier builds (no Relics setting, no combo levels)', () => {
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
    const parsed = parseRnp(JSON.stringify(old));
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
    expect(JSON.parse(serializeRnp(parsed.config)).groups[0].needs[1]).not.toHaveProperty('relics');
  });

  it('keeps unknown ids and warns about them', () => {
    const doc = JSON.parse(serializeRnp(emptyConfig()));
    doc.groups = [
      {
        name: 'x',
        needs: [
          { kind: 'effect', effect: { id: 1 }, copies: 1, colorScope: 'any', importance: 'low' },
        ],
      },
    ];
    const parsed = parseRnp(JSON.stringify(doc));
    expect(parsed.config.groups[0]?.needs[0]).toMatchObject({ effect: 1 });
    expect(parsed.warnings).toEqual(['Unknown effect id 1 (kept as is).']);
  });

  it('rejects other files and invalid values', () => {
    expect(() => parseRnp('nope')).toThrow(RnpError);
    expect(() => parseRnp('{"format":"x"}')).toThrow('Not a Buildrocket relic needs plan');
    const doc = JSON.parse(serializeRnp(sample()));
    doc.groups[0].needs[0].importance = 'very';
    expect(() => parseRnp(JSON.stringify(doc))).toThrow('Invalid importance');
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
