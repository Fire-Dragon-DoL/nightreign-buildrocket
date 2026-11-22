import { useState } from 'react';
import type { CharacterData } from '../../core/builds/characters.ts';
import {
  type ComboNeed,
  type Need,
  RELIC_COLORS,
  RELIC_KIND_LABELS,
  RELIC_KINDS,
  type RelicKind,
  type SellConfig,
} from '../../core/sell/config.ts';
import type { EffectIndex } from '../../core/sell/effects.ts';
import { withDefaultLevels } from '../../core/sell/needs.ts';
import { needRelicKind } from '../../core/sell/planner.ts';
import { applyEdit, type Builder, builderFromNeed, followEdit } from './builder.ts';
import { ComboBuilder } from './ComboBuilder.tsx';
import {
  acceptLowerLevels,
  addNeeds,
  type ConfigUpdate,
  DEFAULT_GROUP,
  mergeAllGroups,
  moveNeed,
  setGroups,
  updateGroup,
  updateNeed,
} from './configEdit.ts';
import {
  ColorToggles,
  CopiesInput,
  CurseTolerance,
  EffectName,
  EffectPicker,
  ImportanceSelect,
  ScopeSelect,
} from './controls.tsx';
import { SeedTab } from './SeedTab.tsx';

type SetBuilder = (fn: (b: Builder) => Builder) => void;

interface Props {
  config: SellConfig;
  update: ConfigUpdate;
  index: EffectIndex;
}

/**
 * The plan's needs: single effects and combos (effects wanted on the same relic), in one list.
 * Plans from older versions may hold several named groups: they are shown apart, with a button to
 * merge them into one list.
 */
export function GroupsTab({
  config,
  update,
  index,
  character,
  builder,
  setBuilder,
}: Props & { character: CharacterData | undefined; builder: Builder; setBuilder: SetBuilder }) {
  const legacy = config.groups.length > 1;
  const main = Math.max(
    0,
    config.groups.findIndex((g) => g.name === DEFAULT_GROUP),
  );
  return (
    <div className="groups-tab">
      <div className="toolbar">
        <span className="muted">
          What you want to keep: single effects (also set in the Normal / Deep tabs) and combos of
          effects you want on the same relic.
        </span>
        <div className="toolbar__spacer" />
        <button
          type="button"
          className="button--quiet"
          data-testid="accept-lower"
          title="For effects that stack with themselves: count lower levels too (the highest you own is kept first)"
          onClick={() => update((c) => acceptLowerLevels(c, index))}
        >
          Accept lower levels for stacking effects
        </button>
      </div>
      <details className="build-picker" data-testid="seed">
        <summary>Protect relics used in builds…</summary>
        <SeedTab character={character} update={update} index={index} />
      </details>
      {legacy && (
        <p className="warning" data-testid="legacy-groups">
          This plan has {config.groups.length} named groups (made with an older version).{' '}
          <button
            type="button"
            data-testid="merge-groups"
            onClick={() => update((c) => mergeAllGroups(c))}
          >
            Merge into one list
          </button>
        </p>
      )}
      {legacy ? (
        config.groups.map((_, gi) => (
          <GroupCard
            // biome-ignore lint/suspicious/noArrayIndexKey: groups have no id
            key={gi}
            config={config}
            update={update}
            index={index}
            groupIndex={gi}
            named
            setBuilder={setBuilder}
          />
        ))
      ) : (
        <GroupCard
          config={config}
          update={update}
          index={index}
          groupIndex={main}
          named={false}
          setBuilder={setBuilder}
        />
      )}
      <section className="group-card">
        <ComboBuilder
          builder={builder}
          setBuilder={setBuilder}
          index={index}
          onSubmit={(draft) =>
            update((c) => {
              const at = builder.editing;
              const old = at && c.groups[at.group]?.needs[at.need];
              if (at && old) {
                return updateNeed(c, at.group, at.need, (n) =>
                  withDefaultLevels(applyEdit(n, draft), index),
                );
              }
              // New needs go to the one list (merged with an identical need if there is one).
              return addNeeds(c, [withDefaultLevels(draft, index)]).config;
            })
          }
        />
      </section>
    </div>
  );
}

/** Lowest level that counts, for effects with several levels ("+1 or higher"). */
function LevelSelect({
  index,
  id,
  value,
  onChange,
}: {
  index: EffectIndex;
  id: number;
  value: number | undefined;
  onChange: (level: number) => void;
}) {
  const meta = index.meta(id);
  if (!meta) return null;
  const levels = [...new Set(index.family(meta.family).map((m) => m.level))];
  if (levels.length < 2) return null;
  const max = Math.max(...levels);
  return (
    <select
      className="level-select"
      value={value ?? meta.level}
      data-testid="need-level"
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {levels.map((l) => (
        <option key={l} value={l}>
          +{l}
          {l < max ? ' or higher' : ''}
        </option>
      ))}
    </select>
  );
}

