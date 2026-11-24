import { useId, useState } from 'react';
import { isAbortError, SAVE_OR_BUILDS_ACCEPT } from '../../storage/files.ts';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { usePrimarySource } from '../useLoadedFile.ts';
import { exportBuildsFile } from './exportBuilds.ts';

/**
 * The Primary Save File, always in the header: drop (or click to open) a save or a builds file
 * (.jsl2), pick the character, export it as .jsl2. Every page uses it.
 */
export function PrimaryBar() {
  const source = usePrimarySource();
  const { state, characters, selected, select } = source;
  const id = useId();
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const open = (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    void source.load(file);
  };

  const exportSelected = async () => {
    if (!selected) return;
    try {
      const n = await exportBuildsFile([selected], selected.label);
      setMessage(`Exported ${n} builds.`);
    } catch (err) {
      if (!isAbortError(err)) setMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="file-bar" data-testid="primary-bar">
      <label
        htmlFor={id}
        className={`file-bar__drop${over ? ' file-bar__drop--over' : ''}`}
        title="Drop a save (NR0000.sl2 / .co2) or a builds file (.jsl2) here, or click to open one"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          open(e.dataTransfer.files[0]);
        }}
      >
        <span className="file-bar__kind">Primary Save File</span>
        <span
          className="file-bar__name"
          data-testid="primary-status"
          role="status"
          title={state.status === 'idle' ? undefined : state.fileName}
        >
          {state.status === 'idle' && 'None: drop a save or .jsl2, or click'}
          {state.status === 'loading' && <ProgressBar label={`Reading ${state.fileName}…`} />}
          {state.status === 'error' && (
            <span className="error">
              {state.fileName}: {state.message}
            </span>
          )}
          {state.status === 'loaded' && (
            <>
              {state.fileName}{' '}
              <span className="muted">
                ({state.file.kind === 'save' ? 'save' : 'builds file'}): {characters.length}{' '}
                character(s) ({Math.round(state.ms)} ms)
              </span>
              {state.file.checksumMismatches.length > 0 && (
                <span className="error"> Warning: this save looks corrupted.</span>
              )}
            </>
          )}
        </span>
        <input
          id={id}
          type="file"
          accept={SAVE_OR_BUILDS_ACCEPT}
          data-testid="primary-input"
          onChange={(e) => {
            open(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {selected && (
        <select
          aria-label="Character"
          data-testid="primary-character"
          value={selected.key}
          onChange={(e) => select(e.target.value)}
        >
          {characters.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} · {c.builds.length} builds
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="button--quiet"
        disabled={!selected}
        onClick={() => void exportSelected()}
        data-testid="primary-export"
        title="Save this character's builds and relics as a .jsl2 file (opens anywhere a save does)"
      >
        Export .jsl2
      </button>
      {message && (
        <span className="message file-bar__message" data-testid="primary-message">
          {message}
        </span>
      )}
    </div>
  );
}
