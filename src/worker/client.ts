// `?worker&inline` makes Vite embed the worker in the bundle and start it from
// a Blob URL (falling back to a data: URL), which is what lets it run when
// the app is opened over file://, where loading a worker script file is blocked.

import type { Build, RelicSpec } from '../core/builds/builds.ts';
import type { LoadedFile } from '../core/builds/load-file.ts';
import type { MissingRelicsResult } from '../core/compare/missing.ts';
import type { PicksResult } from '../core/picks/picks.ts';
import type { SellConfig } from '../core/sell/config.ts';
import type { SellPlan } from '../core/sell/planner.ts';
import type { SellSection } from '../core/sell/sections.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';
import SaveWorker from './save-worker.ts?worker&inline';

export class WorkerError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export type Progress = (done: number, total: number) => void;

/** Any response except progress: it settles the request. */
type Final = Exclude<WorkerResponse, { type: 'progress' }>;
type Success<K extends WorkerRequest['type']> = Extract<Final, { ok: true; type: K }>;

interface Pending {
  resolve: (r: Final) => void;
  reject: (e: Error) => void;
  onProgress: Progress | undefined;
}

/** A request before it gets its id (distributes over the union). */
type NewRequest<R = WorkerRequest> = R extends WorkerRequest ? Omit<R, 'id'> : never;

/** Promise-based wrapper around the save worker. One worker, many requests. */
export class SaveWorkerClient {
  #worker: Worker | undefined;
  #nextId = 1;
  #pending = new Map<number, Pending>();

  #getWorker(): Worker {
    if (!this.#worker) {
      const worker = new SaveWorker();
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        const pending = this.#pending.get(message.id);
        if (message.ok && message.type === 'progress') {
          pending?.onProgress?.(message.done, message.total);
          return;
        }
        this.#pending.delete(message.id);
        pending?.resolve(message);
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

  async #send<K extends WorkerRequest['type']>(
    request: NewRequest & { type: K },
    transfer: Transferable[] = [],
    onProgress?: Progress,
  ): Promise<Success<K>> {
    const id = this.#nextId++;
    const response = await new Promise<Final>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, onProgress });
      this.#getWorker().postMessage({ ...request, id } as WorkerRequest, transfer);
    });
    if (!response.ok) throw new WorkerError(response.error.name, response.error.message);
    return response as Success<K>;
  }

  /**
   * Read a save or a builds JSON in the worker. The buffer is transferred
   * (not copied), so the caller must not use it afterwards.
   */
  async loadFile(bytes: ArrayBuffer): Promise<{ file: LoadedFile; ms: number }> {
    const { file, ms } = await this.#send({ type: 'loadFile', bytes }, [bytes]);
    return { file, ms };
  }

  /** Which relics `pool` lacks to make `builds` (see core/compare). */
  async findMissing(
    builds: Build[],
    pool: RelicSpec[],
    onProgress?: Progress,
  ): Promise<{ result: MissingRelicsResult; ms: number }> {
    const { result, ms } = await this.#send({ type: 'findMissing', builds, pool }, [], onProgress);
    return { result, ms };
  }

  /** Rank `pool`'s sellable relics by risk for `config` (see core/sell). */
  async planSell(
    pool: RelicSpec[],
    config: SellConfig,
    onProgress?: Progress,
  ): Promise<{ plan: SellPlan; sections: SellSection[]; ms: number }> {
    const { plan, sections, ms } = await this.#send(
      { type: 'planSell', pool, config },
      [],
      onProgress,
    );
    return { plan, sections, ms };
  }

  /** Relics of `secondary` that fill what `main` lacks for `config` (see core/picks). */
  async pickSecondary(
    main: RelicSpec[],
    secondary: RelicSpec[],
    config: SellConfig,
    onProgress?: Progress,
  ): Promise<{ result: PicksResult; ms: number }> {
    const { result, ms } = await this.#send(
      { type: 'pickSecondary', main, secondary, config },
      [],
      onProgress,
    );
    return { result, ms };
  }

  terminate(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
  }
}

export const saveWorker = new SaveWorkerClient();
