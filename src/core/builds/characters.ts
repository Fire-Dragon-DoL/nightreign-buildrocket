import type { SaveFile } from '../save/types.ts';
import { type Build, extractCharacterBuilds, type RelicSpec, toSpec } from './builds.ts';
import type { Inventory, ParsedBuilds } from './builds-json.ts';

/**
 * One character, wherever it came from (a save slot or a builds JSON file):
 * its builds and, when known, every relic it owns. This is what the UI works
 * with, so saves and builds files are interchangeable everywhere.
 */
export interface CharacterData {
  /** Unique within one loaded file. */
  key: string;
  /** For pickers, e.g. "Tarnished (slot 2)". */
  label: string;
  /** The in-game character name (what builds carry in `Build.character`). */
  name: string;
  builds: Build[];
  /** Owned relics; null when the file does not say (builds JSON without inventories). */
  relics: RelicSpec[] | null;
}

export function charactersFromSave(save: SaveFile): CharacterData[] {
  return save.characters.map((c) => ({
    key: `slot:${c.index}`,
    label: `${c.name} (slot ${c.index + 1})`,
    name: c.name,
    builds: extractCharacterBuilds(c),
    relics: c.relics.map(toSpec),
  }));
}

/** Characters of a builds file, in first-seen order (builds first, then inventories). */
export function charactersFromDocument(doc: ParsedBuilds): CharacterData[] {
  const byName = new Map<string, CharacterData>();
  const get = (name: string) => {
    let character = byName.get(name);
    if (!character) {
      character = {
        key: `json:${name}`,
        label: name || '(unnamed)',
        name,
        builds: [],
        relics: null,
      };
      byName.set(name, character);
    }
    return character;
  };
  for (const build of doc.builds) get(build.character).builds.push(build);
  for (const inventory of doc.inventories) {
    const character = get(inventory.character);
    character.relics = [...(character.relics ?? []), ...inventory.relics];
  }
  return [...byName.values()];
}

/** Inventories to write next to the builds when exporting these characters. */
export const inventoriesOf = (characters: CharacterData[]): Inventory[] =>
  characters.flatMap((c) => (c.relics ? [{ character: c.name, relics: c.relics }] : []));
