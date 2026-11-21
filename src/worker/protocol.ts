import type { Build, RelicSpec } from '../core/builds/builds.ts';
import type { LoadedFile } from '../core/builds/load-file.ts';
import type { MissingRelicsResult } from '../core/compare/missing.ts';
import type { SellConfig } from '../core/sell/config.ts';
import type { SellPlan } from '../core/sell/planner.ts';
import type { SellSection } from '../core/sell/sections.ts';

/** Messages the UI thread sends to the save worker. */
export type WorkerRequest =
  | { id: number; type: 'loadFile'; bytes: ArrayBuffer }
  | { id: number; type: 'findMissing'; builds: Build[]; pool: RelicSpec[] }
  | { id: number; type: 'planSell'; pool: RelicSpec[]; config: SellConfig };

/** Messages the save worker sends back. `progress` may arrive any number of times first. */
export type WorkerResponse =
  | { id: number; ok: true; type: 'progress'; done: number; total: number }
  | { id: number; ok: true; type: 'loadFile'; file: LoadedFile; ms: number }
  | { id: number; ok: true; type: 'findMissing'; result: MissingRelicsResult; ms: number }
  | {
      id: number;
      ok: true;
      type: 'planSell';
      plan: SellPlan;
      sections: SellSection[];
      ms: number;
    }
  | { id: number; ok: false; error: { name: string; message: string } };
