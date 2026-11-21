# CLAUDE.md

Conventions for working on Nightreign Buildrocket. Read README.md for what the
project is and docs/save-format.md before touching `src/core/save/`.

## Working mode

- Work autonomously. Commit and push straight to `main` (no PRs) once checks pass.
- Before pushing: `pnpm check` (lint, typecheck, unit, build, e2e) must pass.
- Package manager is **pnpm**. Never commit `package-lock.json` / `yarn.lock`.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/), enforced by
  commitlint (`.husky/commit-msg`). Format: `type(scope): summary`, imperative,
  lower case, no trailing period.
- Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`,
  `chore`, `style`, `revert`. Breaking change: `feat(scope)!: …`.
- Scopes (see `commitlint.config.js`): `save`, `catalog`, `builds`, `compare`,
  `sell`, `worker`, `storage`, `ui`, `build`, `ci`, `deps`, `release`, `docs`, `test`.
- One logical change per commit. `feat`/`fix`/`perf` commits become release
  notes, so write the summary for users.

## Hard constraints

- **Output is ONE HTML file** (`dist/index.html`) that works over `file://` in
  Chrome. No CDN links, no `fetch()` of local assets, no code splitting, no
  separate asset files. Everything is bundled inline.
- **Workers:** import as `./x.ts?worker&inline` and keep `worker.format: 'iife'`
  in `vite.config.ts`. Module workers from `blob:null` do not start on
  `file://`.
- **Heavy work never runs on the UI thread.** File parsing, comparisons and
  planning go through the worker (`src/worker/`). Transfer `ArrayBuffer`s
  instead of copying them.
- **User data is saved to files on disk** via the File System Access API
  (`src/storage/files.ts`). Never `localStorage`/`sessionStorage`. IndexedDB is
  only for remembering `FileSystemFileHandle`s (`src/storage/handle-store.ts`).
- **Chrome only.** Chrome-only APIs are fine; feature-detect and degrade if cheap.
- **Real save files are never committed** (they contain a Steam id). They live in
  `test/fixtures/local/` (gitignored) or are passed with `NR_SAVE_FILE`.

## Architecture

Three features (builds, compare, sell planner) share most logic, so keep it in
reusable modules:

- `src/core/**`: pure TypeScript with **no DOM and no React**. Must run in the
  worker, in Node and in tests. Each folder has an `index.ts` public API.
  - `binary/`: byte helpers. `save/`: save reader. `catalog/`: game data.
    `builds/`: builds + JSON format. New features get their own folder
    (e.g. `core/compare/`, `core/sell/`) built on `save`, `catalog`, `builds`.
- `src/worker/`: the worker entry and a typed request/response protocol.
  New heavy operations = a new message type in `protocol.ts`.
- `src/storage/`: file system access. `src/ui/`: React only; no parsing logic.
- Dependency direction: `ui → worker/storage → core`. `core` imports nothing outside `core`.
- Data crossing the worker boundary or written to JSON must be plain data
  (no classes, no `bigint`, no `Map`). See `src/core/save/types.ts`.
- Exported JSON formats carry `format` + `version` fields (see `builds-json.ts`).
  Bump the version on breaking changes and keep reading old versions.
- Relics are matched across saves by **content** (`RelicSpec`/`specKey`), never
  by handle: handles only mean something inside one save.
- Platform support: new save platforms are a new `ContainerReader` producing
  entries in the PC decrypted layout (`src/core/save/container.ts`).

## Code style

- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
  Use `.ts`/`.tsx` extensions in relative imports.
- Biome formats and lints (`pnpm lint:fix`). Single quotes, 2 spaces, 100 cols.
- Binary parsing: name every offset in `format.ts` and document it in
  `docs/save-format.md`. In hot loops use the `DataView` helpers in
  `core/binary/bytes.ts`; avoid per-record allocations and copies (`subarray`, not `slice`).
- Fail loudly with `SaveFormatError` when a layout sanity check fails, rather
  than returning garbage.

## Tests

- **Unit (Vitest):** colocated `*.test.ts` next to the source. Save parsing is
  tested with synthetic saves from `test/helpers/save-builder.ts`. Extend the
  builder when the parser learns new fields.
- **Real save:** `test/real-save.test.ts` checks invariants that hold for any
  healthy save. It is skipped when no save is provided. Never assert
  values specific to one person's save.
- **E2E (Playwright):** `e2e/*.spec.ts` run against the **built**
  `dist/index.html` over `file://` with Google Chrome (`channel: 'chrome'`).
  Run `pnpm build` first. Use `<input type=file>` + `setInputFiles` to load
  files; stub `window.showSaveFilePicker` to capture written files.
- Every feature gets unit tests for its `core` logic and at least one e2e
  path through the UI.

## Licensing

- Project license: AGPL-3.0.
- Game data comes from `data/vendor/er-save-manager/` (last MIT revision of
  er-save-manager). Its current revisions are **not** free software: you may
  read them to learn the format, but never copy code or data from them.
- Credit any new third-party data in `data/vendor/<source>/` with its license.

## Releasing

`pnpm release <patch|minor|major>` from a clean, synced `main`, run locally
with `gh` (see README). `pnpm deploy:pages` updates GitHub Pages. CI on
GitHub Actions only runs checks.
