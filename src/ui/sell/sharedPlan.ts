import { useSyncExternalStore } from 'react';
import { emptyConfig, type SellConfig } from '../../core/sell/config.ts';

/** The plan open in the Sell Planner, shared with pages that use it (in memory only). */
export interface SharedPlan {
  config: SellConfig;
  /** File name, null when never saved. */
  name: string | null;
  dirty: boolean;
}

let current: SharedPlan = { config: emptyConfig(), name: null, dirty: false };
const listeners = new Set<() => void>();

export function publishSellPlan(plan: SharedPlan): void {
  current = plan;
  for (const l of listeners) l();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The Sell Planner's current plan; re-renders when it changes. */
export const useSellPlannerPlan = (): SharedPlan => useSyncExternalStore(subscribe, () => current);
