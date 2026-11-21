/**
 * Plain-data model of a parsed save. Everything here must be structured-clone
 * and JSON friendly (no bigint, no class instances) because it crosses the
 * worker boundary and is exported to JSON.
 */

export type Platform = 'pc';

/** gaitem handle of a relic instance (u32, high nibble 0xC). Unique within a character slot. */
export type RelicHandle = number;

export interface Relic {
  handle: RelicHandle;
  /** Relic item id (EquipParamAntique row), with the type bits stripped. */
  itemId: number;
  /** Up to 3 effect ids (AttachEffectParam rows); null where the slot is empty. */
  effects: [number | null, number | null, number | null];
  /** Curse paired with the effect at the same index (deep relics only). */
  curses: [number | null, number | null, number | null];
  favorite: boolean;
  isNew: boolean;
  /** Increases in acquisition order. */
  acquisitionId: number;
}

/** Six relic slots: 0-2 normal relics, 3-5 deep relics. */
export type RelicSlots = [
  RelicHandle | null,
  RelicHandle | null,
  RelicHandle | null,
  RelicHandle | null,
  RelicHandle | null,
  RelicHandle | null,
];

export interface VesselLoadout {
  vesselId: number;
  relics: RelicSlots;
}

export interface HeroLoadout {
  heroId: number;
  /** Index into `CharacterSlot.presets`' `index` field, or null. */
  currentPresetIndex: number | null;
  currentVesselId: number;
  vessels: VesselLoadout[];
}

/** A saved relic preset ("build") as shown in the game's Relic Rites menu. */
export interface Preset {
  /** Position in the save's preset array. */
  index: number;
  heroId: number;
  name: string;
  vesselId: number;
  relics: RelicSlots;
  /** 0 = most recently created. */
  recency: number;
  /** Raw Windows FILETIME (in the game's local time), as a decimal string. */
  timestamp: string;
}

export interface CharacterSlot {
  index: number;
  name: string;
  playTimeMs: number;
  murk: number;
  sigs: number;
  /** Relics currently owned (present in the inventory). */
  relics: Relic[];
  heroes: HeroLoadout[];
  presets: Preset[];
}

export interface SaveFile {
  platform: Platform;
  /** Owner Steam id as a decimal string (empty when not available). */
  steamId: string;
  /** Only non-empty character slots. */
  characters: CharacterSlot[];
  /** Entries whose stored MD5 did not match. Empty for a healthy save. */
  checksumMismatches: number[];
}
