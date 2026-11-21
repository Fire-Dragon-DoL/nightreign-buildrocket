/**
 * Builds synthetic, fully valid Nightreign PC saves in memory (BND4 + AES +
 * MD5) so the parser can be tested without anybody's real save file.
 *
 * Written from the layout in src/core/save/format.ts; if the builder and the
 * parser disagree, the real-save test (test/real-save.test.ts) is the judge.
 */
import { writeEntryChecksum } from '../../src/core/save/checksum.ts';
import { encryptEntry } from '../../src/core/save/crypto.ts';
import {
  EMPTY_ID,
  INVENTORY_COUNT_REL_NAME,
  INVENTORY_ENTRY_COUNT,
  INVENTORY_ENTRY_SIZE,
  ITEM_STATE_COUNT,
  ITEM_STATES_OFFSET,
  LOADOUT_CHUNK_ID,
  LOADOUT_REL_INVENTORY_END,
  MURK_REL_NAME,
  NAME_REL_STATES_END,
  PRESET_SIZE,
  SIGS_REL_NAME,
} from '../../src/core/save/format.ts';

// Plain (decrypted, unpadded) entry sizes of a vanilla PC save.
export const SLOT_PLAIN_SIZE = 0x100030 - 16 - 12;
export const PROFILE_PLAIN_SIZE = 0x60030 - 16 - 12;
const SMALL_PLAIN_SIZE = 0x40 - 16 - 12; // entries 11-13 are irrelevant; keep them tiny
const LOADOUT_CHUNK_SIZE = 0x2c00;
const HERO_COUNT = 10;
const UNIVERSAL_VESSELS = 4;
const HERO_VESSELS = 70;
const PRESET_COUNT = 100;

export interface RelicInput {
  handle: number;
  itemId: number;
  effects?: (number | null)[];
  curses?: (number | null)[];
  favorite?: boolean;
  isNew?: boolean;
  acquisitionId?: number;
  /** false = state record only, no inventory entry (a stale / sold relic). */
  owned?: boolean;
}

export interface PresetInput {
  index?: number;
  heroId: number;
  name: string;
  vesselId: number;
  relics: (number | null)[];
  recency?: number;
  timestamp?: bigint;
}

export interface SlotInput {
  name: string;
  playTimeMs?: number;
  murk?: number;
  sigs?: number;
  relics?: RelicInput[];
  /** Extra non-relic item states placed before the relics (exercises variable record sizes). */
  otherItems?: { handle: number; size: number }[];
  presets?: PresetInput[];
  /** heroId -> [presetIndex | null, currentVesselId, relics of the first universal vessel] */
  heroes?: Record<number, { currentPresetIndex?: number | null; currentVesselId?: number }>;
  /** Corrupt the loadout chunk id to simulate an unsupported layout. */
  breakLoadoutChunk?: boolean;
}

const writeUtf16 = (view: DataView, offset: number, text: string, units: number) => {
  for (let i = 0; i < Math.min(text.length, units); i++) {
    view.setUint16(offset + i * 2, text.charCodeAt(i), true);
  }
};

function newEntry(size: number, prefix: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, prefix, true);
  return { bytes, view };
}

export function buildEmptySlot(): Uint8Array {
  const { bytes } = newEntry(SLOT_PLAIN_SIZE, 0x00100010);
  writeEntryChecksum(bytes);
  return bytes;
}

