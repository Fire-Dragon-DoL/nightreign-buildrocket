import { u8, u16, u32, u64, utf16, viewOf } from '../binary/bytes.ts';
import { SaveFormatError } from './errors.ts';
import {
  EMPTY_ID,
  INVENTORY_COUNT_REL_NAME,
  INVENTORY_ENTRY_COUNT,
  INVENTORY_ENTRY_SIZE,
  ITEM_ID_MASK,
  ITEM_STATE_COUNT,
  ITEM_STATE_SIZE,
  ITEM_STATES_OFFSET,
  ITEM_TYPE_MASK,
  ItemType,
  LOADOUT_CHUNK_ID,
  LOADOUT_HEADER_SIZE,
  LOADOUT_REL_INVENTORY_END,
  MURK_REL_NAME,
  NAME_REL_STATES_END,
  NAME_UNITS,
  NO_PRESET,
  Preset as P,
  PRESET_NAME_UNITS,
  PRESET_SIZE,
  RelicState as R,
  SIGS_REL_NAME,
  SLOT_PLAY_TIME_OFFSET,
  SLOT_VERSION_OFFSET,
  VESSEL_RELIC_SLOTS,
  VESSEL_SIZE,
} from './format.ts';
import type {
  CharacterSlot,
  HeroLoadout,
  Preset,
  Relic,
  RelicSlots,
  VesselLoadout,
} from './types.ts';

interface RelicStateRecord {
  itemId: number;
  effects: Relic['effects'];
  curses: Relic['curses'];
}

const orNull = (id: number): number | null => (id === EMPTY_ID ? null : id);
const handleOrNull = (h: number): number | null => (h === 0 || h === EMPTY_ID ? null : h);

/** An unused character slot has a zero version and nothing else. */
export function isEmptySlot(data: Uint8Array): boolean {
  return u32(viewOf(data), SLOT_VERSION_OFFSET) === 0;
}

/**
 * Parse a decrypted character slot entry (entries 0-9).
 * Returns null for an unused slot.
 */
export function parseCharacterSlot(data: Uint8Array, index: number): CharacterSlot | null {
  if (isEmptySlot(data)) return null;
  const view = viewOf(data);

  // 1. Item states: a variable-size record per gaitem. Relic records carry the effects.
  const states = new Map<number, RelicStateRecord>();
  let cursor = ITEM_STATES_OFFSET;
  for (let i = 0; i < ITEM_STATE_COUNT; i++) {
    const handle = u32(view, cursor);
    const type = (handle & ITEM_TYPE_MASK) >>> 0;
    if (type === ItemType.Relic) {
      states.set(handle, {
        itemId: u32(view, cursor + R.itemId) & ITEM_ID_MASK,
        effects: [
          orNull(u32(view, cursor + R.effects[0])),
          orNull(u32(view, cursor + R.effects[1])),
          orNull(u32(view, cursor + R.effects[2])),
        ],
        curses: [
          orNull(u32(view, cursor + R.curses[0])),
          orNull(u32(view, cursor + R.curses[1])),
          orNull(u32(view, cursor + R.curses[2])),
        ],
      });
    }
    cursor += ITEM_STATE_SIZE[type] ?? 8;
  }

  // 2. Name and currencies sit right after the states.
  const nameOffset = cursor + NAME_REL_STATES_END;
  const name = utf16(data, nameOffset, NAME_UNITS);
  const sigs = u32(view, nameOffset + SIGS_REL_NAME);
  const murk = u32(view, nameOffset + MURK_REL_NAME);

  // 3. Inventory: which gaitems the character owns. A relic state with no
  //    inventory entry is stale (e.g. a sold relic) and is ignored.
  const inventoryOffset = nameOffset + INVENTORY_COUNT_REL_NAME + 4;
  const relics: Relic[] = [];
  for (let i = 0; i < INVENTORY_ENTRY_COUNT; i++) {
    const base = inventoryOffset + i * INVENTORY_ENTRY_SIZE;
    const handle = u32(view, base);
    if ((handle & ITEM_TYPE_MASK) >>> 0 !== ItemType.Relic) continue;
    const state = states.get(handle);
    if (!state) continue;
    relics.push({
      handle,
      itemId: state.itemId,
      effects: state.effects,
      curses: state.curses,
      acquisitionId: u32(view, base + 8),
      favorite: u8(view, base + 12) !== 0,
      isNew: u8(view, base + 13) !== 0,
    });
  }

  // 4. Relic loadout chunk: equipped vessels per hero + saved presets.
  const inventoryEnd = inventoryOffset + INVENTORY_ENTRY_COUNT * INVENTORY_ENTRY_SIZE;
  const { heroes, presets } = parseLoadoutChunk(data, inventoryEnd + LOADOUT_REL_INVENTORY_END);

  return {
    index,
    name,
    playTimeMs: u32(view, SLOT_PLAY_TIME_OFFSET),
    murk,
    sigs,
    relics,
    heroes,
    presets,
  };
}

