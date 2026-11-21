# Game data

Bundled into the HTML file. All of it describes Elden Ring Nightreign's own
data (names, rules, artwork belong to FromSoftware).

| File | Content | Source |
| --- | --- | --- |
| `relic_effects.json` | relic, effect and vessel names and properties | MIT-licensed community data, see `relic_effects.LICENSE` (keep it next to the file) |
| `relic_effects_allowlist.json` | which effects each relic can roll (roll rules) | generated from `regulation.bin` |
| `effect_details.json` | official effect names, heroes, levels, search filters, aliases | generated from `regulation.bin` and the game's text |
| `icons.json` | relic, effect and vessel icons as `data:` URLs | generated from the game's menu textures |

The Sell Planner's stacking rules and effect strengths live in `data/sell/`.
They are derived from the community relic effects spreadsheet (game version
1.03.2 + DLC), credited in `tools/sell-rules/README.md`.

Regenerate the generated files after a game patch with
`tools/game-data/extract.py` (see `tools/game-data/README.md`).

## `relic_effects_allowlist.json`

Ids are game param row ids.

- `relics[relicId]`: one effect table id per effect slot (`EquipParamAntique.attachEffectTableId_1..3`).
- `unsellable`: relic ids that cannot be sold (`EquipParamAntique.isSalable` = 0, byte 6).
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

## `effect_details.json`

Every effect some relic can carry (ids from `AttachEffectParam`):

- `effects[id].name`: official English name (`attachTextId` in the game's text), `null` without `--msg`.
- `heroes`: heroes allowed to use it (`allowWylder…allowUndertaker`; empty = everyone).
- `rolls`: true if it rolls on random relics, false if only fixed on unique relics.
- `base`, `value`: `overrideBaseEffectId` and `displayedModifierValue` (levels, displayed strength).
- `filter`: `attachFilterParamId`, the in-game relic search filter it falls under.
- `spEffects`: passive SpEffect ids 1–3, on-hit SpEffect, permanent SpEffect: what it does.
- `same`: present on an alias: the id of the effect it is identical to (same SpEffects).
- `filters[id]`: search filter `name` and `category` (`AttachEffectFilterParam`).
- `sources`: which text files the names came from.

## `icons.json`

`{ images: [dataUrl…], relics: { id: imageIndex }, effects: { … }, vessels: { … } }`.
Each image is stored once (WebP) and shared by every id that uses it.

- Relics: `EquipParamAntique.iconId` → `MENU_Knowledge_<iconId>` texture, scaled to 128 px.
- Vessels: `AntiqueStandParam.iconId` → `MENU_ItemIcon_<iconId>` sprite, scaled to 128 px.
- Effects: `AttachEffectParam.statusIconId` → `MENU_StatusIcon_<id>` sprite, native size.
