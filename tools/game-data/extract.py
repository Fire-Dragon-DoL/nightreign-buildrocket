#!/usr/bin/env python3
"""
Generate data/game/relic_effects_allowlist.json and data/game/icons.json from
Elden Ring Nightreign's own game files.

    python3 tools/game-data/extract.py --regulation path/to/regulation.bin \
        --menu path/to/unpacked/menu [--out data/game]

Inputs:
  regulation.bin  ELDEN RING NIGHTREIGN/Game/regulation.bin (no unpacking needed)
  menu/           the game's menu folder unpacked with UXM Selective Unpacker;
                  needs 00_solo_l.tpfbhd/.tpfbdt, 01_common_l.tpf.dcx and
                  01_common_l.sblytbnd.dcx

Needs the regulation key in the NR_REGULATION_KEY environment variable.
Requirements: Python 3.10+, `pip install cryptography zstandard pillow`, and
Rust's cargo (builds tools/game-data/dcxtool, a Kraken decompressor, on first
use). See tools/game-data/README.md for the formats involved.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from PIL import Image
import zstandard

HERE = Path(__file__).resolve().parent

# regulation.bin is AES-256-CBC encrypted (the first 16 bytes of the file are the IV).
# The key is not stored in this repository: pass it as 64 hex characters in this
# environment variable. See tools/game-data/README.md for where to find it.
KEY_ENV = 'NR_REGULATION_KEY'


def regulation_key() -> bytes:
    value = os.environ.get(KEY_ENV, '').strip().replace(' ', '').removeprefix('0x')
    try:
        key = bytes.fromhex(value)
    except ValueError:
        key = b''
    if len(key) != 32:
        sys.exit(f'Set {KEY_ENV} to the 32-byte Nightreign regulation key as 64 hex characters '
                 '(see tools/game-data/README.md).')
    return key

# Roll pools that are not referenced by a relic's own slot tables: deep relics
# roll from these. Effects from the "needs curse" table always carry a curse.
DEEP_POOLS = {'needs_curse': 2000000, 'other': [2100000, 2200000], 'curses': 3000000}
# Slot tables used only by shop relics from before patch 1.03.
LEGACY_TABLES = [100, 200, 300]

RELIC_ICON_SIZE = 128  # relic and vessel icons are scaled to this; effect icons keep their size


# --- Containers --------------------------------------------------------------------------------

def u32(b: bytes, o: int) -> int:
    return struct.unpack_from('<I', b, o)[0]


def u64(b: bytes, o: int) -> int:
    return struct.unpack_from('<Q', b, o)[0]


def utf16z(b: bytes, o: int) -> str:
    end = o
    while b[end:end + 2] != b'\0\0':
        end += 2
    return b[o:end].decode('utf-16le')


def binder_entries(b: bytes, magic: bytes) -> list[tuple[str, int, int]]:
    """(name, offset, size) of a BND4 / BHF4 binder with 0x24-byte entries:
    flags, -1, u64 size, u64 uncompressed size, u32 offset, u32 id, u32 name offset."""
    if b[:4] != magic:
        raise ValueError(f'expected {magic!r}, got {b[:4]!r}')
    if u64(b, 0x20) != 0x24:
        raise ValueError('unsupported binder entry layout')
    out = []
    for i in range(u32(b, 0x0c)):
        e = 0x40 + i * 0x24
        name = utf16z(b, u32(b, e + 0x20)).split('\\')[-1]
        out.append((name, u32(b, e + 0x18), u64(b, e + 0x08)))
    return out


def tpf_textures(b: bytes) -> dict[str, bytes]:
    """{name: DDS bytes} of a PC TPF (20-byte entries: offset, size, format, type, mips, flags, name, 0)."""
    if b[:4] != b'TPF\0':
        raise ValueError('not a TPF')
    out = {}
    for i in range(u32(b, 8)):
        e = 16 + i * 20
        off, size = u32(b, e), u32(b, e + 4)
        out[utf16z(b, u32(b, e + 12))] = b[off:off + size]
    return out


class Kraken:
    """Decompresses Kraken DCX blobs through dcxtool (built with cargo on first use)."""

    def __init__(self, workdir: Path):
        self.workdir = workdir
        self.binary = HERE / 'dcxtool' / 'target' / 'release' / 'dcxtool'
        if not self.binary.exists():
            print('Building dcxtool (one-time)…', file=sys.stderr)
            subprocess.run(['cargo', 'build', '--release', '--quiet'], cwd=HERE / 'dcxtool', check=True)

    def decompress(self, path: Path, offset: int = 0, length: int | None = None) -> bytes:
        length = path.stat().st_size - offset if length is None else length
        out = self.workdir / 'dcx.out'
        subprocess.run([str(self.binary), str(path), str(offset), str(length), str(out)], check=True)
        return out.read_bytes()


# --- Params ------------------------------------------------------------------------------------

def read_regulation(path: Path) -> dict[str, bytes]:
    """{param name: param file bytes} from an encrypted regulation.bin."""
    data = path.read_bytes()
    dec = Cipher(algorithms.AES(regulation_key()), modes.CBC(data[:16])).decryptor()
    dcx = dec.update(data[16:]) + dec.finalize()
    if dcx[:4] != b'DCX\0' or dcx[0x28:0x2c] != b'ZSTD':
        sys.exit(f'regulation.bin did not decrypt: is {KEY_ENV} the Nightreign key (not Elden Ring\'s)?')
    size, csize = struct.unpack_from('>II', dcx, 0x1c)
    bnd = zstandard.ZstdDecompressor().decompress(dcx[0x4c:0x4c + csize], max_output_size=size)
    return {name.removesuffix('.param'): bnd[off:off + n] for name, off, n in binder_entries(bnd, b'BND4')}


# Only the fields we need, as (offset, struct format[, bit]) within a row.
FIELDS = {
    'EquipParamAntique': {  # 48-byte rows
        'relicColor': (4, 'B'), 'isSalable': (6, 'B'), 'isDeepRelic': (7, 'B', 0), 'iconId': (28, 'i'),
        'table1': (16, 'i'), 'table2': (20, 'i'), 'table3': (24, 'i'),
    },
    'AttachEffectParam': {  # 68-byte rows
        'compatibilityId': (24, 'i'), 'statusIconId': (40, 'i'), 'overrideEffectId': (52, 'i'),
    },
    'AttachEffectTableParam': {  # 12-byte rows; one table id spans many rows
        'attachEffectId': (4, 'i'), 'chanceWeight': (8, 'H'), 'chanceWeight_dlc': (10, 'h'),
    },
    'AntiqueStandParam': {'iconId': (4, 'i')},  # 24-byte rows (vessels)
}


def read_param(b: bytes, fields: dict) -> dict[int, list[dict]]:
    """{row id: [row, ...]}; rows start at 0x40, 24 bytes each: id, pad, u64 data offset, u64 name offset."""
    rows: dict[int, list[dict]] = {}
    for i in range(struct.unpack_from('<H', b, 0x0a)[0]):
        h = 0x40 + i * 24
        rid = struct.unpack_from('<i', b, h)[0]
        base = u64(b, h + 8)
        row = {}
        for name, (off, fmt, *bit) in fields.items():
            value = struct.unpack_from('<' + fmt, b, base + off)[0]
            row[name] = (value >> bit[0]) & 1 if bit else value
        rows.setdefault(rid, []).append(row)
    return rows


# --- Roll rules ----------------------------------------------------------------------------------

def build_allowlist(params: dict, relic_ids: list[int], catalog_effects: list[int]) -> dict:
    antique, table_rows, effects = params['EquipParamAntique'], params['AttachEffectTableParam'], params['AttachEffectParam']
    relics = {}
    unsellable = []
    for rid in relic_ids:
        row = antique[rid][0]
        relics[str(rid)] = [t for t in (row['table1'], row['table2'], row['table3']) if t != -1]
        if row['isSalable'] == 0:
            unsellable.append(rid)

    referenced = {t for ts in relics.values() for t in ts}
    referenced |= {DEEP_POOLS['needs_curse'], DEEP_POOLS['curses'], *DEEP_POOLS['other']}
    # A relic naming a table that does not exist cannot be obtained; such tables are left out.
    pools: list[list[int]] = []
    pool_index: dict[tuple, int] = {}
    tables = {}
    for table in sorted(t for t in referenced if t in table_rows):
        rollable = sorted({r['attachEffectId'] for r in table_rows[table]
                           if r['chanceWeight'] > 0 or r['chanceWeight_dlc'] > 0})
        key = tuple(rollable)
        if key not in pool_index:
            pool_index[key] = len(pools)
            pools.append(rollable)
        tables[str(table)] = pool_index[key]

    effect_ids = sorted({e for pool in pools for e in pool} | set(catalog_effects))
    return {
        'deep_pools': DEEP_POOLS,
        'legacy_tables': LEGACY_TABLES,
        'relics': relics,
        'unsellable': unsellable,
        'tables': tables,
        'pools': pools,
        'effects': {str(e): [effects[e][0]['compatibilityId'], effects[e][0]['overrideEffectId']]
                    for e in effect_ids if e in effects},
    }


# --- Icons -------------------------------------------------------------------------------------

# Menu texture sets: (individual textures, sprite sheets). The DLC set is optional.
MENU_SETS = [('00_solo_l', '01_common_l'), ('20_solo_dlc01_l', '21_common_dlc01_l')]


class IconSources:
    def __init__(self, menu: Path, kraken: Kraken):
        self.kraken = kraken
        self.sprites: dict[str, tuple[str, str, int, int, int, int]] = {}  # name -> (set, sheet, x, y, w, h)
        self.sheet_dds: dict[str, dict[str, bytes]] = {}
        self.sheets: dict[tuple[str, str], Image.Image] = {}
        self.knowledge: dict[int, tuple[Path, int, int]] = {}  # icon id -> (bdt, offset, size)
        for solo, common in MENU_SETS:
            if not (menu / f'{common}.tpf.dcx').exists():
                print(f'  {common}: not found, skipped', file=sys.stderr)
                continue
            layouts = kraken.decompress(menu / f'{common}.sblytbnd.dcx')
            for name, off, size in binder_entries(layouts, b'BND4'):
                sheet = name.removesuffix('.layout')
                text = layouts[off:off + size].decode('utf-8', 'replace')
                for m in re.finditer(r'<SubTexture name="([^"]+)\.png" x="(\d+)" width="(\d+)" y="(\d+)" height="(\d+)"', text):
                    x, w, y, h = map(int, m.group(2, 3, 4, 5))
                    self.sprites[m.group(1)] = (common, sheet, x, y, w, h)
            self.sheet_dds[common] = tpf_textures(kraken.decompress(menu / f'{common}.tpf.dcx'))
            index = (menu / f'{solo}.tpfbhd').read_bytes()
            for name, off, size in binder_entries(index, b'BHF4'):
                if m := re.fullmatch(r'MENU_Knowledge_(\d+)\.tpf\.dcx', name):
                    self.knowledge[int(m.group(1))] = (menu / f'{solo}.tpfbdt', off, size)

    def sprite(self, name: str) -> Image.Image | None:
        s = self.sprites.get(name)
        if not s:
            return None
        common, sheet, x, y, w, h = s
        if (common, sheet) not in self.sheets:
            dds = self.sheet_dds[common][sheet]
            self.sheets[(common, sheet)] = Image.open(io.BytesIO(dds)).convert('RGBA')
        return self.sheets[(common, sheet)].crop((x, y, x + w, y + h))

    def knowledge_icon(self, icon: int) -> Image.Image | None:
        if icon not in self.knowledge:
            return None
        bdt, off, size = self.knowledge[icon]
        textures = tpf_textures(self.kraken.decompress(bdt, off, size))
        return Image.open(io.BytesIO(next(iter(textures.values())))).convert('RGBA')


def to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=90, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def build_icons(params: dict, src: IconSources) -> tuple[dict, list[str]]:
    images: list[str] = []
    index: dict[str, int | None] = {}
    missing: set[str] = set()

    def image(key: str, load) -> int | None:
        if key not in index:
            img = load()
            if img is None:
                missing.add(key)
                index[key] = None
            else:
                index[key] = len(images)
                images.append(to_data_url(img))
        return index[key]

    def scaled(img: Image.Image | None) -> Image.Image | None:
        return img.resize((RELIC_ICON_SIZE, RELIC_ICON_SIZE), Image.LANCZOS) if img else None

    def relic_art(icon: int):
        return scaled(src.knowledge_icon(icon) or src.sprite(f'MENU_ItemIcon_{icon:05d}'))

    def vessel_art(icon: int):
        return scaled(src.sprite(f'MENU_ItemIcon_{icon:05d}') or src.knowledge_icon(icon))

    out = {'relics': {}, 'effects': {}, 'vessels': {}}
    for rid, rows in sorted(params['EquipParamAntique'].items()):
        icon = rows[0]['iconId']
        i = image(f'relic:{icon}', lambda icon=icon: relic_art(icon)) if icon >= 0 else None
        if i is not None:
            out['relics'][str(rid)] = i
    for vid, rows in sorted(params['AntiqueStandParam'].items()):
        icon = rows[0]['iconId']
        i = image(f'vessel:{icon}', lambda icon=icon: vessel_art(icon)) if icon >= 0 else None
        if i is not None:
            out['vessels'][str(vid)] = i
    for eid, rows in sorted(params['AttachEffectParam'].items()):
        icon = rows[0]['statusIconId']
        i = image(f'effect:{icon}', lambda icon=icon: src.sprite(f'MENU_StatusIcon_{icon:05d}')) if icon >= 0 else None
        if i is not None:
            out['effects'][str(eid)] = i
    return {'images': images, **out}, sorted(missing)


# --- Main --------------------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--regulation', type=Path, required=True)
    ap.add_argument('--menu', type=Path, help='unpacked menu folder; icons are skipped without it')
    ap.add_argument('--out', type=Path, default=Path('data/game'))
    args = ap.parse_args()

    names = json.loads((args.out / 'relic_effects.json').read_text(encoding='utf-8'))
    raw = read_regulation(args.regulation)
    params = {name: read_param(raw[name], fields) for name, fields in FIELDS.items()}

    allowlist = build_allowlist(params, sorted(int(k) for k in names['relics']), [int(k) for k in names['effects']])
    (args.out / 'relic_effects_allowlist.json').write_text(json.dumps(allowlist, separators=(',', ':')) + '\n')
    print(f"relic_effects_allowlist.json: {len(allowlist['relics'])} relics, {len(allowlist['pools'])} pools, "
          f"{len(allowlist['effects'])} effects, {len(allowlist['unsellable'])} unsellable relics")
    # Sanity check for a human: the unsellable list should be unique/quest relics, not random ones.
    sample = sorted({names['relics'][str(r)]['name'] for r in allowlist['unsellable']})
    print(f"  unsellable, e.g.: {', '.join(sample[:12])}{' …' if len(sample) > 12 else ''}")

    if args.menu:
        with tempfile.TemporaryDirectory() as tmp:
            icons, missing = build_icons(params, IconSources(args.menu, Kraken(Path(tmp))))
        (args.out / 'icons.json').write_text(json.dumps(icons, separators=(',', ':')) + '\n')
        print(f"icons.json: {len(icons['images'])} images, {len(icons['relics'])} relics, "
              f"{len(icons['effects'])} effects, {len(icons['vessels'])} vessels")
        if missing:
            print(f'  no texture found for: {", ".join(missing)}', file=sys.stderr)


if __name__ == '__main__':
    main()
