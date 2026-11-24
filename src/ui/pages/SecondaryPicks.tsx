import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RelicSpec } from '../../core/builds/builds.ts';
import { relicsOfBuilds } from '../../core/compare/missing.ts';
import { picksToCsv } from '../../core/picks/csv.ts';
import type { PickFill, PicksResult } from '../../core/picks/picks.ts';
import {
  type ComboNeed,
  DEFAULT_GROUP,
  effectiveRules,
  IMPORTANCE_LABELS,
  type SellConfig,
} from '../../core/sell/config.ts';
import { buildEffectIndex } from '../../core/sell/effects.ts';
import { withDefaultLevels } from '../../core/sell/needs.ts';
import { parseRnp } from '../../core/sell/rnp.ts';
import { CSV_FILE_TYPE, isAbortError, PLAN_OPEN_TYPE, saveTextFile } from '../../storage/files.ts';
import { saveWorker } from '../../worker/client.ts';
import { FileDrop } from '../components/FileDrop.tsx';
import { FileSourcePicker } from '../components/FileSourcePicker.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { RelicCell, RelicEffects } from '../components/RelicParts.tsx';
import { fileSafe } from '../fileSafe.ts';
import { type Builder, builderFromRelic } from '../sell/builder.ts';
import { ComboDialog } from '../sell/ComboDialog.tsx';
import { addNeeds } from '../sell/configEdit.ts';
import { canSaveInPlace, type PlanFile, savePlan, saveTargetText } from '../sell/planFile.ts';
import { useSellPlannerPlan } from '../sell/sharedPlan.ts';
import { RelicRef } from '../sell/WhyCell.tsx';
import { useUnsavedGuard } from '../unsaved.ts';
import { useLoadedFile } from '../useLoadedFile.ts';

type Run =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; result: PicksResult; ms: number }
  | { status: 'error'; message: string };

type PlanSource = 'planner' | 'file';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
const needCount = (c: SellConfig) => c.groups.reduce((n, g) => n + g.needs.length, 0);

function NeedName({ f }: { f: Pick<PickFill, 'group' | 'label' | 'color'> }) {
  return (
    <>
      {f.group !== DEFAULT_GROUP && <span className="muted">{f.group} › </span>}
      {f.label}
      {f.color && (
        <span className={`why__color why__color--${f.color.toLowerCase()}`}> {f.color}</span>
      )}
    </>
  );
}

const relicsOf = (c: {
  relics: RelicSpec[] | null;
  builds: Parameters<typeof relicsOfBuilds>[0];
}) => c.relics ?? relicsOfBuilds(c.builds);

/**
 * Secondary Pool Picks: relics of a second pool (another character or save) that fill what the
 * Relic Pool lacks for a sell plan's needs and combos, plus upgrades and possible godrolls.
 */
