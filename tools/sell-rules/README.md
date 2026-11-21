# Sell Planner rules generator

`build-rules.mjs` builds `data/sell/effect-rules.json`, the default stacking
rules and level strengths the Sell Planner starts from.

```sh
node tools/sell-rules/build-rules.mjs <normal-relics.csv> <deep-relics.csv>
```

## Input

The community spreadsheet of Nightreign relic effects (game version 1.03.2 +
DLC), exported as two CSVs (normal relics and Deep of Night relics), with the
columns `Category, Relic Description, Effect, Stackable with self?, Notes`.
The spreadsheet's content may be used as long as the spreadsheet itself is not
modified, so it is **not committed**: only the derived rules are, crediting
the source.

## What it does

- Expands the spreadsheet's shorthand ("Magic/Fire/Lightning/Holy Attack Up
  +0/1/2", `[Status]` placeholders) and matches the rows to game effect ids by
  name. Names that differ between the spreadsheet and the game are listed in
  `ALIASES`; ambiguous rows are rewritten in `REWRITE`.
- `stacksWithSelf` comes from "Stackable with self?" (`N/A` and blank =
  unknown, which the app treats as "stacks" and flags).
- `bonus` is the strength of each level of a leveled family, from the numbers
  in the Effect or Notes column (multipliers become `|x - 1|`). The app uses
  `lower bonus / wanted bonus` as the weight of a lower level standing in for
  a higher one, and 0.5 when a value is missing.
- Rules from the Notes column, too irregular to parse, are encoded by hand in
  the script (`Hand-encoded rules`): Post-Damage HP restoration, Improved
  Critical Hits, starting weapon element vs status, stats being linear by
  points, and hero effects not stacking with themselves.

It prints every row it could not match and every leveled family left without
a value. Known gaps (they use the 0.5 fallback): Post-Damage HP restoration
+0, Critical Hit Boosts Stamina Recovery +1, Improved Affinity Damage
Negation +0 (not rollable).

After a game patch, re-check stacking and values: regenerate, review the diff,
and fix rules by hand where players found otherwise.
