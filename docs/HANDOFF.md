# Handoff

Where the project stands, how to pick it up, and what is known to be unfinished. Read this
first, then `docs/DESIGN.md` for the reasoning behind each decision. Update both as work lands.

Last updated: end of milestone 6 (aircraft management). Next: milestone 7, the experience report.

## State

| Milestone                   | Status                       |
| --------------------------- | ---------------------------- |
| 0 Scaffold                  | done                         |
| 1 Core model + importers    | done                         |
| 2 Matching + diff           | done                         |
| 3 Validation engine         | done                         |
| 4 App shell + local storage | done, deployed               |
| 5 Audit UI                  | done                         |
| 6 Aircraft management       | done                         |
| 7 Experience report         | **next**                     |
| 8–10                        | not started (see DESIGN §11) |

- **Branch:** `main` exists and is what Railway deploys. Work happens on a branch and reaches
  `main` by pull request, merged by the agent once CI passes (see CLAUDE.md). GitHub's default branch may still be the first working branch
  (`claude/clever-gauss-07u08g`); switch it to `main` in the repository settings.
- **Hosting:** <https://web-production-30875dbb.up.railway.app>. Railway project "Flight Log", service `web`, built from `main` on every
  push. `npm run build` then `npm start` (a static file server over `dist/`). Nothing on
  Railway stores logbook data; it lives in the browser's IndexedDB.
- **Checks:** `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`,
  `npm run build`. GitHub Actions runs the same five on every push and pull request.

## Map of the code

