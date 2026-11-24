import { useId, useState } from 'react';
import { PLAN_OPEN_TYPE } from '../../storage/files.ts';
import { canSaveInPlace, saveTargetText } from './planFile.ts';
import { needCount, newPlan, openPlan, saveCurrentPlan, usePlan } from './planStore.ts';

const isFileHandle = (h: FileSystemHandle | null | undefined): h is FileSystemFileHandle =>
  (h as { kind?: string } | null | undefined)?.kind === 'file';

/**
 * The open plan, always in the header: its file, Save / Save as / New, and a drop zone (or click)
 * to open another .rnp.
 */
export function PlanBar() {
  const plan = usePlan();
  const id = useId();
  const [over, setOver] = useState(false);
  const inPlace = canSaveInPlace();

  const pick = async () => {
    try {
      const [handle] = (await window.showOpenFilePicker?.({ types: [PLAN_OPEN_TYPE] })) ?? [];
      if (handle) await openPlan(await handle.getFile(), handle);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    }
  };

  return (
    <div className="plan-bar" data-testid="plan-bar">
      <label
        htmlFor={id}
        className={`plan-bar__drop${over ? ' plan-bar__drop--over' : ''}`}
        title="Drop a .rnp (or older .rsp) plan here, or click to open one"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (!file) return;
          // The handle has to be asked for during the drop event itself.
          const pending = e.dataTransfer.items[0]?.getAsFileSystemHandle?.();
          if (!pending) {
            void openPlan(file);
            return;
          }
          pending.then(
            (h) => void (isFileHandle(h) ? openPlan(file, h) : openPlan(file)),
            () => void openPlan(file),
          );
        }}
      >
        <span className="plan-bar__kind">Relic Needs Plan</span>
        <span className="plan-bar__name" data-testid="rnp-status">
          {plan.file ? plan.file.name : 'Unsaved plan'}
          {plan.dirty ? ' (changed)' : ''} · {needCount(plan.config)} need(s)
        </span>
        <input
          id={id}
          type="file"
          accept=".rnp,.rsp,.json,application/json"
          data-testid="rnp-input"
          onClick={(e) => {
            // Chrome's picker gives the file's handle, so Save can write back to it.
            if (!window.showOpenFilePicker) return;
            e.preventDefault();
            void pick();
          }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openPlan(file);
            e.target.value = '';
          }}
        />
      </label>
      {inPlace && (
        <button
          type="button"
          className="plan-bar__save"
          onClick={() => void saveCurrentPlan(false)}
          data-testid="rnp-save"
          title={saveTargetText(plan.file)}
          aria-label="Save plan"
        >
          💾 Save
        </button>
      )}
      <button
        type="button"
        className={inPlace ? 'button--quiet' : undefined}
        onClick={() => void saveCurrentPlan(true)}
        data-testid="rnp-save-as"
      >
        Save as…
      </button>
      <button type="button" className="button--quiet" onClick={newPlan} data-testid="rnp-new">
        New
      </button>
      <div className="plan-bar__status">
        <span className="muted" data-testid="rnp-target">
          {saveTargetText(plan.file)}
        </span>
        {plan.message && (
          <span className="message" data-testid="rnp-message">
            {plan.message}
          </span>
        )}
      </div>
    </div>
  );
}
