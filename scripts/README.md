# Scripts

Node command-line tools that run the core logic directly. Run with `npm run <name> -- <args>`.

- `profile` — `npm run profile -- <logten|foreflight> <file> [--mapped]`
  Imports an export and prints counts and totals (no names or row content). `--mapped` applies
  the user-defined column mappings in `columns.ts`.
- `audit` — `npm run audit -- <logten file> <foreflight file> [--out data/audit.md]`
  Matches the two exports flight by flight and summarises how they differ. `--out` writes a
  list of the flights to review, identified by date, tail and route (no names or remarks).

- `build:airports` — `npm run build:airports`
  Downloads OurAirports `airports.csv` (public domain) and regenerates the bundled
  `src/core/airports/airports.data.json` (airports and their IANA zones, sorted by ident).
  Needs network access. Prints rows kept by type, duplicate idents dropped and file size.
- `validate` — `npm run validate -- <logten|foreflight> <file> [--out data/validate.md]`
  Converts an export to logbook entries and runs every validation rule. `--out` lists each
  finding by date, tail and route.
- `report` — `npm run report -- <logten|foreflight> <file> [--layout full|airline|foreflight] [--from D] [--to D] [--csv data/report.csv]`
  Prints the experience report (hours and counts by type, class, engine, rule, simulator; no
  names). `--layout foreflight` reproduces ForeFlight's own figures for checking.
- `build:airports` regenerates the bundled airport table from OurAirports.

Real exports belong in the git-ignored `data/` directory.
