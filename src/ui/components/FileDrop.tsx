import { type DragEvent, useId, useState } from 'react';

interface Props {
  label: string;
  hint: string;
  accept: string;
  onFile: (file: File) => void;
  testId?: string;
}

/** File input + drop zone. Plain <input type=file> keeps it testable and works everywhere. */
export function FileDrop({ label, hint, accept, onFile, testId }: Props) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
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
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}
