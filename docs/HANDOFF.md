# Handoff

Where the project stands, how to pick it up, and what is known to be unfinished. Read this
first, then `docs/DESIGN.md` for the reasoning behind each decision. Update both as work lands.

Last updated: end of milestone 4.

## State

| Milestone                   | Status                       |
| --------------------------- | ---------------------------- |
| 0 Scaffold                  | done                         |
| 1 Core model + importers    | done                         |
| 2 Matching + diff           | done                         |
| 3 Validation engine         | done                         |
| 4 App shell + local storage | done, deployed               |
| 5 Audit UI                  | **next**                     |
| 6–10                        | not started (see DESIGN §11) |

- **Branch:** all work is on `claude/clever-gauss-07u08g`. The repository has no `main` branch
  yet, so there has never been a pull request. Creating `main` from this branch and switching
  Railway to it is a sensible first step for whoever has permission to push it.
- **Hosting:** <https://web-production-30875dbb.up.railway.app>. Railway project "Flight Log", service `web`, built from the branch above on every
  push. `npm run build` then `npm start` (a static file server over `dist/`). Nothing on
  Railway stores logbook data; it lives in the browser's IndexedDB.
- **Checks:** `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`,
  `npm run build`. The GitHub Actions workflow exists but has not been observed running.

## Map of the code

| Path                  | What it is                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/model`      | Canonical types: `Entry`, `Airframe`, `AircraftType`, `Logbook`                                                                               |
| `src/core/importers`  | `importLogTen`, `importForeFlight` → `SourceRecord`s; `toLogbook` → canonical entries; `presets.ts` holds this pilot's custom-column mappings |
| `src/core/reconcile`  | `matchRecords` (pairing two imports) and `diffPair` (field-by-field comparison)                                                               |
| `src/core/validation` | 35 rules, `validate`, per-source default rule switches                                                                                        |
| `src/core/query`      | `indexLogbook`, `filterEntries`, `sortEntries`, `totalEntries`, `groupEntries`                                                                |
| `src/core/airports`   | Bundled airport table (generated, ~3 MB) and lookup                                                                                           |
| `src/core/time`       | Durations in minutes; UTC clock ⇄ local date helpers                                                                                          |
| `src/storage`         | Dexie database, `LogbookStore`, `importFile`, lazy airport loader                                                                             |
| `src/app`             | React screens: shell, import, ledger, entry detail                                                                                            |
| `scripts`             | `profile`, `audit`, `validate`, `build:airports` command-line tools                                                                           |
| `fixtures`            | Synthetic exports that reproduce each file quirk                                                                                              |
| `data/`               | Git-ignored. Real exports and generated reports go here and nowhere else                                                                      |

Contracts live in each folder's `types.ts`. They were written first and the implementations
built against them; change a contract deliberately, not in passing.

## How the work has been done

The session lead writes the contracts (types, a precise behavioural spec, the design direction)
and reviews; well-specified pieces are delegated to cheaper models, each in its own git
worktree, then merged. Every delegated piece was required to pass the five checks and to be
run against the real exports with counts-only reporting. This has worked well and is worth
continuing. Things that needed correcting after delegation, as a guide to what to review:

- Assumptions about the data that the real files contradicted (the meaning of the date
  column; pilots listing themselves as PIC on solo flights).
- Rules that were technically per spec but noisy on real data.
- Config drift (tsconfig includes, test typing) when two agents each solved the same problem.

## Facts about the data that cost time to learn

- **Both exports date a flight by the UTC date of departure.** `toLogbook` defaults to
  `dateBasis: 'utc'` and derives the local date from the departure airport's time zone.
- **LogTen exports custom fields without labels.** `customTime1/2/3` are dual given to
  commercial / instrument / private students, `customTime10` is cross-country over 50 NM,
  identified by matching column totals against ForeFlight.
- **ForeFlight has no flight number field.** The pilot puts flight numbers in the comments.
  Nothing parses them out yet.
- **ForeFlight rounds every time to a tenth of an hour; LogTen keeps hundredths.** About 600
  matched flights differ only by this.
- **The landing counts are not like-for-like** between the apps (LogTen's day/night counts
  include touch-and-goes; ForeFlight's are full-stop only plus an all-landings total).
  `diff.ts` compares derived quantities; `toLogbook` makes a best-effort split and notes when
  it had to assume.
- **PIC plus dual received, and PIC plus dual given, legitimately overlap.** Pilot-monitoring
  legs legitimately have no takeoffs or landings.
- **Simulator time is never part of total time.** Total flight time is aircraft time only.
  The ledger's totals row excludes simulator and ground sessions and counts them separately.
  Keep it that way in reports.
- **43 simulator sessions exist only in ForeFlight** (training-device time toward initial
  ratings). They are wanted in the merged logbook.

## Known gaps

App:

- Not yet tested on a real iPad, nor offline. The service worker precaches everything
  (about 3.4 MB), but nobody has run it with no network.
- App icons are plain placeholder squares.
- No manual light/dark switch; it follows the device.
- Going to Import and back loses the current filters.
- In the phone-size entry sheet, Escape and the arrow keys do nothing.
- Entry detail is read-only. There is no way to create, edit or delete an entry.
- `main` ("My logbook") cannot be created yet; only the two imported books exist.
- Column mappings for custom fields are hard-coded in `src/core/importers/presets.ts`
  for this one pilot. They need to become a setting before anyone else can use the app.
- The airport table is one 3 MB chunk (1 MB compressed). Dropping names or the smallest
  airports would shrink it considerably.
- Lint reports two warnings (one is the list-virtualisation library being incompatible with
  the React compiler; the other has not been looked at).

Core:

- The audit and validation command-line reports are the only place differences are shown.
  There is no stored record of a decision yet (DESIGN §7.2).
- The operating rule defaults to Part 91 where the source does not state it; the inference
  and confirmation step (DESIGN §7.4) is not built. About 120 airline legs are unmarked.
- Night time is taken from the source as typed. Computing it from times and position
  (DESIGN §5) is not built, so there is no independent check on it beyond "not more than total".
- `totalSource` is always `typed` after import, even when clock times agree with the total.
- Aircraft types are created one per source type code (`C172`, `C-172S`). Mapping both apps'
  spellings onto one type list (DESIGN §7.5) is not built, so the two books do not share types.
- People are keyed by a normalised name; near-duplicates are not merged.
- No export (DESIGN §9), no experience report (§8), no Drive sync (§3.3).
- `npm audit` reports vulnerabilities in dev dependencies; not triaged.

## Milestone 5: where to start

Goal: resolve the differences between the two imported books in the app and produce `main`.
DESIGN §7 is the specification. A suggested order:

1. **Decide the stored shape of a decision** (contract first): keyed by a fingerprint of the
   two raw rows, holding the chosen value per field, plus bulk decisions per pattern
   ("rounding: keep the more precise"). Add a Dexie table and store methods.
2. **A pure `resolve` step in core**: pairs + decisions → canonical entries for `main`, with
   the list of what is still undecided. Test it hard; it is the heart of the milestone.
3. **Type and aircraft mapping** between the two sources, since merged entries need one
   aircraft list.
4. **Operating-rule proposals** (DESIGN §7.4), grouped for bulk confirmation.
5. **The audit screen**: summary with converging totals, a filterable list of pairs, a
   side-by-side view with per-field choice, bulk actions, orphans (keep / drop / match by hand).
   Re-importing a newer export must replay earlier decisions.
6. Bring the 43 ForeFlight-only simulator sessions across as part of orphan handling.

Open questions for the pilot are listed in DESIGN §12.
