import { type DragEvent, useEffect, useRef, useState } from 'react';
import type { ComboNeed } from '../../core/sell/config.ts';
import type { EffectIndex } from '../../core/sell/effects.ts';
import {
  addEffect,
  type Builder,
  builderDraft,
  emptyBuilder,
  moveEffect,
  type Place,
  removeEffect,
} from './builder.ts';
import { EffectPicker } from './controls.tsx';

const DRAG_TYPE = 'application/x-buildrocket-effect';

interface Props {
  builder: Builder;
  setBuilder: (fn: (b: Builder) => Builder) => void;
  index: EffectIndex;
  /** Add the combo (or save it over the one being edited). */
  onSubmit: (draft: ComboNeed) => void;
}

/**
 * Builds a combo: effects the relic must all have, and "any of" slots any one of whose effects
 * counts. Effects can be dragged between rows. Enter on an empty field adds the combo.
 */
export function ComboBuilder({ builder, setBuilder, index, onSubmit }: Props) {
  const allInput = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState<Place | null>(null);
  const draft = builderDraft(builder);
  const editing = builder.editing !== null;

  // Filled from another tab or a combo's Edit button: show it and get ready to type.
  useEffect(() => {
    if (builder.focus === 0) return;
    section.current?.scrollIntoView({ block: 'center' });
    allInput.current?.focus();
  }, [builder.focus]);

  const submit = () => {
    if (!draft) return;
    onSubmit(draft);
    setBuilder((b) => emptyBuilder(b.focus));
    allInput.current?.focus();
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

  const options = builder.anyOf.reduce((n, s) => n * Math.max(1, s.length), 1);
  return (
    <div className="field combo-builder" ref={section} data-testid="combo-builder">
      <span>
        {editing ? 'Editing combo' : 'Combo (same relic)'}
        <span className="muted"> · drag effects between rows</span>
      </span>
      <div className="combo-builder__row" data-testid="builder-all" {...dropProps('all')}>
        <span className="muted combo-builder__label">All of</span>
        {builder.all.map((id) => chip(id, 'all'))}
        <EffectPicker
          index={index}
          placeholder="Add an effect to the combo…"
          testId="group-combo-effect"
          inputRef={allInput}
          onEnter={submit}
          onPick={(id) => setBuilder((b) => addEffect(b, id, 'all'))}
        />
      </div>
      {builder.anyOf.map((slot, si) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
          key={si}
          className="combo-builder__row combo-builder__row--any"
          data-testid="builder-any"
          {...dropProps(si)}
        >
          <span className="muted combo-builder__label">+ any one of</span>
          {slot.map((id) => chip(id, si))}
          <EffectPicker
            index={index}
            placeholder="Add an alternative…"
            testId="group-combo-any"
            onEnter={submit}
            onPick={(id) => setBuilder((b) => addEffect(b, id, si))}
          />
          <button
            type="button"
            className="button--quiet"
            title="Remove this slot"
            onClick={() => setBuilder((b) => ({ ...b, anyOf: b.anyOf.filter((_, i) => i !== si) }))}
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
          {...dropProps('newSlot')}
        >
          + "any of" slot
        </button>
        {draft && options > 1 && (
          <span className="muted">{options} pairings, counted together</span>
        )}
        <div className="toolbar__spacer" />
        <button
          type="button"
          className="button--quiet"
          data-testid="builder-clear"
          disabled={!editing && builder.all.length === 0 && builder.anyOf.length === 0}
          onClick={() => setBuilder((b) => emptyBuilder(b.focus))}
        >
          {editing ? 'Cancel edit' : 'Clear builder'}
        </button>
        <button type="button" disabled={!draft} data-testid="group-combo-add" onClick={submit}>
          {editing ? 'Save combo' : 'Add combo'}
        </button>
      </div>
    </div>
  );
}
