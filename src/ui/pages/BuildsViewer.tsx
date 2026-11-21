import { useState } from 'react';
import { toBuildsDocument } from '../../core/builds/builds-json.ts';
import { inventoriesOf } from '../../core/builds/characters.ts';
import { isAbortError, saveTextFile } from '../../storage/files.ts';
import { BuildTable } from '../components/BuildTable.tsx';
import { FileSourcePicker } from '../components/FileSourcePicker.tsx';
import { fileSafe } from '../fileSafe.ts';
import { useLoadedFile } from '../useLoadedFile.ts';

const ALL = '__all__';

/** Goal 1: show every build of a save (or builds file) and export them to JSON. */
export function BuildsViewer() {
  const source = useLoadedFile();
  const { characters, selected } = source;
  const [message, setMessage] = useState<string | null>(null);
  const [exportKey, setExportKey] = useState<string | null>(null);

  const exportChoice = exportKey ?? selected?.key ?? ALL;
  const exported =
    exportChoice === ALL ? characters : characters.filter((c) => c.key === exportChoice);
  const exportBuilds = exported.flatMap((c) => c.builds);
  const exportLabel = exportChoice === ALL ? 'all' : (exported[0]?.label ?? '');

  const exportJson = async () => {
    try {
      const doc = toBuildsDocument(exportBuilds, inventoriesOf(exported));
      const json = JSON.stringify(doc, null, 2);
      await saveTextFile(json, `nightreign-builds-${fileSafe(exportLabel) || 'export'}.json`);
      setMessage(`Exported ${exportBuilds.length} builds.`);
    } catch (err) {
      if (!isAbortError(err)) setMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <p className="intro">
        Open a save or a builds JSON and pick a character to see all its saved builds. Export them
        to JSON to back them up or send them to a friend.
      </p>
      <section className="loaders">
        <FileSourcePicker
          source={source}
          label="Open save or builds JSON"
          testId="viewer"
          onNewFile={() => {
            setExportKey(null);
            setMessage(null);
          }}
        />
      </section>
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
              Export builds to JSON
            </button>
          </div>
          <BuildTable builds={selected.builds} />
        </section>
      )}
    </>
  );
}
