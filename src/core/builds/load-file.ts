import { SaveFormatError } from '../save/errors.ts';
import { detectContainer, readSaveFile } from '../save/read-save.ts';
import { parseBuildsDocument } from './builds-json.ts';
import { type CharacterData, charactersFromDocument, charactersFromSave } from './characters.ts';

/** A save file or a builds JSON file, reduced to what every feature needs. */
export interface LoadedFile {
  kind: 'save' | 'builds';
  characters: CharacterData[];
  /** Save entries whose checksum did not match (always empty for builds files). */
  checksumMismatches: number[];
}

/** First non-whitespace character is `{` (TextDecoder drops a UTF-8 BOM). */
const looksLikeJson = (bytes: Uint8Array): boolean =>
  new TextDecoder().decode(bytes.subarray(0, 64)).trimStart().startsWith('{');

/**
 * Read either a Nightreign save (NR0000.sl2 / .co2) or a builds JSON file
 * exported by this tool. The kind is detected from the content, not the name.
 */
export async function loadBuildsOrSave(bytes: Uint8Array): Promise<LoadedFile> {
  if (detectContainer(bytes)) {
    const save = await readSaveFile(bytes);
    return {
      kind: 'save',
      characters: charactersFromSave(save),
      checksumMismatches: save.checksumMismatches,
    };
  }
  if (looksLikeJson(bytes)) {
    const doc = parseBuildsDocument(new TextDecoder().decode(bytes));
    return { kind: 'builds', characters: charactersFromDocument(doc), checksumMismatches: [] };
  }
  throw new SaveFormatError(
    'Unrecognised file: this is not a Nightreign PC save or a Buildrocket builds JSON.',
  );
}
