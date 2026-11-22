import { useRef, useState } from 'react';
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
import {
  acceptLowerLevels,
  addNeeds,
  type ConfigUpdate,
  DEFAULT_GROUP,
  mergeAllGroups,
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
}: Props & { character: CharacterData | undefined }) {
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
          // biome-ignore lint/suspicious/noArrayIndexKey: groups have no id
          <GroupCard key={gi} config={config} update={update} index={index} groupIndex={gi} named />
        ))
      ) : (
        <GroupCard config={config} update={update} index={index} groupIndex={main} named={false} />
      )}
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

/** The combo the builder would add, or null if it needs more (2+ slots, no empty slot). */
function comboDraft(effects: number[], slots: number[][]): ComboNeed | null {
  const filled = slots.filter((s) => s.length > 0);
  // A one-option slot is just another required effect.
  const required = [...effects, ...filled.filter((s) => s.length === 1).flat()];
  const anyOf = filled.filter((s) => s.length > 1);
  if (required.length + anyOf.length < 2) return null;
  const need: ComboNeed = {
    kind: 'combo',
    effects: [...new Set(required)],
    copies: 1,
    colorScope: 'perColor',
    importance: 'mustKeep',
    relics: 'any',
  };
  if (anyOf.length) need.anyOf = anyOf;
  return need;
}

function comboPreview(index: EffectIndex, need: ComboNeed): string {
  const name = (id: number) => index.meta(id)?.name ?? String(id);
  const options = (need.anyOf ?? []).reduce((n, s) => n * s.length, 1);
  return options > 1 ? `${options} pairings, counted together` : need.effects.map(name).join(' + ');
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
}: Props & { groupIndex: number; named: boolean }) {
  const group = config.groups[groupIndex] ?? { name: DEFAULT_GROUP, needs: [] };
  const [combo, setCombo] = useState<number[]>([]);
  const [slots, setSlots] = useState<number[][]>([]);
  const comboInput = useRef<HTMLInputElement>(null);
  const draft = comboDraft(combo, slots);
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
                  // biome-ignore lint/suspicious/noArrayIndexKey: needs have no id
                  <tr key={ni} data-testid="need-row">
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
                          <button
                            type="button"
                            className="button--quiet combo__copy"
                            data-testid="combo-copy"
                            title="Put this combo's effects in the builder below, to add a variant"
                            onClick={() => {
                              setCombo(need.effects);
                              setSlots(need.anyOf?.map((slot) => [...slot]) ?? []);
                              comboInput.current?.focus();
                            }}
                          >
                            Copy to builder
                          </button>
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
                        onClick={() => setNeed(ni, null)}
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
        <div className="field combo-builder">
          <span>Combo (same relic)</span>
          <div className="combo-builder__row">
            <span className="muted">All of</span>
            {combo.map((id) => (
              <button
                key={id}
                type="button"
                className="button--quiet chip"
                title="Remove"
                onClick={() => setCombo(combo.filter((x) => x !== id))}
              >
                {index.meta(id)?.name ?? id} ×
              </button>
            ))}
            <EffectPicker
              index={index}
              placeholder="Add an effect to the combo…"
              testId="group-combo-effect"
              inputRef={comboInput}
              onPick={(id) => !combo.includes(id) && setCombo([...combo, id])}
            />
          </div>
          {slots.map((slot, si) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
            <div key={si} className="combo-builder__row">
              <span className="muted">+ any one of</span>
              {slot.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="button--quiet chip"
                  title="Remove"
                  onClick={() =>
                    setSlots(slots.map((s, i) => (i === si ? s.filter((x) => x !== id) : s)))
                  }
                >
                  {index.meta(id)?.name ?? id} ×
                </button>
              ))}
              <EffectPicker
                index={index}
                placeholder="Add an alternative…"
                testId="group-combo-any"
                onPick={(id) =>
                  !slot.includes(id) && setSlots(slots.map((s, i) => (i === si ? [...s, id] : s)))
                }
              />
              <button
                type="button"
                className="button--quiet"
                title="Remove this slot"
                onClick={() => setSlots(slots.filter((_, i) => i !== si))}
              >
                ×
              </button>
            </div>
          ))}
          <div className="combo-builder__row">
            <button
              type="button"
              className="button--quiet"
              data-testid="group-combo-any-add"
              title="A slot any one of several effects can fill: they all count toward the same copies"
              onClick={() => setSlots([...slots, []])}
            >
              + "any of" slot
            </button>
            {draft && <span className="muted">{comboPreview(index, draft)}</span>}
            <button
              type="button"
              disabled={!draft}
              data-testid="group-combo-add"
              onClick={() => {
                if (!draft) return;
                addNeed(draft);
                setCombo([]);
                setSlots([]);
                // Ready for the next combo.
                comboInput.current?.focus();
              }}
            >
              Add combo
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
