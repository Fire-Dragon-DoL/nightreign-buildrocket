/**
 * The relic needs plan (.rnp) open in the app. One plan for every page: Needs Config edits it, the
 * Sell Planner and Secondary Pool Picks use it. Kept in memory; saved to files on request.
 */
import { useSyncExternalStore } from 'react';
import { emptyConfig, type SellConfig } from '../../core/sell/config.ts';
import { parseRnp } from '../../core/sell/rnp.ts';
import { isAbortError } from '../../storage/files.ts';
import type { ConfigUpdate } from '../sell/configEdit.ts';
import { setUnsaved } from '../unsaved.ts';
import { type PlanFile, savePlan } from './planFile.ts';

export interface PlanState {
  config: SellConfig;
  /** The file it was opened from or last saved to (null: never saved). */
  file: PlanFile | null;
  dirty: boolean;
  /** Notes from loading it (unknown ids, aliases). */
  warnings: string[];
  /** Last thing that happened (loaded, saved, failed). */
  message: string | null;
}

let state: PlanState = {
  config: emptyConfig(),
  file: null,
  dirty: false,
  warnings: [],
  message: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<PlanState>): void {
  state = { ...state, ...patch };
  setUnsaved('plan', state.dirty);
  for (const l of listeners) l();
}

export const getPlan = (): PlanState => state;

/** Change the plan (marks it changed). */
export const updatePlan: ConfigUpdate = (fn) => set({ config: fn(state.config), dirty: true });

const confirmDiscard = (what: string) =>
  !state.dirty || window.confirm(`Your plan has unsaved changes. ${what} anyway?`);

/** Open a plan file (asks first if the current plan has unsaved changes). */
export async function openPlan(file: File, handle?: FileSystemFileHandle): Promise<void> {
  if (!confirmDiscard('Open another plan')) return;
  try {
    const parsed = parseRnp(await file.text());
    set({
      config: parsed.config,
      file: handle ? { name: file.name, handle } : { name: file.name },
      dirty: false,
      warnings: parsed.warnings,
      message: `Loaded ${file.name}.`,
    });
  } catch (err) {
    set({ message: `Could not load ${file.name}: ${(err as Error).message}` });
  }
}

/** Save: to the plan's file when possible, otherwise (and for Save as) ask where. */
export async function saveCurrentPlan(saveAs: boolean): Promise<void> {
  const config = state.config;
  try {
    const saved = await savePlan(config, state.file, saveAs);
    // Changes made while the picker was open stay unsaved.
    set({ file: saved, dirty: state.config !== config, message: `Saved ${saved.name}.` });
  } catch (err) {
    if (!isAbortError(err)) set({ message: `Save failed: ${(err as Error).message}` });
  }
}

/** Start an empty plan (asks first if the current one has unsaved changes). */
export function newPlan(): void {
  if (!confirmDiscard('Start a new one')) return;
  set({
    config: emptyConfig(),
    file: null,
    dirty: false,
    warnings: [],
    message: 'Started a new plan.',
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The open plan; re-renders when it changes. */
export const usePlan = (): PlanState => useSyncExternalStore(subscribe, getPlan);

export const needCount = (config: SellConfig): number =>
  config.groups.reduce((n, g) => n + g.needs.length, 0);
