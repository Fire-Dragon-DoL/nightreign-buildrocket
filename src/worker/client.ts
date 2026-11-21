// `?worker&inline` makes Vite embed the worker in the bundle and start it from
// a Blob URL (falling back to a data: URL), which is what lets it run when
// the app is opened over file://, where loading a worker script file is blocked.

import type { SaveFile } from '../core/save/types.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';
import SaveWorker from './save-worker.ts?worker&inline';

export class WorkerError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export interface ParseResult {
  save: SaveFile;
  ms: number;
}

/** Promise-based wrapper around the save worker. One worker, many requests. */
export class SaveWorkerClient {
  #worker: Worker | undefined;
  #nextId = 1;
  #pending = new Map<
    number,
    { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }
  >();

  #getWorker(): Worker {
    if (!this.#worker) {
      const worker = new SaveWorker();
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const pending = this.#pending.get(event.data.id);
        this.#pending.delete(event.data.id);
        pending?.resolve(event.data);
      };
      worker.onerror = (event) => {
        const error = new Error(event.message || 'Worker crashed');
        for (const p of this.#pending.values()) p.reject(error);
        this.#pending.clear();
        this.#worker = undefined;
      };
      this.#worker = worker;
    }
    return this.#worker;
  }

  /**
   * Parse a save in the worker. The buffer is transferred (not copied), so
   * the caller must not use it afterwards.
   */
  async parseSave(bytes: ArrayBuffer): Promise<ParseResult> {
    const id = this.#nextId++;
    const request: WorkerRequest = { id, type: 'parseSave', bytes };
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#getWorker().postMessage(request, [bytes]);
    });
    if (!response.ok) throw new WorkerError(response.error.name, response.error.message);
    return { save: response.save, ms: response.ms };
  }

  terminate(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
  }
}

export const saveWorker = new SaveWorkerClient();
