import { useCallback, useRef, useState } from 'react';
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
 * Loads a save or a builds JSON through the worker (they are interchangeable)
 * and tracks which of its characters is picked.
 */
export function useLoadedFile(): FileSource {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async (file: File) => {
    const run = ++latest.current;
    setState({ status: 'loading', fileName: file.name });
    setSelectedKey(null);
    try {
      const { file: loaded, ms } = await saveWorker.loadFile(await file.arrayBuffer());
      if (run === latest.current)
        setState({ status: 'loaded', fileName: file.name, file: loaded, ms });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (run === latest.current) setState({ status: 'error', fileName: file.name, message });
    }
  }, []);

  const characters = state.status === 'loaded' ? state.file.characters : [];
  const selected = characters.find((c) => c.key === selectedKey) ?? characters[0];
  return { state, load, characters, selected, select: setSelectedKey };
}
