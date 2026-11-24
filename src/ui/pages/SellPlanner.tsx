import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RelicSpec } from '../../core/builds/builds.ts';
import { relicsOfBuilds } from '../../core/compare/missing.ts';
import { effectiveRules } from '../../core/sell/config.ts';
import { sellPlanToCsv } from '../../core/sell/csv.ts';
import { buildEffectIndex } from '../../core/sell/effects.ts';
import { withDefaultLevels } from '../../core/sell/needs.ts';
import { ownedCounts } from '../../core/sell/owned.ts';
import type { SellPlan } from '../../core/sell/planner.ts';
import type { SellSection } from '../../core/sell/sections.ts';
import { CSV_FILE_TYPE, isAbortError, saveTextFile } from '../../storage/files.ts';
import { saveWorker } from '../../worker/client.ts';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { fileSafe } from '../fileSafe.ts';
import { needCount, updatePlan, usePlan } from '../plan/planStore.ts';
import { type Builder, builderFromRelic } from '../sell/builder.ts';
import { ComboDialog } from '../sell/ComboDialog.tsx';
import { addNeeds, listNeeds } from '../sell/configEdit.ts';
import { ResultsView } from '../sell/ResultsView.tsx';
import { usePrimarySource } from '../useLoadedFile.ts';

type Run =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; plan: SellPlan; sections: SellSection[]; ms: number }
  | { status: 'error'; message: string };

/** Sell Planner (goal 3): which relics can go, ranked by risk, for a saved config. */
export function SellPlanner() {
  const source = usePrimarySource();
  const character = source.selected;
  const pool = useMemo<RelicSpec[] | null>(
    () => (character ? (character.relics ?? relicsOfBuilds(character.builds)) : null),
    [character],
  );
  const owned = useMemo(() => (pool ? ownedCounts(pool) : null), [pool]);

  const { config } = usePlan();
  // The builder popup opened from the results (null: closed).
  const [popup, setPopup] = useState<Builder | null>(null);
  const setPopupBuilder = useCallback(
    (fn: (b: Builder) => Builder) => setPopup((p) => (p ? fn(p) : p)),
    [],
  );
  const index = useMemo(
    () => buildEffectIndex(effectiveRules(config.effectRules)),
    [config.effectRules],
  );

  // Plan in the worker, shortly after the last change.
  const [run, setRun] = useState<Run>({ status: 'idle' });
  // The last finished plan stays on screen while the next one runs (keeps the scroll position).
  const [shown, setShown] = useState<Extract<Run, { status: 'done' }> | null>(null);
  useEffect(() => {
    if (!pool) {
      setRun({ status: 'idle' });
      setShown(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setRun({ status: 'running', progress: 0 });
      saveWorker
        .planSell(pool, config, (done, total) => {
          if (!cancelled) setRun({ status: 'running', progress: done / total });
        })
        .then(({ plan, sections, ms }) => {
          if (cancelled) return;
          const done = { status: 'done', plan, sections, ms } as const;
          setRun(done);
          setShown(done);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setRun({ status: 'error', message: (err as Error).message });
          setShown(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pool, config]);

  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const exportCsv = async () => {
    if (run.status !== 'done') return;
    try {
      const name = `nightreign-sell-${fileSafe(character?.name ?? '') || 'relics'}.csv`;
      await saveTextFile(sellPlanToCsv(run.plan), name, CSV_FILE_TYPE);
      setExportMessage(`Exported ${run.plan.sell.length} lines.`);
    } catch (err) {
      if (!isAbortError(err)) setExportMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  const needs = needCount(config);

  return (
    <>
      <p className="intro">
        Find relics you can sell from the <b>Primary Save File</b>'s character; what to keep comes
        from the relic needs plan. Both are open at the top; set the plan up in{' '}
        <a href="#/needs">Needs Config</a>. A relic is suggested only if everything your plan wants
        is still there without it, and each one says why: nothing on it is wanted, a relic you keep
        covers it, or enough copies are left. Selling everything above any line is safe in the order
        shown.
      </p>
      {character && !character.relics && (
        <p className="warning" data-testid="sell-pool-warning">
          This builds file has no relic inventory (it was exported by an older version), so only the
          relics used in its builds are listed. Load the save, or export the builds again.
        </p>
      )}

      <section className="builds-section">
        {!pool && (
          <p className="muted">
            Drop a save or a .jsl2 builds file on <b>Primary Save File</b> at the top to see what
            you can sell.
          </p>
        )}
        {run.status === 'running' && !shown && (
          <ProgressBar label="Planning…" value={run.progress} testId="sell-progress" />
        )}
        {run.status === 'error' && <p className="error">{run.message}</p>}
        {shown && (
          <>
            <div className="toolbar">
              <span data-testid="sell-summary">
                {shown.plan.sell.reduce((n, e) => n + e.count, 0)} relic(s) can be sold,{' '}
                {shown.plan.kept.reduce((n, k) => n + k.count, 0)} kept, {shown.plan.unsellable}{' '}
                can't be sold ({Math.round(shown.ms)} ms).
              </span>
              {run.status === 'running' && (
                <span className="muted" data-testid="sell-updating">
                  Updating…
                </span>
              )}
              {needs === 0 && (
                <span className="warning">
                  Your plan is empty, so everything counts as safe to sell: set it up in{' '}
                  <a href="#/needs">Needs Config</a>.
                </span>
              )}
              <div className="toolbar__spacer" />
              {exportMessage && (
                <span className="message" data-testid="message">
                  {exportMessage}
                </span>
              )}
              <button type="button" onClick={exportCsv} disabled={shown.plan.sell.length === 0}>
                Export CSV
              </button>
            </div>
            <ResultsView
              plan={shown.plan}
              owned={owned}
              sections={shown.sections}
              onCopyToBuilder={(spec) => setPopup(builderFromRelic(spec, index, 1))}
            />
          </>
        )}
      </section>
      <ComboDialog
        builder={popup}
        existing={listNeeds(config)}
        setBuilder={setPopupBuilder}
        index={index}
        onClose={() => setPopup(null)}
        onSubmit={(drafts) => {
          updatePlan(
            (c) =>
              addNeeds(
                c,
                drafts.map((d) => withDefaultLevels(d, index)),
                index,
              ).config,
          );
          setPopup(null);
        }}
      />
    </>
  );
}
