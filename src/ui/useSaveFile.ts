import { useCallback, useState } from 'react';
import type { SaveFile } from '../core/save/types.ts';
import { saveWorker } from '../worker/client.ts';

export type SaveState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'loaded'; fileName: string; save: SaveFile; ms: number }
  | { status: 'error'; fileName: string; message: string };

/** Loads a save file through the worker and tracks its state. */
export function useSaveFile() {
  const [state, setState] = useState<SaveState>({ status: 'idle' });

  const load = useCallback(async (file: File) => {
    setState({ status: 'loading', fileName: file.name });
    try {
      const { save, ms } = await saveWorker.parseSave(await file.arrayBuffer());
      setState({ status: 'loaded', fileName: file.name, save, ms });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: 'error', fileName: file.name, message });
    }
  }, []);

  return { state, load };
}
