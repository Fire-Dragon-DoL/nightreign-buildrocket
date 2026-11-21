import type { SaveFile } from '../core/save/types.ts';

/** Messages the UI thread sends to the save worker. */
export type WorkerRequest = { id: number; type: 'parseSave'; bytes: ArrayBuffer };

/** Messages the save worker sends back. */
export type WorkerResponse =
  | { id: number; ok: true; type: 'parseSave'; save: SaveFile; ms: number }
  | { id: number; ok: false; error: { name: string; message: string } };
