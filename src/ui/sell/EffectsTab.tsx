import { Fragment, useMemo, useState } from 'react';
import { HEROES } from '../../core/catalog/catalog.ts';
import {
  type ColorScope,
  CURSE_PENALTIES,
  type CursePenalty,
  type EffectNeed,
  type Importance,
  RELIC_COLORS,
  type SellConfig,
} from '../../core/sell/config.ts';
import type { EffectIndex, EffectMeta } from '../../core/sell/effects.ts';
import {
  type ConfigUpdate,
  DEFAULT_GROUP,
  effectNeedIndex,
  setCurseDefault,
  setEffectNeed,
} from './configEdit.ts';
import {
  ColorToggles,
  CopiesInput,
  EffectName,
  ImportanceSelect,
  PENALTY_LABELS,
  ScopeSelect,
} from './controls.tsx';

/** Owned relics per effect id: counts per color (Red, Blue, Yellow, Green). */
export type OwnedCounts = Map<number, number[]>;

interface Props {
  kind: 'normal' | 'deep';
  config: SellConfig;
  update: ConfigUpdate;
  index: EffectIndex;
  owned: OwnedCounts | null;
}

interface FamilyRows {
  family: string;
  hero: number;
  rows: EffectMeta[];
}

/** One tab of effects (normal, or Deep of Night with curses), grouped by family and hero. */
export function EffectsTab({ kind, config, update, index, owned }: Props) {
  // Plans are one list now; older plans' other groups are left alone here.
  const groupName = DEFAULT_GROUP;
  const [search, setSearch] = useState('');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [onlyWanted, setOnlyWanted] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<{
    importance: Importance | null;
    copies: number;
    scope: ColorScope;
  }>({
    importance: 'normal',
    copies: 1,
    scope: 'perColor',
  });

  const group = config.groups.find((g) => g.name === groupName);
  const needOf = (id: number): EffectNeed | undefined => {
    const n = group?.needs[effectNeedIndex(group, id)];
    return n?.kind === 'effect' ? n : undefined;
  };
  const otherGroups = (id: number) =>
    config.groups.filter(
      (g) =>
        g.name !== groupName &&
        g.needs.some((n) => (n.kind === 'effect' ? n.effect === id : n.effects.includes(id))),
    ).length;

  const families = useMemo(() => {
    const wanted = (m: EffectMeta) =>
      kind === 'normal' ? m.pool !== 'deep' : m.pool === 'deep' && m.tier !== 'curse';
    const byFamily = new Map<string, FamilyRows>();
    for (const m of index.all()) {
      if (!wanted(m)) continue;
      const entry = byFamily.get(m.family) ?? { family: m.family, hero: m.hero, rows: [] };
      entry.rows.push(m);
      byFamily.set(m.family, entry);
    }
    for (const f of byFamily.values()) f.rows.sort((a, b) => a.level - b.level || a.id - b.id);
    return [...byFamily.values()].sort(
      (a, b) => a.hero - b.hero || a.family.localeCompare(b.family),
    );
  }, [index, kind]);

  const query = search.trim().toLowerCase();
  const total = (id: number) => (owned?.get(id) ?? []).reduce((a, b) => a + b, 0);
  const visible = (m: EffectMeta) =>
    (!query || m.name.toLowerCase().includes(query)) &&
    (!onlyOwned || total(m.id) > 0) &&
    (!onlyWanted || needOf(m.id) !== undefined);
  const shown = families
    .map((f) => ({ ...f, rows: f.rows.filter(visible) }))
    .filter((f) => f.rows.length > 0);
  const shownIds = shown.flatMap((f) => f.rows.map((r) => r.id));
  const curses = index.all().filter((m) => m.tier === 'curse' && visible(m));

  const setNeed = (id: number, patch: Parameters<typeof setEffectNeed>[3]) =>
    update((c) => setEffectNeed(c, groupName, id, patch, index));
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const applyBulk = () =>
    update((c) => {
      let next = c;
      for (const id of selected) {
        next = setEffectNeed(
          next,
          groupName,
          id,
          bulk.importance === null
            ? null
            : { importance: bulk.importance, copies: bulk.copies, colorScope: bulk.scope },
          index,
        );
      }
      return next;
    });

  let lastHero = -1;
  return (
    <div className="effects-tab">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search effects…"
          value={search}
          data-testid={`${kind}-search`}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="field">
          <input
            type="checkbox"
            checked={onlyOwned}
            disabled={!owned}
            onChange={(e) => setOnlyOwned(e.target.checked)}
          />
          <span>Only owned</span>
        </label>
        <label className="field">
          <input
            type="checkbox"
            checked={onlyWanted}
            onChange={(e) => setOnlyWanted(e.target.checked)}
          />
          <span>Only in my list</span>
        </label>
      </div>

      <div className="toolbar bulk">
        <span>{selected.size} selected</span>
        <button
          type="button"
          className="button--quiet"
          onClick={() => setSelected(new Set([...selected, ...shownIds]))}
        >
          Select shown
        </button>
        <button type="button" className="button--quiet" onClick={() => setSelected(new Set())}>
          Clear
        </button>
        <span className="muted">Set to</span>
        <ImportanceSelect
          value={bulk.importance}
          allowNone
          onChange={(importance) => setBulk({ ...bulk, importance })}
        />
        <CopiesInput value={bulk.copies} onChange={(copies) => setBulk({ ...bulk, copies })} />
        <ScopeSelect value={bulk.scope} onChange={(scope) => setBulk({ ...bulk, scope })} />
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={applyBulk}
          data-testid={`${kind}-bulk-apply`}
        >
          Apply to selected
        </button>
      </div>

      <div className="table-scroll">
        <table className="effect-table" data-testid={`${kind}-effects`}>
          <thead>
            <tr>
              <th />
              <th>Effect</th>
              <th>Importance</th>
              <th>Copies</th>
              <th>Count</th>
              <th>Colors</th>
              {owned && (
                <th title="Owned relics with this effect: red, blue, yellow, green">
                  Owned R / B / Y / G
                </th>
              )}
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const heroHeader = f.hero !== lastHero && f.hero > 0;
              lastHero = f.hero;
              return (
                <Fragment key={f.family}>
                  {heroHeader && (
                    <tr className="effect-table__hero">
                      <td colSpan={8}>{HEROES[f.hero]}</td>
                    </tr>
                  )}
                  {f.rows.map((m) => {
                    const need = needOf(m.id);
                    const others = otherGroups(m.id);
                    const counts = owned?.get(m.id);
                    return (
                      <tr
                        key={m.id}
                        data-testid="effect-row"
                        className={need ? 'effect-table__wanted' : undefined}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(m.id)}
                            onChange={() => toggle(m.id)}
                          />
                        </td>
                        <td>
                          <EffectName meta={m} id={m.id} />
                        </td>
                        <td>
                          <ImportanceSelect
                            value={need?.importance ?? null}
                            allowNone
                            testId="effect-importance"
                            onChange={(importance) =>
                              setNeed(m.id, importance === null ? null : { importance })
                            }
                          />
                        </td>
                        <td>
                          {need && (
                            <CopiesInput
                              value={need.copies}
                              testId="effect-copies"
                              onChange={(copies) => setNeed(m.id, { copies })}
                            />
                          )}
                        </td>
                        <td>
                          {need && (
                            <ScopeSelect
                              value={need.colorScope}
                              onChange={(colorScope) => setNeed(m.id, { colorScope })}
                            />
                          )}
                        </td>
                        <td>
                          {need && (
                            <ColorToggles
                              value={need.colors}
                              onChange={(colors) =>
                                setNeed(m.id, colors ? { colors } : { colors: [...RELIC_COLORS] })
                              }
                            />
                          )}
                        </td>
                        {owned && (
                          <td className="owned">
                            {counts ? (
                              counts.map((n, i) => <span key={RELIC_COLORS[i]}>{n || '·'}</span>)
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        )}
                        <td className="muted">
                          {[
                            !m.rolls && 'unique relics only',
                            !index.stackingKnown(m.id) && 'stacking unknown',
                            index.stackingKnown(m.id) &&
                              !index.stacks(m.id, m.id) &&
                              "doesn't stack with itself",
                            others > 0 && `in ${others} other group${others > 1 ? 's' : ''}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {kind === 'deep' && curses.length > 0 && (
        <section className="curses">
          <h3>Curses</h3>
          <p className="muted">
            Set how much each curse bothers you by default. A <b>dealbreaker</b> stops a relic from
            counting toward any need, unless that need tolerates it (Groups tab). Curses can also be
            wanted: give them an importance like any effect.
          </p>
          <div className="table-scroll">
            <table className="effect-table" data-testid="curse-table">
              <thead>
                <tr>
                  <th>Curse</th>
                  <th>Default penalty</th>
                  <th>Importance</th>
                  <th>Copies</th>
                  {owned && <th>Owned R / B / Y / G</th>}
                </tr>
              </thead>
              <tbody>
                {curses.map((m) => {
                  const need = needOf(m.id);
                  const counts = owned?.get(m.id);
                  return (
                    <tr key={m.id} data-testid="curse-row">
                      <td>
                        <EffectName meta={m} id={m.id} />
                      </td>
                      <td>
                        <select
                          value={config.effectRules.curseDefaults[m.id] ?? 'fine'}
                          data-testid="curse-penalty"
                          onChange={(e) =>
                            update((c) =>
                              setCurseDefault(
                                c,
                                m.id,
                                e.target.value === 'fine' ? null : (e.target.value as CursePenalty),
                              ),
                            )
                          }
                        >
                          {CURSE_PENALTIES.map((p) => (
                            <option key={p} value={p}>
                              {PENALTY_LABELS[p]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <ImportanceSelect
                          value={need?.importance ?? null}
                          allowNone
                          onChange={(importance) =>
                            setNeed(
                              m.id,
                              importance === null ? null : { importance, colorScope: 'any' },
                            )
                          }
                        />
                      </td>
                      <td>
                        {need && (
                          <CopiesInput
                            value={need.copies}
                            onChange={(copies) => setNeed(m.id, { copies })}
                          />
                        )}
                      </td>
                      {owned && (
                        <td className="owned">
                          {counts ? (
                            counts.map((n, i) => <span key={RELIC_COLORS[i]}>{n || '·'}</span>)
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
