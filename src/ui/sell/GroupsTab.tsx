import { useMemo, useRef, useState } from 'react';
import type { CharacterData } from '../../core/builds/characters.ts';
import {
  COMBO_ROLL_LABELS,
  type ComboNeed,
  comboRoll,
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
import { parseRnp, serializeRnp } from '../../core/sell/rnp.ts';
import { isAbortError, RNP_FILE_TYPE, saveTextFile } from '../../storage/files.ts';
import { applyEdit, type Builder, builderFromNeed, followEdit } from './builder.ts';
import { ComboBuilder } from './ComboBuilder.tsx';
import {
  acceptLowerLevels,
  addedMessage,
  addNeeds,
  type ConfigUpdate,
  DEFAULT_GROUP,
  mergeAllGroups,
  moveNeed,
  removeDuplicateNeeds,
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
  LevelSelect,
  ScopeSelect,
} from './controls.tsx';
import { SeedTab } from './SeedTab.tsx';
import {
  clickSelect,
  emptySelection,
  isSelected,
  planNeeds,
  type Selection,
  selectAll,
  selectedIn,
  selectedNeeds,
  selectionAfterMove,
  selectionAfterRemove,
  sharedPlan,
} from './selection.ts';

type SetBuilder = (fn: (b: Builder) => Builder) => void;
type SetSelection = (fn: (s: Selection) => Selection) => void;

export const SHARED_NEEDS_NAME = 'nightreign-shared-needs.rnp';

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
  const duplicates = useMemo(() => removeDuplicateNeeds(config, index).removed, [config, index]);
  const main = Math.max(
    0,
    config.groups.findIndex((g) => g.name === DEFAULT_GROUP),
  );
  const [selection, setSelection] = useState(emptySelection);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const picked = selectedNeeds(config, selection);
  const importInput = useRef<HTMLInputElement>(null);

  const exportSelected = async () => {
    try {
      const handle = await saveTextFile(
        serializeRnp(sharedPlan(picked)),
        SHARED_NEEDS_NAME,
        RNP_FILE_TYPE,
      );
      setShareMessage(
        `Exported ${picked.length} need${picked.length === 1 ? '' : 's'} to ${handle?.name ?? SHARED_NEEDS_NAME}.`,
      );
    } catch (err) {
      if (!isAbortError(err)) setShareMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  const importFrom = async (file: File) => {
    try {
      // As the sharer set them (no default levels added), so identical needs are found.
      const needs = planNeeds(parseRnp(await file.text()).config);
      let result = { added: 0, updated: 0, duplicates: 0 };
      update((c) => {
        const r = addNeeds(c, needs, index);
        result = r;
        return r.config;
      });
      setShareMessage(`From ${file.name}: ${addedMessage(result)}`);
    } catch (err) {
      setShareMessage(`Could not import ${file.name}: ${(err as Error).message}`);
    }
  };

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
          data-testid="remove-duplicates"
          disabled={duplicates === 0}
          title="Needs listed more than once (same effects, levels, colors and relic kind): keep one, with the most copies and the highest importance"
          onClick={() => {
            update((c) => removeDuplicateNeeds(c, index).config);
            setSelection(emptySelection);
          }}
        >
          {duplicates === 0
            ? 'No duplicates'
            : `Remove ${duplicates} duplicate${duplicates === 1 ? '' : 's'}`}
        </button>
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
      <div className="toolbar" data-testid="share-bar">
        <span className="muted">
          Share: tick needs (Shift-click ticks a range) to export them; importing skips needs you
          have.
        </span>
        <div className="toolbar__spacer" />
        <button
          type="button"
          data-testid="needs-export"
          disabled={picked.length === 0}
          onClick={() => void exportSelected()}
        >
          {picked.length === 0 ? 'Export selected…' : `Export ${picked.length} selected…`}
        </button>
        {picked.length > 0 && (
          <button
            type="button"
            className="button--quiet"
            data-testid="needs-select-none"
            onClick={() => setSelection(emptySelection)}
          >
            Clear selection
          </button>
        )}
        <button
          type="button"
          className="button--quiet"
          data-testid="needs-import"
          title="Add the needs of another .rnp to this plan"
          onClick={() => importInput.current?.click()}
        >
          Import needs…
        </button>
        <input
          ref={importInput}
          type="file"
          hidden
          accept=".rnp,.rsp,.json,application/json"
          data-testid="needs-import-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFrom(file);
            e.target.value = '';
          }}
        />
      </div>
      {shareMessage && (
        <p className="message" data-testid="share-message">
          {shareMessage}
        </p>
      )}
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
            onClick={() => {
              update((c) => mergeAllGroups(c));
              setSelection(emptySelection);
            }}
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
            selection={selection}
            setSelection={setSelection}
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
          selection={selection}
          setSelection={setSelection}
        />
      )}
      <section className="group-card">
        <ComboBuilder
          builder={builder}
          setBuilder={setBuilder}
          index={index}
          existing={config.groups.flatMap((g, gi) =>
            g.name === DEFAULT_GROUP
              ? g.needs.filter(
                  (_, ni) => !(builder.editing?.group === gi && builder.editing.need === ni),
                )
              : [],
          )}
          onSubmit={(drafts) =>
            update((c) => {
              const at = builder.editing;
              const old = at && c.groups[at.group]?.needs[at.need];
              let rest = drafts;
              let next = c;
              if (at && old && drafts[0]) {
                // Editing: the first replaces the need, any others (permutations) are added.
                const first = drafts[0];
                next = updateNeed(c, at.group, at.need, (n) =>
                  withDefaultLevels(applyEdit(n, first), index),
                );
                rest = drafts.slice(1);
              }
              // New needs go to the one list (merged with identical needs already there).
              return addNeeds(
                next,
                rest.map((d) => withDefaultLevels(d, index)),
                index,
              ).config;
            })
          }
        />
      </section>
    </div>
  );
}

