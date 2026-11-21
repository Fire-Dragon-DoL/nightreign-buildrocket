import { useMemo, useState } from 'react';
import { type Build, extractBuilds } from '../core/builds/builds.ts';
import { parseBuildsDocument, toBuildsDocument } from '../core/builds/builds-json.ts';
import { isAbortError, saveTextFile } from '../storage/files.ts';
import { BuildList } from './components/BuildList.tsx';
import { FileDrop } from './components/FileDrop.tsx';
import { useSaveFile } from './useSaveFile.ts';

export function App() {
  const { state, load } = useSaveFile();
  const [imported, setImported] = useState<{ name: string; builds: Build[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const saveBuilds = useMemo(
    () => (state.status === 'loaded' ? extractBuilds(state.save) : []),
    [state],
  );
  const builds = imported?.builds ?? saveBuilds;

  const exportBuilds = async () => {
    try {
      const json = JSON.stringify(toBuildsDocument(builds), null, 2);
      await saveTextFile(json, 'nightreign-builds.json');
      setMessage(`Exported ${builds.length} builds.`);
    } catch (err) {
      if (!isAbortError(err)) setMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  const importBuilds = async (file: File) => {
    try {
      const doc = parseBuildsDocument(await file.text());
      setImported({ name: file.name, builds: doc.builds });
      setMessage(`Loaded ${doc.builds.length} builds from ${file.name}.`);
    } catch (err) {
      setMessage(`Import failed: ${(err as Error).message}`);
    }
  };

  return (
    <main className="app">
      <header className="app__header">
        <h1>Nightreign Buildrocket</h1>
        <p className="muted">
          Everything runs locally in your browser. Your save never leaves this computer.
        </p>
      </header>

      <section className="loaders">
        <FileDrop
          label="Open save file"
          hint="NR0000.sl2 (or NR0000.co2), usually in %APPDATA%\Nightreign\<steam id>"
          accept=".sl2,.co2"
          onFile={(f) => {
            setImported(null);
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
          `${state.fileName}: ${state.save.characters.map((c) => c.name).join(', ')} — ${builds.length} builds (${Math.round(state.ms)} ms)`}
        {imported && `${imported.name}: ${builds.length} builds`}
        {state.status === 'loaded' && state.save.checksumMismatches.length > 0 && (
          <span className="error"> Warning: this save looks corrupted.</span>
        )}
      </div>
      {message && (
        <p className="message" data-testid="message">
          {message}
        </p>
      )}

      {builds.length > 0 && (
        <section>
          <div className="toolbar">
            <h2>Builds</h2>
            <button type="button" onClick={exportBuilds}>
              Export builds to JSON
            </button>
          </div>
          <BuildList builds={builds} />
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
