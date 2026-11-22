import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RelicSpec } from '../../core/builds/builds.ts';
import { relicsOfBuilds } from '../../core/compare/missing.ts';
import { effectiveRules, emptyConfig, type SellConfig } from '../../core/sell/config.ts';
import { sellPlanToCsv } from '../../core/sell/csv.ts';
import { buildEffectIndex } from '../../core/sell/effects.ts';
import { ownedCounts } from '../../core/sell/owned.ts';
import type { SellPlan } from '../../core/sell/planner.ts';
import { parseRsp, serializeRsp } from '../../core/sell/rsp.ts';
import type { SellSection } from '../../core/sell/sections.ts';
import {
  CSV_FILE_TYPE,
  ensureWritable,
  isAbortError,
  RSP_FILE_TYPE,
  saveTextFile,
  writeTextFile,
} from '../../storage/files.ts';
import { saveWorker } from '../../worker/client.ts';
import { FileDrop } from '../components/FileDrop.tsx';
import { FileSourcePicker } from '../components/FileSourcePicker.tsx';
import { ProgressBar } from '../components/ProgressBar.tsx';
import { fileSafe } from '../fileSafe.ts';
import { type Builder, builderFromRelic, emptyBuilder } from '../sell/builder.ts';
import type { ConfigUpdate } from '../sell/configEdit.ts';
import { EffectsTab } from '../sell/EffectsTab.tsx';
import { GroupsTab } from '../sell/GroupsTab.tsx';
import { ResultsView } from '../sell/ResultsView.tsx';
import { StackingTab } from '../sell/StackingTab.tsx';
import { useLoadedFile } from '../useLoadedFile.ts';

type Tab = 'results' | 'normal' | 'deep' | 'groups' | 'stacking';
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'results', label: 'Results' },
  { tab: 'normal', label: 'Normal effects' },
  { tab: 'deep', label: 'Deep of Night' },
  { tab: 'groups', label: 'Needs & combos' },
  { tab: 'stacking', label: 'Stacking' },
];

type Run =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; plan: SellPlan; sections: SellSection[]; ms: number }
  | { status: 'error'; message: string };

