import type { CharacterSlot, Relic, SaveFile } from '../save/types.ts';

/**
 * A relic described by what it IS, not by where it lives. Handles are only
 * meaningful inside one save; a spec can be looked for in any save, which is
 * what comparing two saves needs.
 */
export interface RelicSpec {
  itemId: number;
  effects: Relic['effects'];
  curses: Relic['curses'];
}

export interface Build {
  /** Character slot the build came from. */
  character: string;
  heroId: number;
  name: string;
  vesselId: number;
  /** Slots 0-2 normal relics, 3-5 deep relics; null = empty slot. */
  relics: (RelicSpec | null)[];
}

export const toSpec = (relic: Relic): RelicSpec => ({
  itemId: relic.itemId,
  effects: [...relic.effects],
  curses: [...relic.curses],
});

/** Stable string key for a spec: two relics with the same key are interchangeable. */
export const specKey = (spec: RelicSpec): string =>
  `${spec.itemId}|${spec.effects.map((e) => e ?? '-').join(',')}|${spec.curses
    .map((c) => c ?? '-')
    .join(',')}`;

export function extractCharacterBuilds(character: CharacterSlot): Build[] {
  const byHandle = new Map(character.relics.map((r) => [r.handle, r]));
  return [...character.presets]
    .sort((a, b) => a.heroId - b.heroId || a.recency - b.recency)
    .map((preset) => ({
      character: character.name,
      heroId: preset.heroId,
      name: preset.name,
      vesselId: preset.vesselId,
      relics: preset.relics.map((handle) => {
        if (handle === null) return null;
        const relic = byHandle.get(handle);
        return relic ? toSpec(relic) : null;
      }),
    }));
}

export function extractBuilds(save: SaveFile): Build[] {
  return save.characters.flatMap(extractCharacterBuilds);
}