function removeOption(need: ComboNeed, slot: number, id: number): ComboNeed {
  const anyOf = (need.anyOf ?? []).map((s, i) => (i === slot ? s.filter((x) => x !== id) : s));
  return { ...need, anyOf };
}

/** One effect of a combo with its level choice (and a remove button for "any of" options). */
function ComboMember({
  index,
  need,
  id,
  edit,
  onRemove,
}: {
  index: EffectIndex;
  need: ComboNeed;
  id: number;
  edit: (fn: (n: Need) => Need) => void;
  onRemove?: (() => void) | undefined;
}) {
  return (
    <div className="combo__member">
      <EffectName meta={index.meta(id)} id={id} />
      <LevelSelect
        index={index}
        id={id}
        value={need.minLevels?.[id]}
        onChange={(level) =>
          edit((n) =>
            n.kind === 'combo'
              ? {
                  ...n,
                  minLevels: { ...n.minLevels, [id]: level },
                  // Lower levels may live on the other kind of relic.
                  relics: n.relics ?? 'any',
                }
              : n,
          )
        }
      />
      {onRemove && (
        <button
          type="button"
          className="button--quiet"
          title="Remove this option"
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

function GroupCard({
  config,
  update,
  index,
  groupIndex,
  named,
  setBuilder,
}: Props & { groupIndex: number; named: boolean; setBuilder: SetBuilder }) {
  const group = config.groups[groupIndex] ?? { name: DEFAULT_GROUP, needs: [] };
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const setNeed = (ni: number, patch: Partial<Need> | null) =>
    update((c) =>
      updateNeed(c, groupIndex, ni, patch === null ? null : (n) => ({ ...n, ...patch }) as Need),
    );
  // New needs go to the one list (merged with an identical need if there is one).
  const addNeed = (need: Need) =>
    update((c) => addNeeds(c, [withDefaultLevels(need, index)]).config);

  return (
    <section className="group-card" data-testid="group-card">
      {named && (
        <div className="toolbar">
          <input
            className="group-card__name"
            value={group.name}
            data-testid="group-name"
            onChange={(e) =>
              update((c) => updateGroup(c, groupIndex, (g) => ({ ...g, name: e.target.value })))
            }
          />
          <span className="muted">{group.needs.length} needs</span>
          <div className="toolbar__spacer" />
          <button
            type="button"
            className="button--quiet"
            onClick={() =>
              update((c) =>
                setGroups(
                  c,
                  c.groups.filter((_, i) => i !== groupIndex),
                ),
              )
            }
          >
            Delete group
          </button>
        </div>
      )}

      {group.needs.length === 0 && (
        <p className="muted">
          Nothing yet. Add effects or combos below, give effects an importance in the Normal / Deep
          tabs, or protect the relics your builds use.
        </p>
      )}
      {group.needs.length > 0 && (
        <div className="table-scroll">
          <table className="effect-table">
            <thead>
              <tr>
                <th />
                <th>Need</th>
                <th>Min level</th>
                <th>Relics</th>
                <th>Importance</th>
                <th>Copies</th>
                <th>Count</th>
                <th>Colors</th>
                <th>Curse tolerance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {group.needs.map((need, ni) => {
                const meta = need.kind === 'effect' ? index.meta(need.effect) : undefined;
                return (
                  <tr
                    // biome-ignore lint/suspicious/noArrayIndexKey: needs have no id
                    key={ni}
                    data-testid="need-row"
                    className={[
                      dragging === ni ? 'need-row--dragging' : '',
                      dropAt === ni && dragging !== null && dragging !== ni
                        ? dragging < ni
                          ? 'need-row--drop-below'
                          : 'need-row--drop-above'
                        : '',
                    ].join(' ')}
                    onDragOver={(e) => {
                      if (dragging === null) return;
                      e.preventDefault();
                      setDropAt(ni);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging !== null && dragging !== ni) {
                        const from = dragging;
                        update((c) => moveNeed(c, groupIndex, from, ni));
                        setBuilder((b) => followEdit(b, groupIndex, from, ni));
                      }
                      setDragging(null);
                      setDropAt(null);
                    }}
                  >
                    <td className="need-row__handle">
                      {/* Mouse only: drag and drop has no keyboard equivalent here. */}
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle */}
                      <span
                        draggable
                        data-testid="need-drag"
                        title="Drag to reorder"
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(ni));
                          e.dataTransfer.effectAllowed = 'move';
                          setDragging(ni);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropAt(null);
                        }}
                      >
                        ⠿
                      </span>
                    </td>
                    <td>
                      {need.kind === 'effect' ? (
                        <EffectName meta={meta} id={need.effect} />
                      ) : (
                        <div className="combo">
                          <span className="combo__tag">Combo</span>
                          {need.effects.map((id) => (
                            <ComboMember
                              key={id}
                              index={index}
                              need={need}
                              id={id}
                              edit={(fn) => update((c) => updateNeed(c, groupIndex, ni, fn))}
                            />
                          ))}
                          {(need.anyOf ?? []).map((slot, si) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
                            <div key={si} className="combo__any" data-testid="combo-any">
                              <span className="combo__any-tag">any of</span>
                              {slot.map((id) => (
                                <ComboMember
                                  key={id}
                                  index={index}
                                  need={need}
                                  id={id}
                                  edit={(fn) => update((c) => updateNeed(c, groupIndex, ni, fn))}
                                  onRemove={
                                    slot.length > 1
                                      ? () =>
                                          update((c) =>
                                            updateNeed(c, groupIndex, ni, (n) =>
                                              n.kind === 'combo' ? removeOption(n, si, id) : n,
                                            ),
                                          )
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          ))}
                          <div className="combo__actions">
                            <button
                              type="button"
                              className="button--quiet"
                              data-testid="combo-edit"
                              title="Edit this combo in the builder; Save puts it back here"
                              onClick={() =>
                                setBuilder((b) =>
                                  builderFromNeed(
                                    need,
                                    { group: groupIndex, need: ni },
                                    b.focus + 1,
                                  ),
                                )
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="button--quiet"
                              data-testid="combo-copy"
                              title="Put this combo's effects in the builder, to add a variant"
                              onClick={() =>
                                setBuilder((b) => builderFromNeed(need, null, b.focus + 1))
                              }
                            >
                              Copy to builder
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {need.kind === 'effect' && (
                        <LevelSelect
                          index={index}
                          id={need.effect}
                          value={need.minLevel}
                          onChange={(minLevel) => setNeed(ni, { minLevel })}
                        />
                      )}
                    </td>
                    <td>
                      <select
                        value={needRelicKind(need)}
                        data-testid="need-relics"
                        title="Auto: a relic counts when its effect is the same kind (normal / deep) as the wanted one"
                        onChange={(e) =>
                          update((c) =>
                            updateNeed(c, groupIndex, ni, (n) => {
                              const { relics: _, ...rest } = n;
                              return (
                                e.target.value === 'auto'
                                  ? rest
                                  : { ...rest, relics: e.target.value as RelicKind }
                              ) as Need;
                            }),
                          )
                        }
                      >
                        <option value="auto">Auto (effect's kind)</option>
                        {RELIC_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {RELIC_KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <ImportanceSelect
                        testId="need-importance"
                        value={need.importance}
                        onChange={(importance) => importance && setNeed(ni, { importance })}
                      />
                    </td>
                    <td>
                      <CopiesInput
                        value={need.copies}
                        onChange={(copies) => setNeed(ni, { copies })}
                      />
                    </td>
                    <td>
                      <ScopeSelect
                        value={need.colorScope}
                        onChange={(colorScope) => setNeed(ni, { colorScope })}
                      />
                    </td>
                    <td>
                      <ColorToggles
                        value={need.colors}
                        onChange={(colors) => setNeed(ni, { colors: colors ?? [...RELIC_COLORS] })}
                      />
                    </td>
                    <td>
                      <CurseTolerance
                        need={need}
                        index={index}
                        defaults={config.effectRules.curseDefaults}
                        onChange={(curseOverrides) =>
                          update((c) =>
                            updateNeed(c, groupIndex, ni, (n) => {
                              const { curseOverrides: _, ...rest } = n;
                              return (curseOverrides ? { ...rest, curseOverrides } : rest) as Need;
                            }),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button--quiet"
                        onClick={() => {
                          setNeed(ni, null);
                          setBuilder((b) => followEdit(b, groupIndex, ni, null));
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="group-card__add">
        <div className="field">
          <span>Add effect</span>
          <EffectPicker
            index={index}
            testId="group-add-effect"
            onPick={(effect) =>
              addNeed({
                kind: 'effect',
                effect,
                copies: 1,
                colorScope: 'perColor',
                importance: 'normal',
              })
            }
          />
        </div>
      </div>
    </section>
  );
}
