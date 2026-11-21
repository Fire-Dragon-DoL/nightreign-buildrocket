/// <reference lib="webworker" />
import { readSaveFile } from '../core/save/read-save.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

/**
 * Runs all heavy save processing off the UI thread. Bundled inline into the
 * single HTML file (see client.ts), so it works on file://.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let response: WorkerResponse;
  try {
    const start = performance.now();
    const save = await readSaveFile(new Uint8Array(request.bytes));
    response = { id: request.id, ok: true, type: 'parseSave', save, ms: performance.now() - start };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    response = { id: request.id, ok: false, error: { name: error.name, message: error.message } };
  }
  scope.postMessage(response);
};