function readRelicSlots(view: DataView, offset: number): RelicSlots {
  const slots: (number | null)[] = [];
  for (let i = 0; i < VESSEL_RELIC_SLOTS; i++) slots.push(handleOrNull(u32(view, offset + i * 4)));
  return slots as RelicSlots;
}

function readVessel(view: DataView, offset: number): VesselLoadout {
  return { vesselId: u32(view, offset), relics: readRelicSlots(view, offset + 4) };
}

function parseLoadoutChunk(
  data: Uint8Array,
  offset: number,
): { heroes: HeroLoadout[]; presets: Preset[] } {
  const view = viewOf(data);
  if (offset + LOADOUT_HEADER_SIZE > data.length || u16(view, offset) !== LOADOUT_CHUNK_ID) {
    // The chunk sits at a fixed distance from the inventory; if it is not
    // there, every offset above was wrong too (new game patch?).
    throw new SaveFormatError(
      'Relic loadout chunk not found where expected; this save layout is not supported.',
    );
  }
  const chunkSize = u32(view, offset + 4);
  const payload = offset + 8;
  const heroCount = u16(view, offset + 0x0a);
  const universalCount = u16(view, offset + 0x0c);
  const heroVesselCount = u16(view, offset + 0x0e);
  const presetCount = u16(view, offset + 0x10);
  if (payload + chunkSize > data.length) {
    throw new SaveFormatError('Relic loadout chunk is larger than the slot.');
  }

  let cursor = offset + LOADOUT_HEADER_SIZE;
  const heroes: HeroLoadout[] = [];
  const heroById = new Map<number, HeroLoadout>();
  for (let h = 0; h < heroCount; h++) {
    const preset = u8(view, cursor + 1);
    const hero: HeroLoadout = {
      heroId: u8(view, cursor),
      currentPresetIndex: preset === NO_PRESET ? null : preset,
      currentVesselId: u32(view, cursor + 4),
      vessels: [],
    };
    cursor += 8;
    for (let v = 0; v < universalCount; v++, cursor += VESSEL_SIZE) {
      hero.vessels.push(readVessel(view, cursor));
    }
    heroes.push(hero);
    heroById.set(hero.heroId, hero);
  }
  // Hero-specific vessels: the thousands digit of the vessel id is the hero.
  for (let v = 0; v < heroVesselCount; v++, cursor += VESSEL_SIZE) {
    const vessel = readVessel(view, cursor);
    heroById.get(Math.floor(vessel.vesselId / 1000))?.vessels.push(vessel);
  }

  // Presets hold a u64, so the array is 8-byte aligned relative to the payload.
  const rel = cursor - payload;
  const presetsStart = cursor + ((8 - (rel % 8)) % 8);
  const room = Math.max(0, payload + chunkSize - presetsStart);
  const presetsThatFit = Math.min(presetCount, Math.floor(room / PRESET_SIZE));

  const presets: Preset[] = [];
  for (let i = 0; i < presetsThatFit; i++) {
    const base = presetsStart + i * PRESET_SIZE;
    const heroId = u8(view, base + P.heroId);
    if (heroId === 0) continue; // empty preset slot
    presets.push({
      index: i,
      heroId,
      name: utf16(data, base + P.name, PRESET_NAME_UNITS),
      vesselId: u32(view, base + P.vesselId),
      relics: readRelicSlots(view, base + P.relics),
      recency: u8(view, base + P.recency),
      timestamp: u64(view, base + P.timestamp).toString(),
    });
  }
  return { heroes, presets };
}
