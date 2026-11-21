# Game data

| File                           | Content                                        | In git                                 |
| ------------------------------ | ---------------------------------------------- | -------------------------------------- |
| `relic_effects.json`           | relic, effect and vessel names and properties  | yes (MIT, see `relic_effects.LICENSE`) |
| `relic_effects_allowlist.json` | which effects each relic can roll (roll rules) | no, local only                         |
| `icons.json`                   | relic, effect and vessel icons as `data:` URLs | no, local only                         |

The two local-only files may not be redistributed, so they are gitignored.
The app builds and runs without them; it just shows no icons and skips
roll-rule checks. Put them here to get the full app in your local build.

`icons.json` is generated from an icons SQLite database:

```sh
node scripts/convert-icons.mjs path/to/icons.db
```

Format: `{ images: [dataUrl…], relics: { id: imageIndex }, effects: { … }, vessels: { … } }`.

`relic_effects_allowlist.json` format (ids are game param row ids):

- `relics[relicId]`: one effect table id per effect slot.
- `tables[tableId]`: index into `pools`; `pools[i]`: effect ids that table can roll.
- `deep_pools`: `needs_curse` table (effects that always carry a curse),
  `other` tables (deep effects without a curse), `curses` table.
- `effects[effectId]`: `[compatibilityId, sortKey]`. Two effects with the same
  compatibilityId (not -1) cannot be on one relic.
- `legacy_tables`: tables only used by relics from before patch 1.03.
