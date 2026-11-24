import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { comboRoll, type Need } from '../../core/sell/config.ts';
import type { EffectIndex } from '../../core/sell/effects.ts';
import {
  addEffect,
  type Builder,
  builderDrafts,
  draftLabel,
  emptyBuilder,
  moveEffect,
  type Place,
  removeEffect,
} from './builder.ts';
import { CopiesInput, EffectPicker, ImportanceSelect, ScopeSelect } from './controls.tsx';

const DRAG_TYPE = 'application/x-buildrocket-effect';

const ROLL = { godroll: 'godroll', goodRoll: 'good roll' } as const;

/** "1 combo (good roll)", "6 combos (good rolls)", "1 single effect"… */
function previewTitle(drafts: Need[]): string {
  const rolls = new Set(drafts.map((d) => (d.kind === 'combo' ? comboRoll(d) : 'single')));
  const [only] = rolls;
  if (drafts.length === 1) {
    if (only === 'single') return '1 single effect';
    return `1 combo${only ? ` (${ROLL[only]})` : ''}`;
  }
  const kind = rolls.size === 1 && only && only !== 'single' ? ` (${ROLL[only]}s)` : '';
  return `${drafts.length} combos${kind}`;
}
/** Preview lines shown before "and N more". */
const PREVIEW = 8;

interface Props {
  builder: Builder;
  setBuilder: (fn: (b: Builder) => Builder) => void;
  index: EffectIndex;
  /** Add the needs (when editing, the first replaces the one being edited). */
  onSubmit: (drafts: Need[]) => void;
  /** Scroll into view when filled from elsewhere (off in a popup). */
  scroll?: boolean;
}

/**
 * Builds needs: effects the relic must all have, "any of" slots (any option counts toward the same
 * copies), and permutation columns (a separate need per combination of picks). Effects can be
 * dragged between rows. Enter on an empty field adds them.
 */
