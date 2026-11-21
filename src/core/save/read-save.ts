import type { ContainerReader } from './container.ts';
import { SaveFormatError } from './errors.ts';
import { CHARACTER_SLOT_COUNT, PROFILE_ENTRY_INDEX } from './format.ts';
import { pcContainer } from './pc-container.ts';
import { parseProfile } from './profile.ts';
import { parseCharacterSlot } from './slot.ts';
import type { CharacterSlot, SaveFile } from './types.ts';

/** Known containers, tried in order. Add PlayStation etc. here. */
const CONTAINERS: readonly ContainerReader[] = [pcContainer];

export function detectContainer(bytes: Uint8Array): ContainerReader | undefined {
  return CONTAINERS.find((c) => c.detect(bytes));
}

const ENTRIES_NEEDED = [
  ...Array.from({ length: CHARACTER_SLOT_COUNT }, (_, i) => i),
  PROFILE_ENTRY_INDEX,
];

/**
 * Parse a Nightreign save file (NR0000.sl2 / NR0000.co2).
 * Pure: no DOM access, safe to run in a worker or in Node.
 */
export async function readSaveFile(bytes: Uint8Array): Promise<SaveFile> {
  const container = detectContainer(bytes);
  if (!container) {
    throw new SaveFormatError('Unrecognised file: this is not a Nightreign PC save.');
  }
  const entries = await container.readEntries(bytes, ENTRIES_NEEDED);

  const characters: CharacterSlot[] = [];
  let steamId = '';
  for (const entry of entries) {
    if (entry.index === PROFILE_ENTRY_INDEX) {
      steamId = parseProfile(entry.data).steamId;
      continue;
    }
    const slot = parseCharacterSlot(entry.data, entry.index);
    if (slot) characters.push(slot);
  }

  return {
    platform: container.platform,
    steamId,
    characters,
    checksumMismatches: entries.filter((e) => !e.checksumOk).map((e) => e.index),
  };
}
