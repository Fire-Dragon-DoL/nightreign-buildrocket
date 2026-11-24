import { useState, useSyncExternalStore } from 'react';
import type { CharacterData } from '../core/builds/characters.ts';
import type { LoadedFile } from '../core/builds/load-file.ts';
import { saveWorker } from '../worker/client.ts';

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'loaded'; fileName: string; file: LoadedFile; ms: number }
  | { status: 'error'; fileName: string; message: string };

export interface FileSource {
  state: LoadState;
  load: (file: File) => Promise<void>;
  characters: CharacterData[];
  /** The picked character (the first one until the user picks another). */
  selected: CharacterData | undefined;
  select: (key: string) => void;
}

/**
 * A save or builds file (.jsl2 / .json) loaded through the worker (they are interchangeable),
 * and which of its characters is picked. Lives outside React, so it can be shared.
 */
export interface FileSourceStore {
  get: () => FileSource;
  subscribe: (listener: () => void) => () => void;
}

export function createFileSource(): FileSourceStore {
  let state: LoadState = { status: 'idle' };
  let selectedKey: string | null = null;
  let latest = 0;
  const listeners = new Set<() => void>();

  const snapshot = (): FileSource => {
    const characters = state.status === 'loaded' ? state.file.characters : [];
    const selected = characters.find((c) => c.key === selectedKey) ?? characters[0];
    return { state, load, characters, selected, select };
  };
  let current: FileSource;
  const emit = () => {
    current = snapshot();
    for (const l of listeners) l();
  };

  async function load(file: File): Promise<void> {
    const run = ++latest;
    state = { status: 'loading', fileName: file.name };
    selectedKey = null;
    emit();
    try {
      const { file: loaded, ms } = await saveWorker.loadFile(await file.arrayBuffer());
      if (run !== latest) return;
      state = { status: 'loaded', fileName: file.name, file: loaded, ms };
    } catch (err) {
      if (run !== latest) return;
      state = {
        status: 'error',
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    emit();
  }

  function select(key: string): void {
    selectedKey = key;
    emit();
  }

  current = snapshot();
  return {
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useFileSource = (store: FileSourceStore): FileSource =>
  useSyncExternalStore(store.subscribe, store.get);

/** A file source of this component only (e.g. a page's Secondary Save File). */
export function useLoadedFile(): FileSource {
  const [store] = useState(createFileSource);
  return useFileSource(store);
}

/**
 * The Primary Save File: one save or builds file for the whole app, loaded from the header and
 * used by every page (Builds Viewer, Relics Diff, Sell Planner, Secondary Pool Picks, Needs Config).
 */
export const primarySource = createFileSource();
export const usePrimarySource = (): FileSource => useFileSource(primarySource);
