# Nightreign Buildrocket

A tool for **Elden Ring Nightreign** relic management that ships as **one HTML
file**. Download it, double-click it, and it runs in Google Chrome. No server,
no install, and your save never leaves your computer.

## Goals

1. **Builds:** read a save, extract every saved relic build, show it, export
   it to JSON and load it back.
2. **Missing relics:** take two saves (or builds JSON files), pick a
   "builds source" and a "relics pool" character, and list (on screen and as
   CSV) the relics the pool is missing to recreate the source's builds.
3. **Sell planner:** describe which effects you want to keep, how many copies
   per color and which combinations (optionally derived from your builds),
   and get a list of relics that are safe to sell.

Status: all three work: Builds Viewer, Relics Needs and Sell Planner.

## Using it

1. Download `nightreign-buildrocket-vX.Y.Z.html` from the
   [releases](https://github.com/Fire-Dragon-DoL/nightreign-buildrocket/releases).
2. Open it in **Google Chrome** (other browsers are not supported).
3. Open your save: `%APPDATA%\Nightreign\<steam id>\NR0000.sl2`
   (`NR0000.co2` with the Seamless Co-op mod).

Anywhere the app asks for a file, a save and a builds JSON exported by the
app are interchangeable. Exported builds files also carry every relic each
exported character owns, so a friend can send you a JSON instead of their save.

**Relics Needs:** open the save (or JSON) with the builds you
want as _Builds source_ and the one whose relics you will use as _Relics
pool_, then pick a character on each side. Relics match only when identical
(same relic, effects and curses). A relic can sit in several presets, so it is
needed as many times as the single build using it most needs it. Each missing
relic lists the builds it blocks; untick builds you don't care about. _Export
CSV_ writes the list with names and ids (UTF-8, opens in Excel).

**Sell Planner:** open your save (or JSON), then say what you want to keep:

- **Normal effects / Deep of Night:** give an effect an importance (Low,
  Normal, High, Must keep) and how many copies to keep, per color or in
  total. Higher levels count fully toward a lower-level need; lower levels
  stand in, at a discount, for copies you lack. Effects you don't configure
  are worth nothing. Deep of Night also lists curses: set how much each one
  bothers you by default (a _dealbreaker_ stops a relic from counting), or
  want them like any effect.
- **Groups & combos:** needs live in named groups (shown as "kept by").
  A combo is effects you want on the **same** relic (a godroll); relics with
  more effects match too, partial matches are weak backups. Each combo member
  (and each single effect) can accept lower levels ("Physical Attack Up +1 or
  higher"); higher levels are kept first. A need's _Relics_ setting says
  whether normal relics, Deep of Night relics or both count (deep relics also
  roll many normal effects). Each need can
  tolerate curses the default says are dealbreakers.
- **Stacking:** which levels stack in one build, from community data; change
  a family with a preset or a grid.
- **Seed from builds:** turn builds into groups once, then edit them.

_Results_ lists every relic you can sell, grouped by Deep/normal, color and
size, from risk 0 (safe) to 99, with why it's safe or what it would hurt, and
a suggested in-game search per group. Selling everything up to a given risk
is safe in the order shown. Relics the game won't let you sell aren't listed
but still count toward your needs. Relics nothing in your plan wants but that
look rare are flagged _possible godroll_. Save the plan as a `.rsp` file to
reuse it; it holds only effects and rules, never anything from your save.
_Export CSV_ writes the list sorted by risk.

Only PC saves are supported for now.

## Tech stack

| Concern         | Choice                                   | Why                                                           |
| --------------- | ---------------------------------------- | ------------------------------------------------------------- |
| Language        | TypeScript (strict)                      | Typed binary parsing catches offset/shape mistakes.           |
| UI              | React 19                                 | Component ecosystem for tables, filters and comparisons.      |
| Styling         | Plain CSS                                | Small file, no runtime.                                       |
| Build           | Vite + `vite-plugin-singlefile`          | Inlines JS, CSS and the worker into one `index.html`.         |
| Unit tests      | Vitest                                   | Same transform pipeline as Vite, fast, native TS.             |
| E2E tests       | Playwright on Google Chrome              | Tests the built file over `file://`, exactly as users run it. |
| Lint/format     | Biome                                    | One fast tool instead of ESLint + Prettier.                   |
| Commits         | Conventional Commits, commitlint + husky | Readable history; release notes are generated from it.        |
| Package manager | pnpm                                     |                                                               |

Runtime constraints that shaped the design:

- **`file://`:** everything is inlined; no network, no lazy-loaded chunks.
- **Parsing off the UI thread:** save parsing runs in a Web Worker that is
  inlined as a _classic_ worker started from a Blob URL. Chrome refuses
  _module_ workers from `blob:null` on `file://`, and the e2e tests guard this.
- **Decryption:** WebCrypto AES-CBC, available in Chrome on `file://` and in
  the worker.
- **User data lives in real files** through the File System Access API
  (Chrome). Never `localStorage`. IndexedDB only remembers _file handles_ so
  a file can be reopened without a picker.

## Development

Requires Node 22+, pnpm 10 and Google Chrome.

```sh
pnpm install
pnpm dev          # dev server with hot reload
pnpm test         # unit tests
pnpm build        # -> dist/index.html (the whole app)
pnpm test:e2e     # e2e against dist/index.html over file:// (build first)
pnpm check        # everything: lint, types, unit, build, e2e
```

### Game data

`data/game/` holds relic, effect and vessel names, the relic roll rules and
the game icons, bundled into the HTML file. The roll rules and icons are
generated from the game's own files with `tools/game-data/extract.py`; rerun
it after a game patch (see `tools/game-data/README.md`).

### Testing with your own save

Real saves are **never committed** (they contain your Steam id). To run the
real-save tests, either:

- copy your save into `test/fixtures/local/` (gitignored), or
- `NR_SAVE_FILE=/path/to/NR0000.sl2 pnpm test`

Without one, those tests are skipped and everything else uses synthetic saves
generated by `test/helpers/save-builder.ts`.

### Releasing and deploying

GitHub Actions only runs checks (free for public repos). Releases are cut
locally with the GitHub CLI:

```sh
pnpm release patch --dry-run   # preview notes, run checks
pnpm release patch             # or minor / major / 1.2.3
```

This bumps the version, tags, pushes, and creates a GitHub release with the
HTML file attached. Release notes are generated from conventional commits.

Optionally, `pnpm deploy:pages` publishes the app to GitHub Pages (enable
Pages once: Settings → Pages → Deploy from branch `gh-pages`).

## Project layout

```
src/
  core/        pure logic, no DOM: runs in the worker, Node and tests
    binary/    byte reading helpers, MD5
    save/      save file reader (container → entries → slots)
    catalog/   relic / effect / vessel / hero data
    builds/    build extraction, JSON import/export, save-or-JSON loading
    compare/   missing relics between two characters, CSV export
    sell/      sell planner: effect families, .rsp plans, risk ranking
  worker/      web worker + promise-based client
  storage/     files on disk (File System Access API)
  ui/          React components
e2e/           Playwright tests
test/          shared test helpers, real-save tests
data/game/     game data: names, roll rules, icons (see its README)
data/sell/     sell planner stacking rules and effect strengths
docs/          save format write-up
scripts/       release / deploy
tools/         game data extractor (Python + a small Rust decompressor),
               sell planner rules generator
```

## License

The code is free software under the [AGPL-3.0](LICENSE).

The game data in `data/game/` (names, roll rules, icons) describes Elden Ring
Nightreign and belongs to FromSoftware; the AGPL covers this project's code,
not that data. `relic_effects.json` is MIT-licensed community data (see
`data/game/relic_effects.LICENSE`). Kraken decompression in `tools/game-data`
uses the MIT-licensed oozextract crate.

Not affiliated with FromSoftware or Bandai Namco.
