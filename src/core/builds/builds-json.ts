import { effectName, heroName, relicName, vesselName } from '../catalog/catalog.ts';
import type { Build, RelicSpec } from './builds.ts';

/**
 * On-disk format for exported builds.
 *
 * Version 2 (written): every game id is an object `{ id, name }`. `name` is
 * only there for humans reading the file; it is optional and ignored on
 * import, so files stay valid if names change.
 * Version 1 (read only): plain ids.
 */
export const BUILDS_FORMAT = 'nightreign-buildrocket/builds';

export interface Named {
  id: number;
  name?: string;
}

export interface BuildRelicJson {
  relic: Named;
  effects: (Named | null)[];
  curses: (Named | null)[];
}

export interface BuildJson {
  character: string;
  hero: Named;
  name: string;
  vessel: Named;
  /** Slots 0-2 normal relics, 3-5 deep relics; null = empty slot. */
  relics: (BuildRelicJson | null)[];
}

export interface BuildsDocument {
  format: typeof BUILDS_FORMAT;
  version: 2;
  exportedAt: string;
  builds: BuildJson[];
}

interface BuildsDocumentV1 {
  format: typeof BUILDS_FORMAT;
  version: 1;
  exportedAt: string;
  builds: Build[];
}

const named = (id: number, name: (id: number) => string): Named => ({ id, name: name(id) });
const namedOrNull = (id: number | null, name: (id: number) => string) =>
  id === null ? null : named(id, name);

function relicToJson(relic: RelicSpec): BuildRelicJson {
  return {
    relic: named(relic.itemId, relicName),
    effects: relic.effects.map((id) => namedOrNull(id, effectName)),
    curses: relic.curses.map((id) => namedOrNull(id, effectName)),
  };
}

export function toBuildsDocument(builds: Build[], now = new Date()): BuildsDocument {
  return {
    format: BUILDS_FORMAT,
    version: 2,
    exportedAt: now.toISOString(),
    builds: builds.map((b) => ({
      character: b.character,
      hero: named(b.heroId, heroName),
      name: b.name,
      vessel: named(b.vesselId, vesselName),
      relics: b.relics.map((r) => (r ? relicToJson(r) : null)),
    })),
  };
}

export class BuildsDocumentError extends Error {
  override name = 'BuildsDocumentError';
}

function idOf(value: unknown, what: string): number {
  const id = (value as Named | null)?.id;
  if (typeof id !== 'number') throw new BuildsDocumentError(`Missing id for ${what}.`);
  return id;
}

const idOrNull = (value: unknown, what: string): number | null =>
  value === null ? null : idOf(value, what);

type Triple = [number | null, number | null, number | null];
const triple = (values: unknown, what: string): Triple => {
  const list = Array.isArray(values) ? values : [];
  return [0, 1, 2].map((i) => idOrNull(list[i] ?? null, what)) as Triple;
};

function buildFromJson(b: BuildJson): Build {
  return {
    character: String(b.character ?? ''),
    heroId: idOf(b.hero, 'hero'),
    name: String(b.name ?? ''),
    vesselId: idOf(b.vessel, 'vessel'),
    relics: (b.relics ?? []).map((r) =>
      r
        ? {
            itemId: idOf(r.relic, 'relic'),
            effects: triple(r.effects, 'effect'),
            curses: triple(r.curses, 'curse'),
          }
        : null,
    ),
  };
}

export interface ParsedBuilds {
  exportedAt: string;
  builds: Build[];
}

/** Read a builds file of any supported version into the internal model. */
export function parseBuildsDocument(json: string): ParsedBuilds {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    throw new BuildsDocumentError('Not valid JSON.', { cause });
  }
  const doc = value as Partial<BuildsDocument | BuildsDocumentV1> | null;
  if (doc?.format !== BUILDS_FORMAT) {
    throw new BuildsDocumentError('Not a Nightreign Buildrocket builds file.');
  }
  if (!Array.isArray(doc.builds)) throw new BuildsDocumentError('Missing builds list.');
  const exportedAt = String(doc.exportedAt ?? '');
  if (doc.version === 1) return { exportedAt, builds: doc.builds as Build[] };
  if (doc.version === 2) {
    return { exportedAt, builds: (doc.builds as BuildJson[]).map(buildFromJson) };
  }
  throw new BuildsDocumentError(`Unsupported version ${doc.version}.`);
}
