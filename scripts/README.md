# Scripts

Node command-line tools that run the core logic directly. Run with `npm run <name> -- <args>`.

- `profile` — `npm run profile -- <logten|foreflight> <file> [--mapped]`
  Imports an export and prints counts and totals (no names or row content). `--mapped` applies
  the user-defined column mappings in `columns.ts`.
- `audit` — `npm run audit -- <logten file> <foreflight file> [--out data/audit.md]`
  Matches the two exports flight by flight and summarises how they differ. `--out` writes a
  list of the flights to review, identified by date, tail and route (no names or remarks).

Real exports belong in the git-ignored `data/` directory.
