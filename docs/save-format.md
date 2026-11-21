# Elden Ring Nightreign save format (PC)

How `src/core/save/` reads a save. All offsets were checked against a real
save (game patch current as of November 2026). Little-endian throughout.

## Files

| Platform               | File                                         | Status                                                |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------- |
| PC (Steam)             | `%APPDATA%\Nightreign\<steam id>\NR0000.sl2` | supported                                             |
| PC, Seamless Co-op mod | `NR0000.co2` (same format, renamed)          | supported                                             |
| PlayStation            | `memory.dat` export                          | not yet (see [Adding a platform](#adding-a-platform)) |

## Container: BND4

| Offset | Size     | Field                    |
| ------ | -------- | ------------------------ |
| 0x00   | 4        | magic `BND4`             |
| 0x0C   | 4        | entry count (14)         |
| 0x20   | 8        | entry header size (0x20) |
| 0x40   | 0x20 × n | entry headers            |

Entry header: `+0x00` flags (0x40), `+0x04` -1, `+0x08` u64 size,
`+0x10` u32 data offset, `+0x14` u32 name offset (UTF-16, `USER_DATA000`…).

## Entries

Each entry is `IV (16 bytes) + AES-128-CBC ciphertext` with the fixed key
`18 F6 32 66 05 BD 17 8A 55 24 52 3A C0 A0 C6 09`. The plaintext is PKCS#7
padded (12 bytes of `0x0C`), so WebCrypto decrypts it directly.

Decrypted (unpadded) entry layout:

| Range           | Content                        |
| --------------- | ------------------------------ |
| `[0, 4)`        | size marker, e.g. `0x00100010` |
| `[4, len-16)`   | body                           |
| `[len-16, len)` | MD5 of `[4, len-16)`           |

| Entry | Content                           | Read? |
| ----- | --------------------------------- | ----- |
| 0-9   | character slots                   | yes   |
| 10    | global profile (Steam id at 0x08) | yes   |
| 11-13 | match history, params, misc       | no    |

## Character slot

An unused slot has u32 at `0x04` (slot version) = 0.

| Offset | Content                                     |
| ------ | ------------------------------------------- |
| 0x0C   | u32 play time (ms)                          |
| 0x14   | **item states**: 5120 variable-size records |

Item state record: starts with the gaitem handle (u32). Its high nibble is the
item type and decides the record size:

| Type bits | Kind      | Size |
| --------- | --------- | ---- |
| 0x0       | empty     | 8    |
| 0x8       | weapon    | 88   |
| 0x9       | armor     | 16   |
| 0xB       | goods     | 8    |
| 0xC       | **relic** | 80   |
| other     | —         | 8    |

Relic state (80 bytes):

| Offset           | Content                                                  |
| ---------------- | -------------------------------------------------------- |
| 0x00             | handle                                                   |
| 0x04             | item id, `0x80000000 \| id` (mask with `0x00FFFFFF`)     |
| 0x10, 0x14, 0x18 | effects 1-3 (AttachEffectParam ids, `0xFFFFFFFF` = none) |
| 0x38, 0x3C, 0x40 | curses 1-3, paired with the effect at the same index     |

After the states (`end` = offset right after the last record):

| Offset              | Content                                                    |
| ------------------- | ---------------------------------------------------------- |
| end + 0x94 = `name` | character name, UTF-16, 16 units                           |
| name − 64           | u32 Sigs                                                   |
| name + 52           | u32 Murk                                                   |
| name + 0x5B8        | u32 inventory count, then 3065 × 14-byte inventory entries |

Inventory entry: `+0` handle, `+4` amount, `+8` acquisition id,
`+12` favorite (u8), `+13` new (u8).

**Ownership:** a relic is owned only if its handle appears in the inventory.
Relic states without an inventory entry exist (sold relics) and are ignored.

### Relic loadout chunk (builds)

At `inventory end + 0x21A`:

| Offset | Content                                               |
| ------ | ----------------------------------------------------- |
| +0x00  | u16 chunk id `0x00C2` (used as a layout sanity check) |
| +0x04  | u32 payload size (0x2C00)                             |
| +0x0A  | u16 hero count (10)                                   |
| +0x0C  | u16 universal vessel count (4)                        |
| +0x0E  | u16 hero vessel count (70)                            |
| +0x10  | u16 preset count (100)                                |
| +0x14  | hero blocks                                           |

- Hero block: `hero id (u8)`, `current preset index (u8, 0xFF none)`,
  2 pad, `current vessel id (u32)`, then the universal vessels.
- Vessel: `vessel id (u32)` + 6 relic handles (u32, 0 = empty).
  Slots 0-2 take normal relics, 3-5 deep relics.
- Then the hero-specific vessels (`id / 1000` = hero id).
- Presets start at the next 8-byte boundary of the payload, 80 bytes each:
  `+1` hero id (0 = empty slot), `+3` recency (0 = newest),
  `+4` name (UTF-16, 18 units), `+0x2C` vessel id, `+0x30` 6 relic handles,
  `+0x48` u64 FILETIME.

## Game data

Relic colors: 0 Red, 1 Blue, 2 Yellow, 3 Green; vessel slot color 4 accepts
any color. Hero ids: 1 Wylder, 2 Guardian, 3 Ironeye, 4 Duchess, 5 Raider,
6 Revenant, 7 Recluse, 8 Executor, 9 Scholar, 10 Undertaker. Relic item ids
≥ 2,000,000 are deep relics.

## Adding a platform

Write a `ContainerReader` (`src/core/save/container.ts`) that turns the file
into entries in the decrypted PC layout above, and register it in
`read-save.ts`. Slot and profile parsing stay unchanged. For PlayStation
`memory.dat`: 0x80-byte header, then each entry's body
(`[4, len-16)`) back to back, unencrypted, without prefix or checksum.
