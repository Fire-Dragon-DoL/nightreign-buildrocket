/// <reference lib="webworker" />
import { loadBuildsOrSave } from '../core/builds/load-file.ts';
import { findMissingRelics } from '../core/compare/missing.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

/**
 * Runs all heavy save processing off the UI thread. Bundled inline into the
 * single HTML file (see client.ts), so it works on file://.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

/** At most this many progress messages per request, so the UI is not flooded. */
const PROGRESS_STEPS = 50;

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  const { id } = request;
  const start = performance.now();
  switch (request.type) {
    case 'loadFile': {
      const file = await loadBuildsOrSave(new Uint8Array(request.bytes));
      return { id, ok: true, type: 'loadFile', file, ms: performance.now() - start };
    }
    case 'findMissing': {
      let lastStep = -1;
      const result = findMissingRelics(request.builds, request.pool, (done, total) => {
        const step = Math.floor((done / total) * PROGRESS_STEPS);
        if (step === lastStep) return;
        lastStep = step;
        scope.postMessage({ id, ok: true, type: 'progress', done, total } as WorkerResponse);
      });
      return { id, ok: true, type: 'findMissing', result, ms: performance.now() - start };
    }
  }
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse;
  try {
    response = await handle(event.data);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    response = {
      id: event.data.id,
      ok: false,
      error: { name: error.name, message: error.message },
    };
  }
  scope.postMessage(response);
};
