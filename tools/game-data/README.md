# Game data extractor

Generates `data/game/relic_effects_allowlist.json`, `data/game/effect_details.json`
and `data/game/icons.json` from your own copy of Elden Ring Nightreign. Run it
after a game patch.

## What you need

1. `ELDEN RING NIGHTREIGN\Game\regulation.bin` — copy it, nothing to unpack.
2. The game's menu textures and English text, unpacked with UXM (see
   [Unpacking the menu textures](#unpacking-the-menu-textures) below).
3. Python 3.10+ with `pip install cryptography zstandard pillow`.
4. Rust (`cargo`): `dcxtool/` is built automatically on first run.
5. The `regulation.bin` decryption key, in the `NR_REGULATION_KEY` environment
   variable (see below).

## Unpacking the menu textures

The icons live in the game's packed archives, so they must be unpacked first
with [UXM Selective Unpacker](https://github.com/Nordgaren/UXM-Selective-Unpack/releases)
(Windows).

1. **Update UXM's file list first.** UXM only extracts files whose names are in
   its list, and its last release predates The Forsaken Hollows DLC, so it
   misses the DLC icons. Smithbox keeps an up-to-date list; download it over
   UXM's. In PowerShell, from the UXM folder:

   ```powershell
   Copy-Item res\EldenRingNightreignDictionary.txt res\EldenRingNightreignDictionary.txt.bak
   Invoke-WebRequest "https://raw.githubusercontent.com/vawser/Smithbox/main/src/Andre/Andre.Formats/Resources/EldenRingNightreignDictionary.txt" -OutFile res\EldenRingNightreignDictionary.txt
   ```

2. Start UXM, browse to `nightreign.exe`, and **set an output folder** so the
   game folder is not touched.
3. In **View Files** select these files (all in `menu\`), then press **Unpack**.
   **Never press Patch**: a patched game cannot play online (UXM's Restore
   button undoes it).

   | Files                                                         | Content                         |
   | ------------------------------------------------------------- | ------------------------------- |
   | `00_solo_l.tpfbhd`, `00_solo_l.tpfbdt`                        | relic artwork                   |
   | `01_common_l.tpf.dcx`, `01_common_l.sblytbnd.dcx`             | sprite sheets: vessels, effects |
   | `20_solo_dlc01_l.tpfbhd`, `20_solo_dlc01_l.tpfbdt`            | DLC relic artwork               |
   | `21_common_dlc01_l.tpf.dcx`, `21_common_dlc01_l.sblytbnd.dcx` | DLC sprite sheets               |

   Pass the unpacked `menu` folder to `--menu`. The DLC files are optional:
   without them DLC relics and vessels get no icon.

4. Also unpack the English text: every `*.msgbnd.dcx` file in `msg\engus\`
   (at least `item.msgbnd.dcx` and `menu.msgbnd.dcx`, plus their `_dlc01`
   versions if listed). Pass that `engus` folder to `--msg`. It gives the
   official effect names and the in-game relic search filter names.

## The regulation key

`regulation.bin` is encrypted with AES-256-CBC. The key is the same for every
player, but it is deliberately **not stored in this repository**. It is
published by the FromSoftware modding community: open
[`RegulationDecryptor.cs`](https://github.com/soulsmods/SoulsFormatsNEXT/blob/main/SoulsFormats/Utilities/Cryptography/RegulationDecryptor.cs)
in SoulsFormatsNEXT and take the 32 bytes listed for
`RegulationKey.EldenRingNightreign` (not `EldenRing`, which is a different key).

Write them as 64 hex characters, without spaces or `0x`, e.g. for bytes
`0x01, 0xAB, …` → `01AB…`. Then:

```sh
# bash / zsh
export NR_REGULATION_KEY=<64 hex characters>
# PowerShell
$env:NR_REGULATION_KEY = '<64 hex characters>'
```

The extractor stops with a message if the variable is missing, malformed, or
does not decrypt the file (for example after a patch changes the key).

## Run

```sh
python3 tools/game-data/extract.py --regulation path/to/regulation.bin --menu path/to/menu \
    --msg path/to/msg/engus
```

It writes into `data/game/` (change with `--out`) and lists any icon whose
texture it could not find. Without `--menu` no icons are generated; without
`--msg` effect details are written without official names.

It also prints every **alias** it found: two effect ids that apply the same
SpEffects, so they are the same effect in game (for example Wylder's "+1
additional Character Skill use" on The Wylder's Earring and on random relics;
the earring's copy only exists so it can sit next to an effect the random one
excludes). The app treats aliases as one effect. Check the list looks right.

## Formats

- `regulation.bin`: 16-byte IV + AES-256-CBC ciphertext (key from `NR_REGULATION_KEY`),
  decrypting to a DCX container compressed with Zstandard, holding a BND4
  binder of `.param` files.
- DCX: `"DCX\0"` header; big-endian sizes at 0x1C (uncompressed) and 0x20
  (compressed); algorithm name at 0x28 (`ZSTD`, `KRAK` or `DFLT`); payload at 0x4C.
- BND4 / BHF4 binders: entry table at 0x40, 0x24 bytes per entry (u64 size at
  +0x08, u32 data offset at +0x18, u32 UTF-16 name offset at +0x20). A BHF4
  (`.tpfbhd`) is the index of the data in the matching `.tpfbdt`.
- FMG (text, inside `*.msgbnd.dcx` BND4 binders): version byte at 0x02 (2),
  group count s32 at 0x0C, u64 string offset table at 0x18, groups from 0x28
  (16 bytes: offset index, first id, last id, pad), UTF-16LE strings. The
  extractor picks the FMG that names the most effects (and filters).
- PARAM: row count u16 at 0x0A; row headers from 0x40, 24 bytes each (s32 id,
  pad, u64 data offset, u64 name offset). Only the needed fields are read, at
  the fixed offsets listed in `FIELDS` in `extract.py`.
- Menu textures: Kraken (Oodle) compressed TPF texture packs holding BC7 DDS
  images. `01_common_l` (and `21_common_dlc01_l`) hold sprite sheets;
  `.sblytbnd` holds one `<TextureAtlas>` XML layout per sheet giving each
  sprite's rectangle. `00_solo_l` (and `20_solo_dlc01_l`) hold one
  `MENU_Knowledge_<id>` texture per item. The DLC menu files are in the base
  `Data` archives, not in `dlc01.bdt`.

Format knowledge comes from the FromSoftware modding community
(SoulsFormatsNEXT, Smithbox's param definitions and file list); no code from those projects
is used. Kraken decompression uses the MIT-licensed
[oozextract](https://github.com/lvlvllvlvllvlvl/oozextract) crate.
