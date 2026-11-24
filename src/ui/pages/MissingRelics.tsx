import { useEffect, useMemo, useState } from 'react';
import type { Build, RelicSpec } from '../../core/builds/builds.ts';
import type { CharacterData } from '../../core/builds/characters.ts';
import { heroName } from '../../core/catalog/catalog.ts';
import { missingRelicsToCsv } from '../../core/compare/csv.ts';
import { type MissingRelicsResult, relicsOfBuilds } from '../../core/compare/missing.ts';
import { CSV_FILE_TYPE, isAbortError, saveTextFile } from '../../storage/files.ts';
import { saveWorker } from '../../worker/client.ts';
import { FileSourcePicker } from '../components/FileSourcePicker.tsx';
import { MissingRelicList } from '../components/MissingRelicList.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { fileSafe } from '../fileSafe.ts';
import { useLoadedFile, usePrimarySource } from '../useLoadedFile.ts';

type Run =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; builds: Build[]; result: MissingRelicsResult }
  | { status: 'error'; message: string };

/**
 * Relics Needs (goal 2): which relics the "Relics pool" character lacks to make every
 * (ticked) build of the "Builds source" character.
 */
export function MissingRelics() {
  const source = usePrimarySource();
  const pool = useLoadedFile();
  const sourceChar = source.selected;
  const poolChar = pool.selected;

  // Builds the user unticked, for one source character (another character starts all ticked).
  const [excluded, setExcluded] = useState<{ of: CharacterData | undefined; indices: Set<number> }>(
    { of: undefined, indices: new Set() },
  );
  const unticked = useMemo(
    () => (excluded.of === sourceChar ? excluded.indices : new Set<number>()),
    [excluded, sourceChar],
  );
  const toggle = (index: number) => {
    const next = new Set(unticked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setExcluded({ of: sourceChar, indices: next });
  };
  const setAll = (ticked: boolean) =>
    setExcluded({
      of: sourceChar,
      indices: ticked ? new Set() : new Set(sourceChar?.builds.map((_, i) => i)),
    });

  const builds = useMemo(
    () => sourceChar?.builds.filter((_, i) => !unticked.has(i)) ?? [],
    [sourceChar, unticked],
  );
  const poolRelics = useMemo<RelicSpec[] | null>(
    () => (poolChar ? (poolChar.relics ?? relicsOfBuilds(poolChar.builds)) : null),
    [poolChar],
  );

  const [run, setRun] = useState<Run>({ status: 'idle' });
  useEffect(() => {
    if (!sourceChar || !poolRelics) {
      setRun({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setRun({ status: 'running', progress: 0 });
    saveWorker
      .findMissing(builds, poolRelics, (done, total) => {
        if (!cancelled) setRun({ status: 'running', progress: done / total });
      })
      .then(({ result }) => {
        if (!cancelled) setRun({ status: 'done', builds, result });
      })
      .catch((err: unknown) => {
        if (!cancelled) setRun({ status: 'error', message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [sourceChar, poolRelics, builds]);

  const [message, setMessage] = useState<string | null>(null);
  const exportCsv = async () => {
    if (run.status !== 'done' || !sourceChar || !poolChar) return;
    try {
      const name = `nightreign-missing-relics-${fileSafe(sourceChar.name) || 'source'}-to-${fileSafe(poolChar.name) || 'pool'}.csv`;
      await saveTextFile(missingRelicsToCsv(run.result, run.builds), name, CSV_FILE_TYPE);
      setMessage(`Exported ${run.result.missing.length} relics.`);
    } catch (err) {
      if (!isAbortError(err)) setMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <p className="intro">
        Find which relics you lack to recreate builds from another save. The builds come from the{' '}
        <b>Primary Save File</b> (at the top); load the one you'll play on as{' '}
        <b>Secondary Save File</b> and pick its character. Each missing relic shows the builds it
        blocks. Untick builds you don't need, then export the list as CSV.
      </p>
      <section className="loaders">
        <FileSourcePicker source={pool} label="Secondary Save File" testId="pool" />
      </section>

      {poolChar && !poolChar.relics && (
        <p className="warning" data-testid="pool-warning">
          This builds file has no relic inventory (it was exported by an older version), so only the
          relics used in its builds count as owned. Load the save, or export the builds again, for
          an exact result.
        </p>
      )}

      {sourceChar && sourceChar.builds.length > 0 && (
        <details className="build-picker" open>
          <summary>
            Builds to make: {builds.length} of {sourceChar.builds.length}
          </summary>
          <div className="build-picker__actions">
            <button type="button" className="button--quiet" onClick={() => setAll(true)}>
              All
            </button>
            <button type="button" className="button--quiet" onClick={() => setAll(false)}>
              None
            </button>
          </div>
          <div className="build-picker__list">
            {sourceChar.builds.map((build, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: builds have no stable id
              <label key={i} className="build-picker__item">
                <input
                  type="checkbox"
                  data-testid="build-checkbox"
                  checked={!unticked.has(i)}
                  onChange={() => toggle(i)}
                />
                <span>{build.name || '(unnamed)'}</span>
                <span className="muted">{heroName(build.heroId)}</span>
              </label>
            ))}
          </div>
        </details>
      )}

      {run.status === 'running' && (
        <ProgressBar label="Comparing relics…" value={run.progress} testId="compare-progress" />
      )}
      {run.status === 'error' && <p className="error">{run.message}</p>}
      {run.status === 'done' && (
        <section className="builds-section">
          <div className="toolbar">
            <span data-testid="missing-summary">
              {run.result.missing.length === 0
                ? `Nothing missing: all ${run.builds.length} builds can be made.`
                : `${run.result.missing.length} relic(s) missing (${run.result.missing.reduce((n, m) => n + m.missing, 0)} copies). ${run.result.complete.length} of ${run.builds.length} builds can already be made.`}
            </span>
            <div className="toolbar__spacer" />
            {message && (
              <span className="message" data-testid="message">
                {message}
              </span>
            )}
            <button type="button" onClick={exportCsv} disabled={run.result.missing.length === 0}>
              Export CSV
            </button>
          </div>
          {run.result.missing.length > 0 && (
            <MissingRelicList missing={run.result.missing} builds={run.builds} />
          )}
        </section>
      )}
    </>
  );
}
