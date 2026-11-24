import { type DragEvent, useId, useState } from 'react';

interface Props {
  label: string;
  hint: string;
  accept: string;
  /** `handle` is set when the browser gave us the file itself (so it can be saved back to). */
  onFile: (file: File, handle?: FileSystemFileHandle) => void;
  testId?: string;
  /**
   * Open with Chrome's file picker (and keep the file's handle) when available, with these types.
   * Drops then also keep the handle. Without it, a plain file input.
   */
  handleTypes?: FilePickerAcceptType[];
}

const isFileHandle = (h: FileSystemHandle | null | undefined): h is FileSystemFileHandle =>
  (h as { kind?: string } | null | undefined)?.kind === 'file';

/** File input + drop zone. Plain <input type=file> keeps it testable and works everywhere. */
export function FileDrop({ label, hint, accept, onFile, testId, handleTypes }: Props) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    // The handle has to be asked for during the drop event itself.
    const pending = handleTypes
      ? event.dataTransfer.items[0]?.getAsFileSystemHandle?.()
      : undefined;
    if (!pending) {
      onFile(file);
      return;
    }
    pending.then(
      (h) => (isFileHandle(h) ? onFile(file, h) : onFile(file)),
      () => onFile(file),
    );
  };

  const pick = async () => {
    try {
      const [handle] =
        (await window.showOpenFilePicker?.(handleTypes ? { types: handleTypes } : {})) ?? [];
      if (handle) onFile(await handle.getFile(), handle);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    }
  };

  return (
    <label
      htmlFor={id}
      className={`file-drop${dragging ? ' file-drop--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <span className="file-drop__label">{label}</span>
      <span className="file-drop__hint">{hint}</span>
      <input
        id={id}
        type="file"
        accept={accept}
        data-testid={testId}
        onClick={(e) => {
          // Chrome's picker gives the file's handle; the plain input stays for other browsers.
          if (!handleTypes || !window.showOpenFilePicker) return;
          e.preventDefault();
          void pick();
        }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}