| Path                  | What it is                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/model`      | Canonical types: `Entry`, `Airframe`, `AircraftType`, `Logbook`                                                                               |
| `src/core/aircraft`   | Built-in type list and `matchType`; the pilot's aircraft edits (`applyAircraftEdits`); drawings per type (`silhouetteOf`); engine buckets     |
| `src/core/importers`  | `importLogTen`, `importForeFlight` → `SourceRecord`s; `toLogbook` → canonical entries; `presets.ts` holds this pilot's custom-column mappings |
| `src/core/reconcile`  | `matchRecords` (pairing two imports), `diffPair` (field-by-field comparison), `resolve` (apply decisions), `toMergedLogbook`                  |
| `src/core/validation` | 35 rules, `validate`, per-source default rule switches                                                                                        |
| `src/core/query`      | `indexLogbook`, `filterEntries`, `sortEntries`, `totalEntries`, `groupEntries`, `aircraftUsage`                                               |
| `src/core/airports`   | Bundled airport table (generated, ~3 MB) and lookup                                                                                           |
| `src/core/time`       | Durations in minutes; UTC clock ⇄ local date helpers; sun position (`isNight`, `isNightForLandings`)                                          |
| `src/storage`         | Dexie database, `LogbookStore` (books, source files, decisions, aircraft edits), `importFile`, `loadAudit` / `writeMainBook`, airport loader  |
| `src/app`             | React screens: shell, import, ledger, entry detail, aircraft, audit, settings; `art/silhouettes.ts` holds the type drawings                   |
| `scripts`             | `profile`, `audit`, `validate`, `build:airports` command-line tools                                                                           |
| `fixtures`            | Synthetic exports that reproduce each file quirk; `fixtures/pair` is a matching LogTen + ForeFlight pair for the audit                        |
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
- `main` ("My logbook") is written only by the "Build my logbook" button on the audit screen.
- Books imported before milestone 5 have no stored source file. The audit needs both files
  imported again once (`loadAudit` reports which are missing).
- Column mappings for custom fields are hard-coded in `src/core/importers/presets.ts`
  for this one pilot. They need to become a setting before anyone else can use the app.
- The airport table is one 3 MB chunk (1 MB compressed). Dropping names or the smallest
  airports would shrink it considerably.
- Lint reports two warnings (one is the list-virtualisation library being incompatible with
  the React compiler; the other has not been looked at).

Core:

- Fingerprint stability between two exports taken at different times has not been tested:
  only one pair of exports (2026-11-17) has been seen. The pilot expects LogTen not to write
  anything that changes per export. Check it when the next exports arrive: the audit screen
  lists decisions that no longer match anything.
- In the two imported books the operating rule still defaults to Part 91 where the source
  does not state it. In the merged logbook it is proposed and confirmed on the audit screen.
- Night time is taken from the source as typed. Computing it from times and position
  (DESIGN §5) is not built, so there is no independent check on it beyond "not more than total".
- `totalSource` is always `typed` after import, even when clock times agree with the total.
- The built-in type list (`src/core/aircraft/catalog.ts`) holds only the types this pilot has
  flown, the CRJ-450/550 conversions and two simulator types. Any other type keeps the
  source's code; the pilot can complete it on the Types screen. Simulators that ForeFlight
  records as representing `C172` (no model) point at an unlisted `C172` type for the same
  reason; editing the simulator fixes it.
- Seven type drawings exist (`src/app/art/silhouettes.ts`); the pilot intends to add more
  and to set up a workflow for drawing them. The file's header says how to add one.
- People are keyed by the words of their name in any order. Different spellings of one
  person (7 people in the real exports) are still separate people and show as crew differences.
- No export (DESIGN §9), no experience report (§8), no Drive sync (§3.3).
- `npm audit` reports vulnerabilities in dev dependencies; not triaged.

## Milestones 5 and 6: what was built

**Milestone 5, the audit** (DESIGN §7; §7.2–§7.4 describe what is built):

- Decisions stored by fingerprints of the raw rows and replayed on re-import
  (`src/core/reconcile/types.ts`, `resolve.ts`); merged logbook (`merge.ts`); glue in
  `src/storage/audit.ts`.
- Audit screen (`src/app/routes/AuditRoute.tsx`, `components/AuditOverview.tsx`,
  `components/AuditDetail.tsx`, `lib/audit.ts`): open counts, totals per app and merged,
  rules for whole groups, per-field choice, pairing confirmation and pairing by hand,
  one-app-only entries, stale decisions, "Fix in the apps", "Build my logbook".
- Settled without asking (pilot's choice): rounding keeps the more precise value; a flight
  number only one app has is taken.
- Takeoffs and landings decided together, with a suggested side (`suggest.ts`, sun position
  in `src/core/time/sun.ts`). Operating-rule proposals (`rules.ts`). Crew compared person by
  person; given and family names stored separately; Settings for name order and flight-number
  style. Flight numbers stored as `DL3939`.

**Milestone 6, aircraft management** (DESIGN §4.3):

- Built-in type list mapping both apps' spellings onto one set of types
  (`src/core/aircraft/catalog.ts`, `match.ts`).
- Aircraft screen (`src/app/routes/AircraftRoute.tsx`, forms in
  `components/AircraftForms.tsx`): types, aircraft and simulators with totals, drawings,
  links between them and to the logbook (`?type=`, `?aircraft=`).
- Editing types, aircraft (type history and conversions, registrations, serial number, TAA,
  notes), simulators (name, level, represented type, notes, merging two into one), fleet
  conversions from a pasted list, and adding an aircraft by hand. Edits live in the
  `profile` table apart from the books and are applied when a book is read (`useBook`), so
  re-imports keep them.
- Side-view drawings for seven general shapes plus simulators, drawn for this app
  (`src/app/art/silhouettes.ts`); each listed type names its shape, others fall back by class
  and engine.

What the real exports (2026-11-17: 1,771 LogTen rows, 1,813 ForeFlight rows) show:

- 1,770 pairs, 21 below an exact match; 44 one-app-only entries (43 simulator sessions in
  ForeFlight, 1 ground session in LogTen).
- With rounding and flight numbers settled automatically, 1,983 fields are open before any
  rule. The blank-in-one-app rule leaves about 360, mostly crew, route, landings and remarks.
- 1,142 flights have no operating rule in either app: 116 CRJ legs from 2 Dec 2022 to
  15 Jul 2023 (proposed Part 121) and 1,026 piston flights (proposed Part 91).
- Both apps produce the same 16 types. CRJ-700: about 1,310 h in 659 flights.

## Milestone 7: where to start

Goal: the experience report of DESIGN §8, on screen first, then print/PDF and CSV.

Already in place to build on:

- `totalEntries`, `groupEntries` and `aircraftUsage` in `src/core/query`.
- Engine buckets (`inEngineBucket`, "turbojet-powered" and "turbine") in
  `src/core/aircraft/engines.ts`, as decided with the pilot: each aircraft keeps its actual
  engine; reports group them in the application's terms.
- `variantOf` on types, for the CRJ-550 / CRJ-450 sub-lines under their parents.
- `multiPilot`, the attribute flags, TAA per airframe (`Airframe.overrides`), device levels.
- Simulator time is never total time (see "Facts about the data").

A suggested order:

1. **Contract first** (`src/core/reports/types.ts`): a layout (sections, columns and rows
   switched on or off, period, rounding mode, rule filter) in; tables out (section →
   header + rows + total row, each cell a number of minutes or a count plus the entry ids
   behind it, so "every number can be tapped").
2. **A pure `experienceReport(logbook, index, layout)`** in core with exhaustive tests: by
   type (with variant sub-lines and an optional family line), by category/class, by engine
   bucket, by aircraft characteristic, simulators by device level and by represented type,
   custom duration fields as columns. Rounding per flight versus once on the total, as a
   layout option printed on the report. Hide all-zero rows and columns.
3. **The screen**: one route, the book switcher picks the book, sections as tables, a layout
   panel to switch things on and off, named layouts saved in the `profile` table. Tapping a
   number opens the logbook filtered to those entries (the filter needs an "entry ids" option,
   or a filter per cell).
4. **Print / PDF** with a landscape print stylesheet, then **CSV**.
5. Certificates, medical, flight review and IPC dates: a small profile page (DESIGN §8.1).

Check the report against ForeFlight's own Experience Report for the same period, as the
audit did with column totals.

Smaller items still open from earlier milestones: parse flight numbers out of ForeFlight
comments (they show up as longer remarks today).

## Asked for, for manual entry (milestone 9)

DESIGN §5 records three requests from the pilot: a PF tick that logs one takeoff and one
landing by day or night from the off/on times (the sun calculation already exists);
go-arounds or missed approaches as ticks with a short reason each; and an employment
timeline whose present employer supplies defaults, including the carrier's own code and a
choice of marketing partner so only the four digits of a flight number are typed. Flight
numbers then store the ICAO operating number plus the marketing carrier, shown as
`SKW(DL)5123` or ruby-style (DESIGN §5).

Open questions for the pilot are listed in DESIGN §12.
