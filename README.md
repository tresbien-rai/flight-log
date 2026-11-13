# Flight Log

A personal pilot logbook PWA for mixed Part 91 / Part 121 flying. It imports and audits
LogTen Pro and ForeFlight exports, validates entries, supports effective-dated aircraft
configurations, and produces experience reports. Data is stored locally on the device and
synced to the user's own Google Drive. Built to install offline on iPad Safari.

Status: early scaffold — see docs/DESIGN.md.

## Privacy rule

Real logbook exports go **only** in the gitignored `data/` directory and must **never** be
committed (they contain personal details such as crew names). Tests use synthetic fixtures
in `fixtures/` only.

## Running

Requires Node as pinned in `.nvmrc`.

```sh
npm install
npm run dev           # dev server
npm run build         # type-check + production build
npm run preview       # serve the production build
npm test              # run tests once (test:watch for watch mode)
npm run lint          # ESLint
npm run format        # Prettier write (format:check to verify)
npm run typecheck     # tsc project references
```

## Layout

```
src/core/         pure domain logic (no React, DOM or browser APIs; runs in Node)
  model/ validation/ importers/ reconcile/ reports/ time/
src/storage/      local DB and Google Drive sync
src/app/          React UI
scripts/          Node CLI scripts run against core
fixtures/         synthetic sample data only
data/             real personal exports (gitignored entirely)
```

Path aliases: `@core/*`, `@storage/*`, `@app/*`.
