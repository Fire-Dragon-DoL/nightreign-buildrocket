import { toBuildsDocument } from '../../core/builds/builds-json.ts';
import { type CharacterData, inventoriesOf } from '../../core/builds/characters.ts';
import { BUILDS_FILE_TYPE, saveTextFile } from '../../storage/files.ts';
import { fileSafe } from '../fileSafe.ts';

/** Extension of exported builds files (JSON inside). */
export const BUILDS_EXTENSION = '.jsl2';

/**
 * Save characters' builds and relic inventories as a builds file (.jsl2), which loads anywhere a
 * save does. Returns how many builds were written. Throws AbortError if the user cancels.
 */
export async function exportBuildsFile(
  characters: CharacterData[],
  label: string,
): Promise<number> {
  const builds = characters.flatMap((c) => c.builds);
  const doc = toBuildsDocument(builds, inventoriesOf(characters));
  await saveTextFile(
    JSON.stringify(doc, null, 2),
    `nightreign-builds-${fileSafe(label) || 'export'}${BUILDS_EXTENSION}`,
    BUILDS_FILE_TYPE,
  );
  return builds.length;
}
