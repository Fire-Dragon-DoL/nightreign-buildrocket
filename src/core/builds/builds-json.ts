import type { Build } from './builds.ts';

/** Versioned on-disk format for exported builds. Bump `version` on breaking changes. */
export interface BuildsDocument {
  format: 'nightreign-buildrocket/builds';
  version: 1;
  exportedAt: string;
  builds: Build[];
}

export function toBuildsDocument(builds: Build[], now = new Date()): BuildsDocument {
  return {
    format: 'nightreign-buildrocket/builds',
    version: 1,
    exportedAt: now.toISOString(),
    builds,
  };
}

export class BuildsDocumentError extends Error {
  override name = 'BuildsDocumentError';
}

export function parseBuildsDocument(json: string): BuildsDocument {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    throw new BuildsDocumentError('Not valid JSON.', { cause });
  }
  const doc = value as Partial<BuildsDocument> | null;
  if (doc?.format !== 'nightreign-buildrocket/builds') {
    throw new BuildsDocumentError('Not a Nightreign Buildrocket builds file.');
  }
  if (doc.version !== 1) throw new BuildsDocumentError(`Unsupported version ${doc.version}.`);
  if (!Array.isArray(doc.builds)) throw new BuildsDocumentError('Missing builds list.');
  return doc as BuildsDocument;
}