export function buildSlot(input: SlotInput): Uint8Array {
  const { bytes, view } = newEntry(SLOT_PLAIN_SIZE, 0x00100010);
  view.setUint32(0x04, 0x134, true); // slot version
  view.setUint32(0x0c, input.playTimeMs ?? 0, true);

  // Item states
  let cursor = ITEM_STATES_OFFSET;
  let written = 0;
  for (const other of input.otherItems ?? []) {
    view.setUint32(cursor, other.handle, true);
    cursor += other.size;
    written++;
  }
  for (const relic of input.relics ?? []) {
    view.setUint32(cursor, relic.handle, true);
    // The game stores relic item ids with the high bit set (0x80000000 | id).
    view.setUint32(cursor + 0x04, (0x80000000 | relic.itemId) >>> 0, true);
    view.setUint32(cursor + 0x08, (0x80000000 | relic.itemId) >>> 0, true);
    view.setUint32(cursor + 0x0c, EMPTY_ID, true);
    for (let i = 0; i < 3; i++) {
      view.setUint32(cursor + 0x10 + i * 4, relic.effects?.[i] ?? EMPTY_ID, true);
      view.setUint32(cursor + 0x38 + i * 4, relic.curses?.[i] ?? EMPTY_ID, true);
    }
    view.setUint32(cursor + 0x44, EMPTY_ID, true);
    cursor += 80;
    written++;
  }
  cursor += (ITEM_STATE_COUNT - written) * 8; // remaining empty 8-byte states

  // Name and currencies
  const nameOffset = cursor + NAME_REL_STATES_END;
  writeUtf16(view, nameOffset, input.name, 16);
  view.setUint32(nameOffset + SIGS_REL_NAME, input.sigs ?? 0, true);
  view.setUint32(nameOffset + MURK_REL_NAME, input.murk ?? 0, true);

  // Inventory
  const countOffset = nameOffset + INVENTORY_COUNT_REL_NAME;
  const inventoryOffset = countOffset + 4;
  const owned = (input.relics ?? []).filter((r) => r.owned !== false);
  view.setUint32(countOffset, owned.length, true);
  owned.forEach((relic, i) => {
    const base = inventoryOffset + i * INVENTORY_ENTRY_SIZE;
    view.setUint32(base, relic.handle, true);
    view.setUint32(base + 4, 1, true);
    view.setUint32(base + 8, relic.acquisitionId ?? i, true);
    bytes[base + 12] = relic.favorite ? 1 : 0;
    bytes[base + 13] = relic.isNew ? 1 : 0;
  });

  // Loadout chunk
  const chunk =
    inventoryOffset + INVENTORY_ENTRY_COUNT * INVENTORY_ENTRY_SIZE + LOADOUT_REL_INVENTORY_END;
  view.setUint16(chunk, input.breakLoadoutChunk ? 0x1234 : LOADOUT_CHUNK_ID, true);
  view.setUint16(chunk + 2, 3, true);
  view.setUint32(chunk + 4, LOADOUT_CHUNK_SIZE, true);
  view.setUint16(chunk + 8, 3, true);
  view.setUint16(chunk + 0x0a, HERO_COUNT, true);
  view.setUint16(chunk + 0x0c, UNIVERSAL_VESSELS, true);
  view.setUint16(chunk + 0x0e, HERO_VESSELS, true);
  view.setUint16(chunk + 0x10, PRESET_COUNT, true);
  let c = chunk + 0x14;
  for (let h = 1; h <= HERO_COUNT; h++) {
    const hero = input.heroes?.[h];
    bytes[c] = h;
    bytes[c + 1] = hero?.currentPresetIndex ?? 0xff;
    view.setUint32(c + 4, hero?.currentVesselId ?? h * 1000, true);
    c += 8;
    for (let v = 0; v < UNIVERSAL_VESSELS; v++, c += 28) {
      view.setUint32(c, [19000, 19001, 19002, 19010][v] as number, true);
    }
  }
  for (let v = 0; v < HERO_VESSELS; v++, c += 28) {
    view.setUint32(c, (Math.floor(v / 7) + 1) * 1000 + (v % 7), true);
  }
  const rel = c - (chunk + 8);
  const presets = c + ((8 - (rel % 8)) % 8);
  for (let i = 0; i < PRESET_COUNT; i++) {
    view.setUint32(presets + i * PRESET_SIZE + 0x2c, EMPTY_ID, true); // empty preset marker
  }
  (input.presets ?? []).forEach((preset, i) => {
    const base = presets + (preset.index ?? i) * PRESET_SIZE;
    bytes[base] = 1;
    bytes[base + 1] = preset.heroId;
    bytes[base + 3] = preset.recency ?? i;
    writeUtf16(view, base + 4, preset.name, 18);
    view.setUint32(base + 0x2c, preset.vesselId, true);
    for (let s = 0; s < 6; s++) view.setUint32(base + 0x30 + s * 4, preset.relics[s] ?? 0, true);
    view.setBigUint64(base + 0x48, preset.timestamp ?? 0n, true);
  });

  writeEntryChecksum(bytes);
  return bytes;
}

export function buildProfile(steamId: bigint): Uint8Array {
  const { bytes, view } = newEntry(PROFILE_PLAIN_SIZE, 0x00060010);
  view.setBigUint64(0x08, steamId, true);
  writeEntryChecksum(bytes);
  return bytes;
}

/** Assemble 14 plain entries (missing ones are filled with defaults) into an encrypted BND4 file. */
export async function buildSaveFile(
  plain: Partial<Record<number, Uint8Array>>,
  options: { corruptChecksumOf?: number } = {},
): Promise<Uint8Array> {
  const entries: Uint8Array[] = [];
  for (let i = 0; i < 14; i++) {
    let entry = plain[i];
    if (!entry) {
      if (i < 10) entry = buildEmptySlot();
      else if (i === 10) entry = buildProfile(0n);
      else {
        entry = newEntry(SMALL_PLAIN_SIZE, 0x00000010).bytes;
        writeEntryChecksum(entry);
      }
    }
    if (options.corruptChecksumOf === i) {
      entry = entry.slice();
      entry[entry.length - 1] = (entry.at(-1) ?? 0) ^ 0xff;
    }
    const iv = new Uint8Array(16).fill(i + 1);
    entries.push(await encryptEntry(iv, entry));
  }

  const headerSize = 0x40;
  const tableSize = 14 * 0x20;
  const namesOffset = headerSize + tableSize;
  const nameSize = 26; // "USER_DATA000" + NUL in UTF-16
  let dataOffset = namesOffset + 14 * nameSize;
  dataOffset += (16 - (dataOffset % 16)) % 16;
  const total = dataOffset + entries.reduce((sum, e) => sum + e.length, 0);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x42, 0x4e, 0x44, 0x34]); // "BND4"
  view.setUint32(0x08, 0x00010000, true);
  view.setUint32(0x0c, 14, true);
  view.setBigUint64(0x10, 0x40n, true);
  out.set(new TextEncoder().encode('00000001'), 0x18);
  view.setBigUint64(0x20, 0x20n, true);
  view.setBigUint64(0x28, BigInt(dataOffset), true);
  view.setUint8(0x30, 1);
  view.setUint8(0x31, 0x20);

  let offset = dataOffset;
  entries.forEach((entry, i) => {
    const base = headerSize + i * 0x20;
    view.setUint32(base, 0x40, true);
    view.setInt32(base + 4, -1, true);
    view.setBigUint64(base + 8, BigInt(entry.length), true);
    view.setUint32(base + 0x10, offset, true);
    view.setUint32(base + 0x14, namesOffset + i * nameSize, true);
    writeUtf16(view, namesOffset + i * nameSize, `USER_DATA${String(i).padStart(3, '0')}`, 12);
    out.set(entry, offset);
    offset += entry.length;
  });
  return out;
}
