# Sell Planner data

`effect-rules.json`: default effect rules for the Sell Planner, keyed by game
effect id.

- `effects[id].stacksWithSelf`: whether two copies of the effect stack
  (missing = unknown).
- `effects[id].bonus`: strength of the effect at its level, comparable within
  its family (used to weigh lower levels as backups).
- `noStack`: pairs of different effects that don't stack with each other.

Derived from the community relic effects spreadsheet (game version 1.03.2 +
DLC) by `tools/sell-rules/build-rules.mjs`; see `tools/sell-rules/README.md`
for credits and how to regenerate it. Users can override every rule in their
`.rsp` config.
