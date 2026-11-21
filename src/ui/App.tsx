import { useMemo, useState } from 'react';
import { type Build, extractCharacterBuilds } from '../core/builds/builds.ts';
import { parseBuildsDocument, toBuildsDocument } from '../core/builds/builds-json.ts';
import { isAbortError, saveTextFile } from '../storage/files.ts';
import { BuildTable } from './components/BuildTable.tsx';
import { FileDrop } from './components/FileDrop.tsx';
import { useSaveFile } from './useSaveFile.ts';

/** One character's builds, from a save slot or from an imported builds file. */
interface CharacterBuilds {
  key: string;
  label: string;
  builds: Build[];
}

const ALL = '__all__';

function groupByCharacter(builds: Build[]): CharacterBuilds[] {
  const groups = new Map<string, Build[]>();
  for (const build of builds) {
    const list = groups.get(build.character) ?? [];
    list.push(build);
    groups.set(build.character, list);
  }
  return [...groups].map(([name, list]) => ({
    key: `json:${name}`,
    label: name || '(unnamed)',
    builds: list,
  }));
}

const fileSafe = (text: string) => text.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '');

export function App() {
  const { state, load } = useSaveFile();
  const [imported, setImported] = useState<{ name: string; builds: Build[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [exportKey, setExportKey] = useState<string | null>(null);

  const characters = useMemo<CharacterBuilds[]>(() => {
    if (imported) return groupByCharacter(imported.builds);
    if (state.status !== 'loaded') return [];
    return state.save.characters.map((c) => ({
      key: `slot:${c.index}`,
      label: `${c.name} (slot ${c.index + 1})`,
      builds: extractCharacterBuilds(c),
    }));
  }, [state, imported]);

  const viewed = characters.find((c) => c.key === viewKey) ?? characters[0];
  const exportChoice = exportKey ?? viewed?.key ?? ALL;
  const exportBuilds =
    exportChoice === ALL
      ? characters.flatMap((c) => c.builds)
      : (characters.find((c) => c.key === exportChoice)?.builds ?? []);
  const exportLabel =
    exportChoice === ALL ? 'all' : (characters.find((c) => c.key === exportChoice)?.label ?? '');

  const resetSelection = () => {
    setViewKey(null);
    setExportKey(null);
  };

  const exportJson = async () => {
    try {
      const json = JSON.stringify(toBuildsDocument(exportBuilds), null, 2);
      await saveTextFile(json, `nightreign-builds-${fileSafe(exportLabel) || 'export'}.json`);
      setMessage(`Exported ${exportBuilds.length} builds.`);
    } catch (err) {
      if (!isAbortError(err)) setMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  const importBuilds = async (file: File) => {
    try {
      const { builds } = parseBuildsDocument(await file.text());
      setImported({ name: file.name, builds });
      resetSelection();
      setMessage(`Loaded ${builds.length} builds from ${file.name}.`);
    } catch (err) {
      setMessage(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <main className="app">
      <header className="app__header">
        <h1>Nightreign Buildrocket</h1>
        <span className="muted">
          Runs locally in your browser. Your save never leaves this computer.
        </span>
      </header>

      <section className="loaders">
        <FileDrop
          label="Open save file"
          hint="NR0000.sl2 (or NR0000.co2), usually in %APPDATA%\Nightreign\<steam id>"
          accept=".sl2,.co2"
          onFile={(f) => {
            setImported(null);
            resetSelection();
            setMessage(null);
            void load(f);
          }}
          testId="save-input"
        />
        <FileDrop
          label="Open builds JSON"
          hint="A file previously exported from this tool"
          accept=".json,application/json"
          onFile={(f) => void importBuilds(f)}
          testId="builds-input"
        />
      </section>

      <div role="status" data-testid="status" className="status">
        {state.status === 'loading' && `Reading ${state.fileName}…`}
        {state.status === 'error' && <span className="error">{state.message}</span>}
        {state.status === 'loaded' &&
          !imported &&
          `${state.fileName}: ${characters.length} character(s) (${Math.round(state.ms)} ms)`}
        {imported && `${imported.name}: ${imported.builds.length} builds`}
        {state.status === 'loaded' && !imported && state.save.checksumMismatches.length > 0 && (
          <span className="error"> Warning: this save looks corrupted.</span>
        )}
      </div>
      {message && (
        <p className="message" data-testid="message">
          {message}
        </p>
      )}

      {viewed && (
        <section className="builds-section">
          <div className="toolbar">
            <label className="field">
              <span>Character</span>
              <select
                data-testid="view-character"
                value={viewed.key}
                onChange={(e) => setViewKey(e.target.value)}
              >
                {characters.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} · {c.builds.length} builds
                  </option>
                ))}
              </select>
            </label>
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
            <button type="button" onClick={exportJson} disabled={exportBuilds.length === 0}>
              Export builds to JSON
            </button>
          </div>
          <BuildTable builds={viewed.builds} />
        </section>
      )}

      <footer className="app__footer muted">
        Nightreign Buildrocket v{__APP_VERSION__} · Free software under the{' '}
        <a href="https://github.com/Fire-Dragon-DoL/nightreign-buildrocket">AGPL-3.0 (source)</a>.
        Not affiliated with FromSoftware or Bandai Namco.
      </footer>
    </main>
  );
}