export function ComboBuilder({ builder, setBuilder, index, onSubmit, scroll = true }: Props) {
  const allInput = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState<Place | null>(null);
  const drafts = useMemo(() => builderDrafts(builder, index), [builder, index]);
  const editing = builder.editing !== null;
  const empty = builder.all.length + builder.anyOf.length + builder.perms.length === 0;

  // Filled from another tab or a combo's Edit button: show it and get ready to type.
  useEffect(() => {
    if (builder.focus === 0) return;
    if (scroll) section.current?.scrollIntoView({ block: 'center' });
    allInput.current?.focus({ preventScroll: true });
  }, [builder.focus, scroll]);

  const submit = () => {
    if (drafts.length === 0) return;
    onSubmit(drafts);
    // Keep the settings for the next ones.
    setBuilder((b) => emptyBuilder(b.focus, b.settings));
    allInput.current?.focus({ preventScroll: true });
  };

  const dropProps = (place: Place) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOver(place);
    },
    onDragLeave: () => setOver((o) => (o === place ? null : o)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const data = e.dataTransfer.getData(DRAG_TYPE);
      if (!data) return;
      const { id, from } = JSON.parse(data) as { id: number; from: Place };
      setBuilder((b) => moveEffect(b, id, from, place));
    },
    'data-over': over === place ? 'true' : undefined,
  });

  const chip = (id: number, from: Place) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag source; the × button removes it
    <span
      key={id}
      className="chip chip--drag"
      draggable
      data-testid="builder-chip"
      title="Drag to another row"
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id, from }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => setOver(null)}
    >
      {index.meta(id)?.name ?? id}
      <button
        type="button"
        className="chip__remove"
        title="Remove"
        onClick={() => setBuilder((b) => removeEffect(b, id, from))}
      >
        ×
      </button>
    </span>
  );

  const removeRow = (kind: 'anyOf' | 'perms', i: number) =>
    setBuilder((b) => ({ ...b, [kind]: b[kind].filter((_, j) => j !== i) }));

  const settings = builder.settings;
  const setSettings = (patch: Partial<typeof settings>) =>
    setBuilder((b) => ({ ...b, settings: { ...b.settings, ...patch } }));

  const count = drafts.length;
  const action = editing
    ? count > 1
      ? `Save + add ${count - 1}`
      : 'Save'
    : count === 1
      ? drafts[0]?.kind === 'effect'
        ? 'Add effect'
        : 'Add combo'
      : `Add ${count} combos`;

  return (
    <div className="field combo-builder" ref={section} data-testid="combo-builder">
      <span>
        {editing ? 'Editing' : 'Combo builder'}
        <span className="muted"> · same relic · drag effects between rows</span>
      </span>
      <div className="combo-builder__row" data-testid="builder-all" {...dropProps('all')}>
        <span className="muted combo-builder__label">All of</span>
        {builder.all.map((id) => chip(id, 'all'))}
        <EffectPicker
          index={index}
          placeholder="Add an effect…"
          testId="group-combo-effect"
          inputRef={allInput}
          onEnter={submit}
          onPick={(id) => setBuilder((b) => addEffect(b, id, 'all'))}
        />
      </div>
      {builder.anyOf.map((slot, si) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
          key={`any${si}`}
          className="combo-builder__row combo-builder__row--any"
          data-testid="builder-any"
          {...dropProps(`any:${si}`)}
        >
          <span
            className="muted combo-builder__label"
            title="Any one of these fills the slot; they share the same copies"
          >
            + any one of
          </span>
          {slot.map((id) => chip(id, `any:${si}`))}
          <EffectPicker
            index={index}
            placeholder="Add an alternative…"
            testId="group-combo-any"
            onEnter={submit}
            onPick={(id) => setBuilder((b) => addEffect(b, id, `any:${si}`))}
          />
          <button
            type="button"
            className="button--quiet"
            title="Remove this slot"
            onClick={() => removeRow('anyOf', si)}
          >
            ×
          </button>
        </div>
      ))}
      {builder.perms.map((column, ci) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
          key={`perm${ci}`}
          className="combo-builder__row combo-builder__row--perm"
          data-testid="builder-perm"
          {...dropProps(`perm:${ci}`)}
        >
          <span
            className="muted combo-builder__label"
            title="A separate combo for each of these (several levels of one effect: each counts that level only)"
          >
            + permutations of
          </span>
          {column.map((id) => chip(id, `perm:${ci}`))}
          <EffectPicker
            index={index}
            placeholder="Add a permutation…"
            testId="group-combo-perm"
            onEnter={submit}
            onPick={(id) => setBuilder((b) => addEffect(b, id, `perm:${ci}`))}
          />
          <button
            type="button"
            className="button--quiet"
            title="Remove this column"
            onClick={() => removeRow('perms', ci)}
          >
            ×
          </button>
        </div>
      ))}
      <div className="combo-builder__row">
        <button
          type="button"
          className="button--quiet combo-builder__new-slot"
          data-testid="group-combo-any-add"
          title="A slot any one of several effects can fill: they all count toward the same copies. Drop an effect here to start one."
          onClick={() => setBuilder((b) => ({ ...b, anyOf: [...b.anyOf, []] }))}
          {...dropProps('newAny')}
        >
          + "any of" slot
        </button>
        <button
          type="button"
          className="button--quiet combo-builder__new-slot"
          data-testid="group-combo-perm-add"
          title="Permutations: a separate combo for each effect in it (and for every combination with other permutation rows). Drop an effect here to start one."
          onClick={() => setBuilder((b) => ({ ...b, perms: [...b.perms, []] }))}
          {...dropProps('newPerm')}
        >
          + permutations
        </button>
      </div>
      <div className="combo-builder__row combo-builder__settings">
        <span className="muted">Each gets</span>
        <CopiesInput
          value={settings.copies}
          onChange={(copies) => setSettings({ copies })}
          testId="builder-copies"
        />
        <ScopeSelect
          value={settings.colorScope}
          onChange={(colorScope) => setSettings({ colorScope })}
        />
        <ImportanceSelect
          value={settings.importance}
          onChange={(importance) => importance && setSettings({ importance })}
          testId="builder-importance"
        />
      </div>
      {count > 0 && (
        <div className="combo-builder__preview" data-testid="builder-preview">
          <b data-testid="builder-count">{previewTitle(drafts)}</b>
          <ul>
            {drafts.slice(0, PREVIEW).map((d) => {
              const label = draftLabel(d, index);
              return <li key={label}>{label}</li>;
            })}
            {count > PREVIEW && <li className="muted">… and {count - PREVIEW} more</li>}
          </ul>
        </div>
      )}
      <div className="combo-builder__row">
        <div className="toolbar__spacer" />
        <button
          type="button"
          className="button--quiet"
          data-testid="builder-clear"
          disabled={!editing && empty}
          onClick={() => setBuilder((b) => emptyBuilder(b.focus, b.settings))}
        >
          {editing ? 'Cancel edit' : 'Clear builder'}
        </button>
        <button type="button" disabled={count === 0} data-testid="group-combo-add" onClick={submit}>
          {action}
        </button>
      </div>
    </div>
  );
}
