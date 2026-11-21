# Game data extractor

Generates `data/game/relic_effects_allowlist.json` and `data/game/icons.json`
from your own copy of Elden Ring Nightreign. Run it after a game patch.

## What you need

1. `ELDEN RING NIGHTREIGN\Game\regulation.bin` — copy it, nothing to unpack.
2. The game's `menu` folder, unpacked with
   [UXM Selective Unpacker](https://github.com/Nordgaren/UXM-Selective-Unpack/releases)
   (set an output folder, select `menu`, press Unpack; never press Patch).
   Only these files are read:
   `00_solo_l.tpfbhd`, `00_solo_l.tpfbdt`, `01_common_l.tpf.dcx`, `01_common_l.sblytbnd.dcx`.
3. Python 3.10+ with `pip install cryptography zstandard pillow`.
4. Rust (`cargo`): `dcxtool/` is built automatically on first run.
5. The `regulation.bin` decryption key, in the `NR_REGULATION_KEY` environment
   variable (see below).

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
python3 tools/game-data/extract.py --regulation path/to/regulation.bin --menu path/to/menu
```

It writes into `data/game/` (change with `--out`) and lists any icon whose
texture it could not find. Without `--menu` only the roll rules are generated.

## Formats

- `regulation.bin`: 16-byte IV + AES-256-CBC ciphertext (key from `NR_REGULATION_KEY`),
  decrypting to a DCX container compressed with Zstandard, holding a BND4
  binder of `.param` files.
- DCX: `"DCX\0"` header; big-endian sizes at 0x1C (uncompressed) and 0x20
  (compressed); algorithm name at 0x28 (`ZSTD` or `KRAK`); payload at 0x4C.
- BND4 / BHF4 binders: entry table at 0x40, 0x24 bytes per entry (u64 size at
  +0x08, u32 data offset at +0x18, u32 UTF-16 name offset at +0x20). A BHF4
  (`.tpfbhd`) is the index of the data in the matching `.tpfbdt`.
- PARAM: row count u16 at 0x0A; row headers from 0x40, 24 bytes each (s32 id,
  pad, u64 data offset, u64 name offset). Only the needed fields are read, at
  the fixed offsets listed in `FIELDS` in `extract.py`.
- Menu textures: Kraken (Oodle) compressed TPF texture packs holding BC7 DDS
  images. `01_common_l` holds sprite sheets; `.sblytbnd` holds one
  `<TextureAtlas>` XML layout per sheet giving each sprite's rectangle.
  `00_solo_l` holds one `MENU_Knowledge_<id>` texture per item.

Format knowledge comes from the FromSoftware modding community
(SoulsFormatsNEXT, Smithbox's param definitions); no code from those projects
is used. Kraken decompression uses the MIT-licensed
[oozextract](https://github.com/lvlvllvlvllvlvl/oozextract) crate.
