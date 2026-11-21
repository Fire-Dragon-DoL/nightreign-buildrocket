import type { FileSource } from '../useLoadedFile.ts';
import { FileDrop } from './FileDrop.tsx';
import { ProgressBar } from './ProgressBar.tsx';

interface Props {
  source: FileSource;
  label: string;
  /** Prefix for test ids: `<id>-input`, `<id>-status`, `<id>-character`. */
  testId: string;
  /** Called before a new file starts loading. */
  onNewFile?: () => void;
}

const HINT =
  'A save (NR0000.sl2 / NR0000.co2, in %APPDATA%\\Nightreign\\<steam id>) or a builds JSON exported from this tool';

/**
 * Open a save or a builds JSON (either works), then pick one of its
 * characters. Used by every page, so both file kinds work everywhere.
 */
export function FileSourcePicker({ source, label, testId, onNewFile }: Props) {
  const { state, characters, selected, select } = source;
  return (
    <div className="file-source">
      <FileDrop
        label={label}
        hint={HINT}
        accept=".sl2,.co2,.json,application/json"
        onFile={(file) => {
          onNewFile?.();
          void source.load(file);
        }}
        testId={`${testId}-input`}
      />
      <div role="status" data-testid={`${testId}-status`} className="status">
        {state.status === 'loading' && <ProgressBar label={`Reading ${state.fileName}…`} />}
        {state.status === 'error' && <span className="error">{state.message}</span>}
        {state.status === 'loaded' && (
          <>
            {state.fileName} ({state.file.kind === 'save' ? 'save' : 'builds file'}):{' '}
            {characters.length} character(s) ({Math.round(state.ms)} ms)
            {state.file.checksumMismatches.length > 0 && (
              <span className="error"> Warning: this save looks corrupted.</span>
            )}
          </>
        )}
      </div>
      {selected && (
        <label className="field">
          <span>Character</span>
          <select
            data-testid={`${testId}-character`}
            value={selected.key}
            onChange={(e) => select(e.target.value)}
          >
            {characters.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} · {c.builds.length} builds
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
