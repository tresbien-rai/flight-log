# Scripts

Node command-line tools that run the core logic directly. Run with `npm run <name> -- <args>`.

- `profile` — `npm run profile -- <logten|foreflight> <file> [--mapped]`
  Imports an export and prints counts and totals (no names or row content). `--mapped` applies
  the user-defined column mappings in `columns.ts`.

Real exports belong in the git-ignored `data/` directory.