export function SecondaryPicks() {
  const mainSource = useLoadedFile();
  const secondarySource = useLoadedFile();
  const mainChar = mainSource.selected;
  const secondaryChar = secondarySource.selected;
  const main = useMemo(() => (mainChar ? relicsOf(mainChar) : null), [mainChar]);
  const secondary = useMemo(
    () => (secondaryChar ? relicsOf(secondaryChar) : null),
    [secondaryChar],
  );

  const shared = useSellPlannerPlan();
  const [planSource, setPlanSource] = useState<PlanSource>('planner');
  const [filePlan, setFilePlan] = useState<
    (PlanFile & { config: SellConfig; dirty: boolean }) | null
  >(null);
  useUnsavedGuard('picks-plan', filePlan?.dirty ?? false);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const config = planSource === 'planner' ? shared.config : (filePlan?.config ?? null);

  const openPlan = async (file: File, handle?: FileSystemFileHandle) => {
    if (
      filePlan?.dirty &&
      !window.confirm(`${filePlan.name} has unsaved changes. Open another plan anyway?`)
    ) {
      return;
    }
    try {
      const parsed = parseRnp(await file.text());
      setFilePlan({
        name: file.name,
        config: parsed.config,
        dirty: false,
        ...(handle ? { handle } : {}),
      });
      setPlanSource('file');
      setPlanMessage([`Loaded ${file.name}.`, ...parsed.warnings].join(' '));
    } catch (err) {
      setPlanMessage(`Could not load ${file.name}: ${(err as Error).message}`);
    }
  };

  // Combos added from the results go into the plan in use.
  const index = useMemo(
    () => (config ? buildEffectIndex(effectiveRules(config.effectRules)) : null),
    [config],
  );
  const [popup, setPopup] = useState<Builder | null>(null);
  const setPopupBuilder = useCallback(
    (fn: (b: Builder) => Builder) => setPopup((p) => (p ? fn(p) : p)),
    [],
  );
  const copyToBuilder = useMemo(
    () =>
      index && (planSource === 'file' || shared.update)
        ? (spec: RelicSpec) => setPopup(builderFromRelic(spec, index, 1))
        : undefined,
    [index, planSource, shared.update],
  );
  const addCombo = (draft: ComboNeed) => {
    if (!index) return;
    const add = (c: SellConfig) => addNeeds(c, [withDefaultLevels(draft, index)]);
    if (planSource === 'planner') {
      shared.update?.((c) => add(c).config);
      setPlanMessage("Added the combo to the Sell Planner's plan (save it there to keep it).");
    } else if (filePlan) {
      setFilePlan({ ...filePlan, config: add(filePlan.config).config, dirty: true });
      setPlanMessage(`Added the combo to ${filePlan.name}.`);
    }
    setPopup(null);
  };

  const saveFilePlan = async (saveAs: boolean) => {
    if (!filePlan) return;
    try {
      const { config: plan, dirty: _dirty, ...file } = filePlan;
      const saved = await savePlan(plan, file, saveAs);
      setFilePlan({ ...saved, config: plan, dirty: false });
      setPlanMessage(`Saved ${saved.name}.`);
    } catch (err) {
      if (!isAbortError(err)) setPlanMessage(`Save failed: ${(err as Error).message}`);
    }
  };

  const [run, setRun] = useState<Run>({ status: 'idle' });
  useEffect(() => {
    if (!main || !secondary || !config) {
      setRun({ status: 'idle' });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setRun({ status: 'running', progress: 0 });
      saveWorker
        .pickSecondary(main, secondary, config, (done, total) => {
          if (!cancelled) setRun({ status: 'running', progress: done / total });
        })
        .then(({ result, ms }) => {
          if (!cancelled) setRun({ status: 'done', result, ms });
        })
        .catch((err: unknown) => {
          if (!cancelled) setRun({ status: 'error', message: (err as Error).message });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [main, secondary, config]);

  const [message, setMessage] = useState<string | null>(null);
  const exportCsv = async () => {
    if (run.status !== 'done') return;
    try {
      const name = `nightreign-picks-${fileSafe(secondaryChar?.name ?? '') || 'secondary'}-for-${fileSafe(mainChar?.name ?? '') || 'pool'}.csv`;
      await saveTextFile(picksToCsv(run.result), name, CSV_FILE_TYPE);
      const r = run.result;
      setMessage(`Exported ${r.picks.length + r.upgrades.length + r.godrolls.length} lines.`);
    } catch (err) {
      if (!isAbortError(err)) setMessage(`Export failed: ${(err as Error).message}`);
    }
  };

  const plannerName = `${shared.name ?? 'Unsaved plan'}${shared.dirty ? ' (changed)' : ''}`;

  return (
    <>
      <p className="intro">
        Find relics worth bringing over from another pool. Load the pool you play on as{' '}
        <b>Relic Pool</b> and the other one as <b>Secondary Pool</b> (a save or builds JSON each,
        then pick a character), and choose a <b>plan</b>: the one open in the Sell Planner, or a
        saved .rnp plan. The Secondary Pool is treated as a copy of your Relic Pool that drifted
        apart: every relic your Relic Pool has removes one matching copy from it (same color, deep
        or normal, slots, effects and curses), and only what's left (the <b>available pool</b>,
        relics really earned on that side) is considered. Needs your Relic Pool is short of get the{' '}
        <b>fewest</b> available relics that fill them, with the same rules as the Sell Planner
        (colors must match, dealbreaker curses don't count, lower levels are backups). Below that:{' '}
        <b>upgrades</b> (better than a copy you count) and <b>possible godrolls</b> your plan
        doesn't mention.
      </p>
      <section className="loaders loaders--pair">
        <FileSourcePicker source={mainSource} label="Relic Pool" testId="picks-main" />
        <FileSourcePicker
          source={secondarySource}
          label="Secondary Pool"
          testId="picks-secondary"
        />
      </section>

      <section className="file-source" data-testid="picks-plan">
        <div className="toolbar">
          <b>Plan:</b>
          <label>
            <input
              type="radio"
              name="picks-plan"
              checked={planSource === 'planner'}
              onChange={() => setPlanSource('planner')}
              data-testid="picks-plan-planner"
            />{' '}
            Sell Planner's plan{' '}
            <span className="muted">
              ({plannerName} · {needCount(shared.config)} need(s))
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="picks-plan"
              checked={planSource === 'file'}
              onChange={() => setPlanSource('file')}
              data-testid="picks-plan-file"
            />{' '}
            Another plan{' '}
            <span className="muted">
              (
              {filePlan
                ? `${filePlan.name}${filePlan.dirty ? ' (changed)' : ''} · ${needCount(filePlan.config)} need(s)`
                : 'none loaded'}
              )
            </span>
          </label>
          {planSource === 'file' && filePlan && (
            <>
              {canSaveInPlace() && (
                <button
                  type="button"
                  onClick={() => void saveFilePlan(false)}
                  disabled={!filePlan.dirty}
                  title={saveTargetText(filePlan)}
                  data-testid="picks-rnp-save"
                >
                  Save plan
                </button>
              )}
              <button
                type="button"
                className={canSaveInPlace() ? 'button--quiet' : undefined}
                onClick={() => void saveFilePlan(true)}
                data-testid="picks-rnp-save-as"
              >
                Save as…
              </button>
            </>
          )}
        </div>
        {planSource === 'file' && (
          <FileDrop
            label="Open relic needs plan (.rnp)"
            hint="A plan saved from the Sell Planner (older .rsp plans open too)."
            accept=".rnp,.rsp,.json,application/json"
            handleTypes={[PLAN_OPEN_TYPE]}
            onFile={(file, handle) => void openPlan(file, handle)}
            testId="picks-rnp-input"
          />
        )}
        {planSource === 'file' && filePlan && (
          <span className="muted plan-target" data-testid="picks-rnp-target">
            {saveTargetText(filePlan)}
          </span>
        )}
        {planMessage && (
          <span className="message" data-testid="picks-rnp-message">
            {planMessage}
          </span>
        )}
      </section>

      {[mainChar, secondaryChar].some((c) => c && !c.relics) && (
        <p className="warning" data-testid="picks-pool-warning">
          A builds file without a relic inventory (exported by an older version) only counts the
          relics used in its builds. Load the save, or export the builds again.
        </p>
      )}

      {(!main || !secondary) && <p className="muted">Load both pools to see what to bring over.</p>}
      {main && secondary && !config && <p className="muted">Load a plan (.rnp) to compare.</p>}
      {run.status === 'running' && (
        <ProgressBar label="Comparing pools…" value={run.progress} testId="picks-progress" />
      )}
      {run.status === 'error' && <p className="error">{run.message}</p>}
      {run.status === 'done' && config && (
        <PicksView
          result={run.result}
          ms={run.ms}
          empty={needCount(config) === 0}
          message={message}
          onExport={exportCsv}
          onCopyToBuilder={copyToBuilder}
        />
      )}
      {index && (
        <ComboDialog
          builder={popup}
          setBuilder={setPopupBuilder}
          index={index}
          onClose={() => setPopup(null)}
          onSubmit={addCombo}
          testId="picks-combo-dialog"
        />
      )}
    </>
  );
}

function PicksView({
  result,
  ms,
  empty,
  message,
  onExport,
  onCopyToBuilder,
}: {
  result: PicksResult;
  ms: number;
  empty: boolean;
  message: string | null;
  onExport: () => void;
  /** Open the combo builder with this relic's effects (undefined: no plan to add to). */
  onCopyToBuilder?: ((spec: RelicSpec) => void) | undefined;
}) {
  const copy = (spec: RelicSpec) =>
    onCopyToBuilder && spec.effects.some((e) => e !== null) ? (
      <button
        type="button"
        className="button--quiet copy-to-builder"
        data-testid="copy-to-builder"
        title="Open the combo builder with this relic's effects"
        onClick={() => onCopyToBuilder(spec)}
      >
        Copy relic to builder
      </button>
    ) : null;
  const taken = result.picks.reduce((n, p) => n + p.count, 0);
  const stillShort = result.needs.filter((n) => n.after + 1e-9 < n.want);
  const any = result.picks.length + result.upgrades.length + result.godrolls.length > 0;
  return (
    <section className="builds-section">
      <div className="toolbar">
        <span data-testid="picks-summary">
          {result.needs.length === 0
            ? 'Your Relic Pool already has everything your plan wants.'
            : `${result.needs.length} need(s) short in your Relic Pool; take ${taken} relic(s) to fill ${result.needs.length - stillShort.length} of them.`}{' '}
          {result.upgrades.length} upgrade(s), {result.godrolls.length} possible godroll(s) (
          {Math.round(ms)} ms).
        </span>
        {empty && <span className="warning">Your plan is empty: only godrolls can show up.</span>}
        <div className="toolbar__spacer" />
        {message && (
          <span className="message" data-testid="message">
            {message}
          </span>
        )}
        <button type="button" onClick={onExport} disabled={!any}>
          Export CSV
        </button>
      </div>
      <p className="muted" data-testid="picks-available">
        Available pool: <b>{result.availableCount}</b> relic(s); {result.shared} Secondary relic(s)
        set aside because your Relic Pool has the same copy.
      </p>
      {result.skippedUnique > 0 && (
        <p className="muted">
          {result.skippedUnique} unique relic(s) in the Secondary Pool skipped: your Relic Pool has
          them already.
        </p>
      )}
      {result.warnings.length > 0 && (
        <ul className="warning-list">
          {result.warnings.map((w) => (
            <li key={w} className="warning">
              {w}
            </li>
          ))}
        </ul>
      )}

      {result.needs.length > 0 && (
        <details className="build-picker" open={stillShort.length > 0}>
          <summary>
            Short needs: {result.needs.length - stillShort.length} of {result.needs.length} filled
            {stillShort.length > 0 && (
              <span className="warning"> · {stillShort.length} still short</span>
            )}
          </summary>
          <div className="table-scroll">
            <table className="effect-table" data-testid="picks-needs">
              <thead>
                <tr>
                  <th>Need</th>
                  <th>Importance</th>
                  <th>Want</th>
                  <th>Relic Pool</th>
                  <th>With picks</th>
                </tr>
              </thead>
              <tbody>
                {result.needs.map((n, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: status rows are positional
                  <tr key={i} className={n.after + 1e-9 < n.want ? 'need--short' : undefined}>
                    <td>
                      <NeedName f={n} />
                    </td>
                    <td>{IMPORTANCE_LABELS[n.importance]}</td>
                    <td>{n.want}</td>
                    <td>{fmt(n.have)}</td>
                    <td>{fmt(n.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {result.picks.length > 0 && (
        <article className="build sell-section" data-testid="picks-fill">
          <header className="build__header">
            <span className="build__name">Fills what you lack</span>{' '}
            <span className="muted">— take {taken}</span>
          </header>
          <table className="build__relics">
            <thead>
              <tr>
                <th>Relic</th>
                <th>Effects</th>
                <th>Take</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {result.picks.map((e) => (
                <tr key={e.key} data-testid="pick-row">
                  <RelicCell relic={e.spec} />
                  <td>
                    <RelicEffects relic={e.spec} />
                    {copy(e.spec)}
                  </td>
                  <td className="missing__copies">
                    {e.count} of {e.available}
                  </td>
                  <td className="why-cell">
                    <ul className="why__lines">
                      {e.fills.map((f) => (
                        <li key={`${f.group}|${f.label}|${f.color}`}>
                          <NeedName f={f} />: you have <b>{fmt(f.have)}</b>, <b>{fmt(f.after)}</b>{' '}
                          with picks, plan wants <b>{f.want}</b>
                          {f.backup && <span> (counts as a backup)</span>}
                          <span className="muted"> ({IMPORTANCE_LABELS[f.importance]})</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}

      {result.upgrades.length > 0 && (
        <article className="build sell-section" data-testid="picks-upgrades">
          <header className="build__header">
            <span className="build__name">Upgrades</span>{' '}
            <span className="muted">— better than a copy your Relic Pool counts</span>
          </header>
          <table className="build__relics">
            <thead>
              <tr>
                <th>Relic</th>
                <th>Effects</th>
                <th>Available</th>
                <th>Better than</th>
              </tr>
            </thead>
            <tbody>
              {result.upgrades.map((e) => (
                <tr key={e.key} data-testid="upgrade-row">
                  <RelicCell relic={e.spec} />
                  <td>
                    <RelicEffects relic={e.spec} />
                    {copy(e.spec)}
                  </td>
                  <td className="missing__copies">{e.available}</td>
                  <td className="why-cell">
                    <ul className="why__lines">
                      {e.better.map((l) => (
                        <li key={`${l.group}|${l.label}|${l.color}`}>
                          <NeedName f={l} />: {l.higher ? 'higher level' : 'milder curses'} than
                          <RelicRef relic={l.over} />
                          <span className="muted"> ({IMPORTANCE_LABELS[l.importance]})</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}

      {result.godrolls.length > 0 && (
        <article className="build sell-section" data-testid="picks-godrolls">
          <header className="build__header">
            <span className="build__name">Possible godrolls</span>{' '}
            <span className="muted">
              — not in your plan, but every slot is a top-level effect: review them
            </span>
          </header>
          <table className="build__relics">
            <thead>
              <tr>
                <th>Relic</th>
                <th>Effects</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {result.godrolls.map((e) => (
                <tr key={e.key} data-testid="godroll-row">
                  <RelicCell relic={e.spec} />
                  <td>
                    <RelicEffects relic={e.spec} />
                    {copy(e.spec)}
                  </td>
                  <td className="missing__copies">{e.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}
    </section>
  );
}
