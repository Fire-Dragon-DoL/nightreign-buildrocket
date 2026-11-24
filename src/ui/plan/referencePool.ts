/**
 * The relics Needs Config counts ("owned per color") and seeds builds from: the pool loaded in the
 * Sell Planner, else the Relic Pool of Secondary Pool Picks. Pages publish theirs; in memory only.
 */
import { useSyncExternalStore } from 'react';
import type { CharacterData } from '../../core/builds/characters.ts';

export type PoolSource = 'sell' | 'picks';

export const POOL_SOURCE_LABELS: Record<PoolSource, string> = {
  sell: 'Sell Planner',
  picks: 'Secondary Pool Picks (Relic Pool)',
};

const ORDER: PoolSource[] = ['sell', 'picks'];
const pools = new Map<PoolSource, CharacterData>();
let current: { source: PoolSource; character: CharacterData } | null = null;
const listeners = new Set<() => void>();

export function publishPool(source: PoolSource, character: CharacterData | undefined): void {
  if (character) pools.set(source, character);
  else pools.delete(source);
  const first = ORDER.find((s) => pools.has(s));
  const next = first ? { source: first, character: pools.get(first) as CharacterData } : null;
  if (next?.source === current?.source && next?.character === current?.character) return;
  current = next;
  for (const l of listeners) l();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useReferencePool = () => useSyncExternalStore(subscribe, () => current);
