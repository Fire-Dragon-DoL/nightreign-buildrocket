/**
 * Layout constants of the Elden Ring Nightreign save format.
 *
 * Everything here was checked against a real PC save (patch as of 2026-11).
 * See docs/save-format.md for the full write-up and sources.
 */

/** AES-128-CBC key shared by every PC Nightreign save (same as DS2 / ER Seamless Co-op). */
export const PC_AES_KEY = new Uint8Array([
  0x18, 0xf6, 0x32, 0x66, 0x05, 0xbd, 0x17, 0x8a, 0x55, 0x24, 0x52, 0x3a, 0xc0, 0xa0, 0xc6, 0x09,
]);

// --- BND4 container -----------------------------------------------------------
export const BND4_MAGIC = 'BND4';
export const BND4_HEADER_SIZE = 0x40;
export const BND4_ENTRY_HEADER_SIZE = 0x20;
export const IV_SIZE = 16;

// --- Decrypted entry ----------------------------------------------------------
// A decrypted entry (after PKCS#7 padding is removed) is:
//   [0, 4)          prefix (size marker, e.g. 0x00100010)
//   [4, len - 16)   body
//   [len - 16, len) MD5 of bytes [4, len - 16)
export const ENTRY_PREFIX_SIZE = 4;
export const ENTRY_CHECKSUM_SIZE = 16;

/** Entries 0-9 are character slots, 10 is the global profile. 11-13 are not needed. */
export const CHARACTER_SLOT_COUNT = 10;
export const PROFILE_ENTRY_INDEX = 10;

// --- Character slot -----------------------------------------------------------
export const SLOT_VERSION_OFFSET = 0x04;
export const SLOT_PLAY_TIME_OFFSET = 0x0c;
export const ITEM_STATES_OFFSET = 0x14;
export const ITEM_STATE_COUNT = 5120;

/** High nibble of a gaitem handle tells what kind of item the state describes. */
export const ItemType = {
  None: 0x00000000,
  Weapon: 0x80000000,
  Armor: 0x90000000,
  Goods: 0xb0000000,
  Relic: 0xc0000000,
} as const;
export const ITEM_TYPE_MASK = 0xf0000000;

/** Byte size of an item state record, by item type. Unknown types are 8 bytes. */
export const ITEM_STATE_SIZE: Readonly<Record<number, number>> = {
  [ItemType.None]: 8,
  [ItemType.Weapon]: 88,
  [ItemType.Armor]: 16,
  [ItemType.Goods]: 8,
  [ItemType.Relic]: 80,
};

/** Offsets inside an 80-byte relic state. */
export const RelicState = {
  itemId: 0x04,
  effects: [0x10, 0x14, 0x18],
  curses: [0x38, 0x3c, 0x40],
} as const;
export const ITEM_ID_MASK = 0x00ffffff;
export const EMPTY_ID = 0xffffffff;

/** Offsets relative to the end of the item state array. */
export const NAME_REL_STATES_END = 0x94;
export const NAME_UNITS = 16;
export const SIGS_REL_NAME = -64;
export const MURK_REL_NAME = 52;
export const INVENTORY_COUNT_REL_NAME = 0x5b8;

export const INVENTORY_ENTRY_COUNT = 3065;
export const INVENTORY_ENTRY_SIZE = 14;

/** Relic loadout chunk, relative to the end of the inventory array. */
export const LOADOUT_REL_INVENTORY_END = 0x21a;
export const LOADOUT_CHUNK_ID = 0x00c2;
export const LOADOUT_HEADER_SIZE = 0x14;
export const VESSEL_SIZE = 28;
export const VESSEL_RELIC_SLOTS = 6;
export const PRESET_SIZE = 80;
export const PRESET_NAME_UNITS = 18;
export const NO_PRESET = 0xff;

/** Offsets inside an 80-byte preset ("custom loadout" / build). */
export const Preset = {
  header: 0x00,
  heroId: 0x01,
  recency: 0x03,
  name: 0x04,
  vesselId: 0x2c,
  relics: 0x30,
  timestamp: 0x48,
} as const;

// --- Global profile (entry 10) --------------------------------------------------
export const PROFILE_STEAM_ID_OFFSET = 0x08;