/** Sell Planner (goal 3): which relics can go, ranked by risk, for a saved config. */
export function SellPlanner() {
  const source = useLoadedFile();
  const character = source.selected;
  const pool = useMemo<RelicSpec[] | null>(
    () => (character ? (character.relics ?? relicsOfBuilds(character.builds)) : null),
    [character],
  );
  const owned = useMemo(() => (pool ? ownedCounts(pool) : null), [pool]);

  const [config, setConfig] = useState<SellConfig>(emptyConfig);
  const [configFile, setConfigFile] = useState<{
    name: string;
    handle?: FileSystemFileHandle;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('results');
  const [builder, setBuilderState] = useState<Builder>(() => emptyBuilder());
  const setBuilder = useCallback((fn: (b: Builder) => Builder) => setBuilderState(fn), []);

  const update: ConfigUpdate = useCallback((fn) => {
    setConfig((c) => fn(c));
    setDirty(true);
  }, []);

  const defaults = useMemo(() => buildEffectIndex(), []);
  const index = useMemo(
    () => buildEffectIndex(effectiveRules(config.effectRules)),
    [config.effectRules],
  );

  // Plan in the worker, shortly after the last change.
  const [run, setRun] = useState<Run>({ status: 'idle' });
  useEffect(() => {
    if (!pool) {
      setRun({ status: 'idle' });
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
          if (!cancelled) setRun({ status: 'done', plan, sections, ms });
        })
        .catch((err: unknown) => {
          if (!cancelled) setRun({ status: 'error', message: (err as Error).message });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pool, config]);

  const openConfig = async (file: File) => {
    try {
      const parsed = parseRsp(await file.text());
      setConfig(parsed.config);
      setWarnings(parsed.warnings);
      setConfigFile({ name: file.name });
      setDirty(false);
      setConfigMessage(`Loaded ${file.name}.`);
    } catch (err) {
      setConfigMessage(`Could not load ${file.name}: ${(err as Error).message}`);
    }
  };

  const saveConfig = async (saveAs: boolean) => {
    const text = serializeRsp(config);
    try {
      if (!saveAs && configFile?.handle && (await ensureWritable(configFile.handle))) {
        await writeTextFile(configFile.handle, text);
        setConfigMessage(`Saved ${configFile.name}.`);
      } else {
        const name = configFile?.name ?? 'nightreign-sell-plan.rsp';
        const handle = await saveTextFile(
          text,
          name.endsWith('.rsp') ? name : `${name}.rsp`,
          RSP_FILE_TYPE,
        );
        const saved = handle?.name ?? name;
        setConfigFile(handle ? { name: saved, handle } : { name: saved });
        setConfigMessage(`Saved ${saved}.`);
      }
      setDirty(false);
    } catch (err) {
      if (!isAbortError(err)) setConfigMessage(`Save failed: ${(err as Error).message}`);
    }
  };

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

  const needCount = config.groups.reduce((n, g) => n + g.needs.length, 0);

  return (
    <>
      <p className="intro">
        Find relics you can sell. Load your <b>save</b> (or a builds JSON) and a <b>sell plan</b>{' '}
        (.rsp) saying what to keep, or build one here: give effects an importance and copies in the{' '}
        <b>Normal</b> / <b>Deep of Night</b> tabs and add combos (effects wanted on the same relic)
        in <b>Needs &amp; combos</b>. Effects you don't configure are worth nothing. A relic is
        suggested only if everything your plan wants is still there without it, and each one says
        why: nothing on it is wanted, a relic you keep covers it, or enough copies are left. Selling
        everything above any line is safe in the order shown. Save the plan to reuse it after your
        next runs.
      </p>
      <section className="loaders loaders--pair">
        <FileSourcePicker source={source} label="Relics: save or builds JSON" testId="sell" />
        <div className="file-source">
          <FileDrop
            label="Open sell plan (.rsp)"
            hint="A plan saved from this page. Optional: you can start from scratch."
            accept=".rsp,.json,application/json"
            onFile={(file) => void openConfig(file)}
            testId="rsp-input"
          />
          <div className="toolbar">
            <span data-testid="rsp-status">
              {configFile ? configFile.name : 'Unsaved plan'}
              {dirty ? ' (changed)' : ''} · {needCount} need(s)
            </span>
            <div className="toolbar__spacer" />
            <button type="button" onClick={() => void saveConfig(false)} data-testid="rsp-save">
              Save plan
            </button>
            <button type="button" className="button--quiet" onClick={() => void saveConfig(true)}>
              Save as…
            </button>
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                setConfig(emptyConfig());
                setConfigFile(null);
                setWarnings([]);
                setDirty(false);
                setConfigMessage('Started a new plan.');
              }}
            >
              New
            </button>
          </div>
          {configMessage && (
            <span className="message" data-testid="rsp-message">
              {configMessage}
            </span>
          )}
          {warnings.map((w) => (
            <span key={w} className="warning">
              {w}
            </span>
          ))}
        </div>
      </section>

      {character && !character.relics && (
        <p className="warning" data-testid="sell-pool-warning">
          This builds file has no relic inventory (it was exported by an older version), so only the
          relics used in its builds are listed. Load the save, or export the builds again.
        </p>
      )}

      <nav className="tabs" aria-label="Sell planner sections">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            className="tabs__item"
            aria-pressed={tab === t.tab}
            data-testid={`tab-${t.tab}`}
            onClick={() => setTab(t.tab)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'results' && (
        <section className="builds-section">
          {!pool && <p className="muted">Load a save or builds JSON to see what you can sell.</p>}
          {run.status === 'running' && (
            <ProgressBar label="Planning…" value={run.progress} testId="sell-progress" />
          )}
          {run.status === 'error' && <p className="error">{run.message}</p>}
          {run.status === 'done' && (
            <>
              <div className="toolbar">
                <span data-testid="sell-summary">
                  {run.plan.sell.reduce((n, e) => n + e.count, 0)} relic(s) can be sold,{' '}
                  {run.plan.kept.reduce((n, k) => n + k.count, 0)} kept, {run.plan.unsellable} can't
                  be sold ({Math.round(run.ms)} ms).
                </span>
                {needCount === 0 && (
                  <span className="warning">
                    Your plan is empty, so everything counts as safe to sell.
                  </span>
                )}
                <div className="toolbar__spacer" />
                {exportMessage && (
                  <span className="message" data-testid="message">
                    {exportMessage}
                  </span>
                )}
                <button type="button" onClick={exportCsv} disabled={run.plan.sell.length === 0}>
                  Export CSV
                </button>
              </div>
              <ResultsView
                plan={run.plan}
                owned={owned}
                sections={run.sections}
                onCopyToBuilder={(spec) => {
                  setBuilder((b) => builderFromRelic(spec, index, b.focus + 1));
                  setTab('groups');
                }}
              />
            </>
          )}
        </section>
      )}
      {(tab === 'normal' || tab === 'deep') && (
        <EffectsTab
          key={tab}
          kind={tab}
          config={config}
          update={update}
          index={index}
          owned={owned}
        />
      )}
      {tab === 'groups' && (
        <GroupsTab
          config={config}
          update={update}
          index={index}
          character={character}
          builder={builder}
          setBuilder={setBuilder}
        />
      )}
      {tab === 'stacking' && (
        <StackingTab config={config} update={update} index={index} defaults={defaults} />
      )}
    </>
  );
}
