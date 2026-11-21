# Game data

Bundled into the HTML file. All of it describes Elden Ring Nightreign's own
data (names, rules, artwork belong to FromSoftware).

| File | Content | Source |
| --- | --- | --- |
| `relic_effects.json` | relic, effect and vessel names and properties | MIT-licensed community data, see `relic_effects.LICENSE` (keep it next to the file) |
| `relic_effects_allowlist.json` | which effects each relic can roll (roll rules) | generated from `regulation.bin` |
| `icons.json` | relic, effect and vessel icons as `data:` URLs | generated from the game's menu textures |

Regenerate the generated files after a game patch with
`tools/game-data/extract.py` (see `tools/game-data/README.md`).

## `relic_effects_allowlist.json`

Ids are game param row ids.

- `relics[relicId]`: one effect table id per effect slot (`EquipParamAntique.attachEffectTableId_1..3`).
- `tables[tableId]`: index into `pools`; `pools[i]`: effect ids that table can
  roll (`AttachEffectTableParam` rows with a chance weight > 0, base or DLC).
  Tables a relic names but that do not exist are left out: such relics cannot
  be obtained.
- `deep_pools`: `needs_curse` table (effects that always carry a curse),
  `other` tables (deep effects without a curse), `curses` table.
- `effects[effectId]`: `[compatibilityId, overrideEffectId]` from
  `AttachEffectParam`. Two effects with the same compatibilityId (not -1)
  cannot be on one relic; `overrideEffectId` is the order the game stores effects in.
- `legacy_tables`: tables only used by shop relics from before patch 1.03.

## `icons.json`

`{ images: [dataUrl…], relics: { id: imageIndex }, effects: { … }, vessels: { … } }`.
Each image is stored once (WebP) and shared by every id that uses it.

- Relics: `EquipParamAntique.iconId` → `MENU_Knowledge_<iconId>` texture, scaled to 128 px.
- Vessels: `AntiqueStandParam.iconId` → `MENU_ItemIcon_<iconId>` sprite, scaled to 128 px.
- Effects: `AttachEffectParam.statusIconId` → `MENU_StatusIcon_<id>` sprite, native size.
