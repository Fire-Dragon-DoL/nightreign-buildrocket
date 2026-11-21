import { useMemo, useState } from 'react';
import type { SellConfig } from '../../core/sell/config.ts';
import type { EffectIndex, EffectMeta } from '../../core/sell/effects.ts';
import { type ConfigUpdate, clearStacking, setStacks } from './configEdit.ts';
import { EffectName, EffectPicker } from './controls.tsx';

interface Props {
  config: SellConfig;
  update: ConfigUpdate;
  /** With the user's overrides. */
  index: EffectIndex;
  /** Shipped defaults only. */
  defaults: EffectIndex;
}

type Preset = 'default' | 'levels' | 'sameLevel' | 'all' | 'custom';
const PRESET_LABELS: Record<Preset, string> = {
  default: 'Default rules',
  levels: "Levels don't stack (nothing stacks)",
  sameLevel: "Same level doesn't stack",
  all: 'Everything stacks',
  custom: 'Custom',
};

/** Desired "stacks?" for a pair under a preset. */
const presetStacks = (preset: Preset, a: EffectMeta, b: EffectMeta): boolean =>
  preset === 'all' ? true : preset === 'levels' ? false : a.level !== b.level;

/** Members at distinct (level, pool) only: equivalent ids share rules. */
const distinct = (members: EffectMeta[], index: EffectIndex) =>
  members.filter((m, i) => !members.slice(0, i).some((o) => index.sameEffect(o.id, m.id)));

function currentPreset(members: EffectMeta[], config: SellConfig, index: EffectIndex): Preset {
  const ids = new Set(members.map((m) => m.id));
  const r = config.effectRules;
  const touched =
    members.some((m) => r.stacksWithSelf[m.id] !== undefined) ||
    [...r.noStack, ...r.stack].some(([a, b]) => ids.has(a) && ids.has(b));
  if (!touched) return 'default';
  for (const preset of ['levels', 'sameLevel', 'all'] as const) {
    if (
      members.every((a) =>
        members.every((b) => index.stacks(a.id, b.id) === presetStacks(preset, a, b)),
      )
    ) {
      return preset;
    }
  }
  return 'custom';
}

/** Per-family stacking: a preset, or a pair grid. */
export function StackingTab({ config, update, index, defaults }: Props) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [pair, setPair] = useState<number[]>([]);

  const families = useMemo(() => {
    const ruled = new Set<string>();
    for (const [a, b] of [...index.rules.noStack, ...config.effectRules.stack]) {
      const fa = index.meta(a)?.family;
      if (fa && fa === index.meta(b)?.family) ruled.add(fa);
    }
    return index
      .families()
      .map((f) => ({
        family: f,
        members: distinct(
          index.family(f).filter((m) => m.tier !== 'special'),
          index,
        ),
      }))
      .filter(({ family, members }) => members.length > 1 || ruled.has(family) || showAll)
      .filter(({ members }) => members.length > 0)
      .sort((a, b) => a.family.localeCompare(b.family));
  }, [index, config.effectRules.stack, showAll]);

  const query = search.trim().toLowerCase();
  const shown = families.filter((f) => !query || f.family.toLowerCase().includes(query));

  const applyPreset = (members: EffectMeta[], preset: Preset) =>
    update((c) => {
      let rules = clearStacking(
        c.effectRules,
        members.map((m) => m.id),
      );
      if (preset !== 'default' && preset !== 'custom') {
        for (const a of members) {
          for (const b of members) {
            if (a.id > b.id) continue;
            rules = setStacks(rules, defaults, a.id, b.id, presetStacks(preset, a, b));
          }
        }
      }
      return { ...c, effectRules: rules };
    });

  // Cross-family "don't stack" pairs set by the user.
  const crossPairs = config.effectRules.noStack.filter(
    ([a, b]) => index.meta(a)?.family !== index.meta(b)?.family,
  );

  return (
    <div className="stacking-tab">
      <p className="intro">
        Which effects stack in one build. Defaults come from the community spreadsheet (game
        1.03.2);
        <b> stacking unknown</b> is treated as "stacks". Change a family with a preset or tick the
        grid: a ticked cell means the two levels stack together, the diagonal means a level stacks
        with another copy of itself.
      </p>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search families…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="field">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>Show single-level effects too</span>
        </label>
      </div>
      <div className="stacking-list">
        {shown.map(({ family, members }) => {
          const preset = currentPreset(members, config, index);
          return (
            <details key={family} className="stacking-family" data-testid="stacking-family">
              <summary>
                <span className="build__name">{family}</span>{' '}
                <span className="muted">
                  {members.map((m) => `+${m.level}`).join(' ')} · {PRESET_LABELS[preset]}
                  {members.some((m) => !index.stackingKnown(m.id)) && ' · stacking unknown'}
                </span>
              </summary>
              <label className="field">
                <span>Preset</span>
                <select
                  value={preset}
                  data-testid="stacking-preset"
                  onChange={(e) => applyPreset(members, e.target.value as Preset)}
                >
                  {(['default', 'levels', 'sameLevel', 'all', 'custom'] as const).map((p) => (
                    <option key={p} value={p} disabled={p === 'custom'}>
                      {PRESET_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <table className="stack-grid">
                <thead>
                  <tr>
                    <th />
                    {members.map((m) => (
                      <th key={m.id} title={m.name}>
                        +{m.level}
                        {m.pool === 'deep' ? ' (deep)' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((a) => (
                    <tr key={a.id}>
                      <th>
                        <EffectName meta={a} id={a.id} />
                      </th>
                      {members.map((b) => (
                        <td key={b.id}>
                          <input
                            type="checkbox"
                            checked={index.stacks(a.id, b.id)}
                            title={`${a.name} with ${b.name}`}
                            onChange={(e) =>
                              update((c) => ({
                                ...c,
                                effectRules: setStacks(
                                  c.effectRules,
                                  defaults,
                                  a.id,
                                  b.id,
                                  e.target.checked,
                                ),
                              }))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
      </div>

      <section className="group-card">
        <h3>Effects from different families that don't stack</h3>
        <p className="muted">For example two effects that change the same starting weapon.</p>
        <ul className="effects">
          {crossPairs.map(([a, b]) => (
            <li key={`${a}|${b}`} className="field">
              <EffectName meta={index.meta(a)} id={a} /> <span className="muted">with</span>{' '}
              <EffectName meta={index.meta(b)} id={b} />
              <button
                type="button"
                className="button--quiet"
                onClick={() =>
                  update((c) => ({
                    ...c,
                    effectRules: setStacks(c.effectRules, defaults, a, b, true),
                  }))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="field">
          {pair.map((id) => (
            <span key={id} className="chip">
              {index.meta(id)?.name}
            </span>
          ))}
          {pair.length < 2 && (
            <EffectPicker index={index} onPick={(id) => setPair([...pair, id])} />
          )}
          <button
            type="button"
            disabled={pair.length < 2}
            onClick={() => {
              const [a, b] = pair;
              if (a !== undefined && b !== undefined) {
                update((c) => ({
                  ...c,
                  effectRules: setStacks(c.effectRules, defaults, a, b, false),
                }));
              }
              setPair([]);
            }}
          >
            Add "don't stack" pair
          </button>
          {pair.length > 0 && (
            <button type="button" className="button--quiet" onClick={() => setPair([])}>
              Clear
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