/** Lowest level that counts, for effects with several levels ("+1 or higher"). */
/** Edit a need in the builder (Save puts it back), or copy it there to add variants. */
function NeedActions({
  need,
  at,
  setBuilder,
}: {
  need: Need;
  at: { group: number; need: number };
  setBuilder: SetBuilder;
}) {
  return (
    <div className="combo__actions">
      <button
        type="button"
        className="button--quiet"
        data-testid="combo-edit"
        title="Edit in the builder; Save puts it back here"
        onClick={() => setBuilder((b) => builderFromNeed(need, at, b.focus + 1))}
      >
        Edit
      </button>
      <button
        type="button"
        className="button--quiet"
        data-testid="combo-copy"
        title="Put its effects in the builder, to add variants (e.g. turn it into a combo)"
        onClick={() => setBuilder((b) => builderFromNeed(need, null, b.focus + 1))}
      >
        Copy to builder
      </button>
    </div>
  );
}

/** "Combo · good roll" (2 slots) / "Combo · godroll" (3): what the owner calls such relics. */
function rollTag(need: ComboNeed): string {
  const roll = comboRoll(need);
  return roll ? `Combo · ${COMBO_ROLL_LABELS[roll]}` : 'Combo';
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
  const core = need.core?.includes(id) ?? false;
  return (
    <div className="combo__member">
      <button
        type="button"
        className={`chip__core${core ? ' chip__core--on' : ''}`}
        data-testid="member-core"
        aria-pressed={core}
        title="Needed in stand-ins: while copies are missing, a relic with only some of the combo's effects counts only if it has this one"
        onClick={() =>
          edit((n) => {
            if (n.kind !== 'combo') return n;
            const others = (n.core ?? []).filter((x) => x !== id);
            const { core: _old, ...rest } = n;
            const next = core ? others : [...others, id];
            return next.length ? { ...rest, core: next } : rest;
          })
        }
      >
        {core ? '★' : '☆'}
      </button>
      <EffectName meta={index.meta(id)} id={id} />
      <LevelSelect
        index={index}
        id={id}
        value={need.minLevels?.[id]}
        exact={need.exactLevels?.includes(id) ?? false}
        onChange={(level, exact) =>
          edit((n) => {
            if (n.kind !== 'combo') return n;
            const others = (n.exactLevels ?? []).filter((x) => x !== id);
            const exactLevels = exact ? [...others, id] : others;
            const { exactLevels: _old, ...rest } = n;
            return {
              ...rest,
              minLevels: { ...n.minLevels, [id]: level },
              ...(exactLevels.length ? { exactLevels } : {}),
              // Lower levels may live on the other kind of relic.
              relics: n.relics ?? 'any',
            };
          })
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
  selection,
  setSelection,
}: Props & {
  groupIndex: number;
  named: boolean;
  setBuilder: SetBuilder;
  selection: Selection;
  setSelection: SetSelection;
}) {
  const group = config.groups[groupIndex] ?? { name: DEFAULT_GROUP, needs: [] };
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const setNeed = (ni: number, patch: Partial<Need> | null) =>
    update((c) =>
      updateNeed(c, groupIndex, ni, patch === null ? null : (n) => ({ ...n, ...patch }) as Need),
    );
  // New needs go to the one list (merged with an identical need if there is one).
  const addNeed = (need: Need) =>
    update((c) => addNeeds(c, [withDefaultLevels(need, index)], index).config);
  const ticked = selectedIn(selection, groupIndex);
  const allTicked = group.needs.length > 0 && ticked === group.needs.length;

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
                <th>
                  <input
                    type="checkbox"
                    data-testid="need-select-all"
                    aria-label="Select all needs"
                    checked={allTicked}
                    ref={(el) => {
                      if (el) el.indeterminate = ticked > 0 && !allTicked;
                    }}
                    onChange={(e) =>
                      setSelection((s) =>
                        selectAll(s, groupIndex, group.needs.length, e.target.checked),
                      )
                    }
                  />
                </th>
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
                        setSelection((s) => selectionAfterMove(s, groupIndex, from, ni));
                      }
                      setDragging(null);
                      setDropAt(null);
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        data-testid="need-select"
                        aria-label="Select for export"
                        checked={isSelected(selection, groupIndex, ni)}
                        // Click (not change) to see Shift; the state comes from the selection.
                        onChange={() => {}}
                        onClick={(e) =>
                          setSelection((s) => clickSelect(s, groupIndex, ni, e.shiftKey))
                        }
                      />
                    </td>
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
                        <div className="combo">
                          <EffectName meta={meta} id={need.effect} />
                          <NeedActions
                            need={need}
                            at={{ group: groupIndex, need: ni }}
                            setBuilder={setBuilder}
                          />
                        </div>
                      ) : (
                        <div className="combo">
                          <span className="combo__tag" data-testid="combo-roll">
                            {rollTag(need)}
                          </span>
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
                          <NeedActions
                            need={need}
                            at={{ group: groupIndex, need: ni }}
                            setBuilder={setBuilder}
                          />
                        </div>
                      )}
                    </td>
                    <td>
                      {need.kind === 'effect' && (
                        <LevelSelect
                          index={index}
                          id={need.effect}
                          value={need.minLevel}
                          exact={need.exactLevel === true}
                          onChange={(minLevel, exact) =>
                            update((c) =>
                              updateNeed(c, groupIndex, ni, (n) => {
                                if (n.kind !== 'effect') return n;
                                const { exactLevel: _old, ...rest } = n;
                                return {
                                  ...rest,
                                  minLevel,
                                  ...(exact ? { exactLevel: true } : {}),
                                };
                              }),
                            )
                          }
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
                        data-testid="need-remove"
                        onClick={() => {
                          setNeed(ni, null);
                          setBuilder((b) => followEdit(b, groupIndex, ni, null));
                          setSelection((s) => selectionAfterRemove(s, groupIndex, ni));
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
