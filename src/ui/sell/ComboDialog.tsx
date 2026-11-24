import { useEffect, useRef } from 'react';
import type { ComboNeed } from '../../core/sell/config.ts';
import type { EffectIndex } from '../../core/sell/effects.ts';
import type { Builder } from './builder.ts';
import { ComboBuilder } from './ComboBuilder.tsx';

interface Props {
  /** The builder to show, or null when closed. */
  builder: Builder | null;
  setBuilder: (fn: (b: Builder) => Builder) => void;
  index: EffectIndex;
  /** Add the combo to the plan (the dialog then closes). */
  onSubmit: (draft: ComboNeed) => void;
  onClose: () => void;
  testId?: string;
}

/** The combo builder in a popup, so the page behind (the results) keeps its place. */
export function ComboDialog({
  builder,
  setBuilder,
  index,
  onSubmit,
  onClose,
  testId = 'combo-dialog',
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = builder !== null;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Ready to type (the builder's own focus ran before the dialog opened).
      d.querySelector<HTMLInputElement>('.effect-picker')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    // Backdrop clicks close it; the keyboard way is Esc (the dialog's cancel event).
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled by onCancel
    <dialog
      ref={dialog}
      className="combo-dialog"
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop (outside the content) closes it.
        if (e.target === dialog.current) onClose();
      }}
    >
      {builder && (
        <div className="combo-dialog__body">
          <header className="combo-dialog__header">
            <h2>Add a combo</h2>
            <button
              type="button"
              className="button--quiet"
              data-testid="combo-dialog-close"
              title="Close (Esc)"
              onClick={onClose}
            >
              ×
            </button>
          </header>
          <ComboBuilder
            builder={builder}
            setBuilder={setBuilder}
            index={index}
            scroll={false}
            onSubmit={onSubmit}
          />
          <p className="muted">
            It's added to Needs &amp; combos as Must keep, 1 per color; change that there.
          </p>
        </div>
      )}
    </dialog>
  );
}
