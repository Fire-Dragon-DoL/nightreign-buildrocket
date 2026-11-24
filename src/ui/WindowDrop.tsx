import { type DragEvent as ReactDragEvent, useEffect, useRef, useState } from 'react';
import { draggingTwoFiles, pairOfFiles } from './dropPair.ts';
import { openPlan } from './plan/planStore.ts';
import { primarySource } from './useLoadedFile.ts';

const isFileHandle = (h: FileSystemHandle | null | undefined): h is FileSystemFileHandle =>
  (h as { kind?: string } | null | undefined)?.kind === 'file';

/**
 * Drag a save (or .jsl2) and a plan (.rnp) together anywhere on the page: a page-wide drop zone
 * appears (only for two files) and loads each into the header (Primary Save File, Relic Needs Plan).
 */
export function WindowDrop() {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const depth = useRef(0);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!draggingTwoFiles(e.dataTransfer)) return;
      depth.current++;
      setActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!draggingTwoFiles(e.dataTransfer)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const onEnd = () => {
      depth.current = 0;
      setActive(false);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onEnd);
    window.addEventListener('dragend', onEnd);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onEnd);
      window.removeEventListener('dragend', onEnd);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setActive(false);
    const files = Array.from(e.dataTransfer.files);
    const pair = pairOfFiles(files.map((f) => f.name));
    if (!pair) {
      setMessage({
        text: `Not loaded: drop one plan (.rnp) and one save (.sl2 / .co2) or builds file (.jsl2) together. Got ${files.map((f) => f.name).join(' and ')}.`,
        error: true,
      });
      return;
    }
    const save = files[pair.save] as File;
    const plan = files[pair.plan] as File;
    // The plan's handle (so Save writes back to it) has to be asked for during the drop event.
    const pending = e.dataTransfer.items[pair.plan]?.getAsFileSystemHandle?.();
    void primarySource.get().load(save);
    const open = (handle?: FileSystemFileHandle) => void openPlan(plan, handle);
    if (pending)
      pending.then(
        (h) => open(isFileHandle(h) ? h : undefined),
        () => open(),
      );
    else open();
    setMessage({ text: `Loading ${save.name} and ${plan.name}.`, error: false });
  };

  return (
    <>
      {active && (
        // A drop target only: the header's drop zones open the same files by click or keyboard.
        // biome-ignore lint/a11y/noStaticElementInteractions: drop target
        <div
          className="window-drop"
          data-testid="window-drop"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={onDrop}
        >
          <div className="window-drop__box">
            <b>Drop to load both</b>
            <span>
              The save (.sl2 / .co2) or builds file (.jsl2) goes to Primary Save File, the plan
              (.rnp) to Relic Needs Plan.
            </span>
          </div>
        </div>
      )}
      {message && (
        <div
          className={`window-drop__toast${message.error ? ' window-drop__toast--error' : ''}`}
          role="status"
          data-testid="window-drop-message"
        >
          {message.text}
        </div>
      )}
    </>
  );
}
