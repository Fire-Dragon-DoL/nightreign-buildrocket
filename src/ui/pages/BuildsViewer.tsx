import { useState } from 'react';
import { isAbortError } from '../../storage/files.ts';
import { BuildTable } from '../components/BuildTable.tsx';
import { exportBuildsFile } from '../primary/exportBuilds.ts';
import { usePrimarySource } from '../useLoadedFile.ts';

const ALL = '__all__';

/** Goal 1: show every build of a save (or builds file) and export them to JSON. */
export function BuildsViewer() {
  const source = usePrimarySource();
  const { characters, selected } = source;
  const [message, setMessage] = useState<string | null>(null);
  const [exportKey, setExportKey] = useState<string | null>(null);

  const exportChoice = exportKey ?? selected?.key ?? ALL;
  const exported =
    exportChoice === ALL ? characters : characters.filter((c) => c.key === exportChoice);
  const exportLabel = exportChoice === ALL ? 'all' : (exported[0]?.label ?? '');

  const exportJson = async () => {
    try {
      const n = await exportBuildsFile(exported, exportLabel);
      setMessage(`Exported ${n} builds.`);
    } catch (err) {
      if (!isAbortError(err)) setMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <p className="intro">
        All saved builds of the <b>Primary Save File</b>'s character (open a save or a builds file
        at the top, and pick the character there). Export them as a builds file (.jsl2) to back them
        up or send them to a friend: it opens anywhere a save does.
      </p>
      {!selected && (
        <p className="muted" data-testid="viewer-empty">
          Drop a save or a .jsl2 builds file on <b>Primary Save File</b> at the top.
        </p>
      )}
      {message && (
        <p className="message" data-testid="message">
          {message}
        </p>
      )}

      {selected && (
        <section className="builds-section">
          <div className="toolbar">
            <div className="toolbar__spacer" />
            <label className="field">
              <span>Export</span>
              <select
                data-testid="export-character"
                value={exportChoice}
                onChange={(e) => setExportKey(e.target.value)}
              >
                {characters.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
                {characters.length > 1 && <option value={ALL}>All characters</option>}
              </select>
            </label>
            <button type="button" onClick={exportJson} disabled={exported.length === 0}>
              Export builds (.jsl2)
            </button>
          </div>
          <BuildTable builds={selected.builds} />
        </section>
      )}
    </>
  );
}
