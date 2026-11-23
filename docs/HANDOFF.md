# Handoff

Where the project stands, how to pick it up, and what is known to be unfinished. Read this
first, then `docs/DESIGN.md` for the reasoning behind each decision. Update both as work lands.

Last updated: milestone 8, first part (backup file and restore). Next: Drive sign-in trial on the iPad, then Drive sync.

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
| 7 Experience report         | done                         |
| 8 Drive sync + backups      | backup file done; Drive next |
| 9–10                        | not started (see DESIGN §11) |

- **Branch:** `main` exists and is what Railway deploys. Work happens on a branch and reaches
  `main` by pull request, merged by the agent once CI passes (see CLAUDE.md). In the
  milestone 7 session the agent's merge was blocked by the session's own permission check, and
  the pilot merged by hand; if that happens, say so and leave the merge to the pilot. GitHub's default branch may still be the first working branch
  (`claude/clever-gauss-07u08g`); switch it to `main` in the repository settings.
- **Hosting:** <https://web-production-30875dbb.up.railway.app>. Railway project "Flight Log", service `web`, built from `main` on every
  push. `npm run build` then `npm start` (a static file server over `dist/`). Nothing on
  Railway stores logbook data; it lives in the browser's IndexedDB.
- **Checks:** `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`,
  `npm run build`. GitHub Actions runs the same five on every push and pull request.

## Map of the code

| Path                  | What it is                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/model`      | Canonical types: `Entry`, `Airframe`, `AircraftType`, `Logbook`                                                                                                                  |
| `src/core/aircraft`   | Built-in type list and `matchType`; the pilot's aircraft edits (`applyAircraftEdits`); drawings per type (`silhouetteOf`); engine buckets                                        |
| `src/core/importers`  | `importLogTen`, `importForeFlight` → `SourceRecord`s; `toLogbook` → canonical entries; `presets.ts` holds this pilot's custom-column mappings                                    |
| `src/core/reconcile`  | `matchRecords` (pairing two imports), `diffPair` (field-by-field comparison), `resolve` (apply decisions), `toMergedLogbook`                                                     |
| `src/core/validation` | 35 rules, `validate`, per-source default rule switches                                                                                                                           |
| `src/core/reports`    | `experienceReport` (layout in, tables out), built-in layouts, look-back dates, `reportToCsv`                                                                                     |
| `src/core/backup`     | The backup file: shape and version (`types.ts`), `toBackup`, `parseBackup`, `summarizeBackup`, migrations                                                                        |
| `src/core/query`      | `indexLogbook`, `filterEntries`, `sortEntries`, `totalEntries`, `groupEntries`, `aircraftUsage`                                                                                  |
| `src/core/airports`   | Bundled airport table (generated, ~3 MB) and lookup                                                                                                                              |
| `src/core/time`       | Durations in minutes; UTC clock ⇄ local date helpers; sun position (`isNight`, `isNightForLandings`)                                                                             |
| `src/storage`         | Dexie database, `LogbookStore` (books, source files, decisions, aircraft edits, profile documents), `importFile`, `loadAudit`, `collectBackup` / `restoreBackup`, airport loader |
| `src/app`             | React screens: shell, import, ledger, entry detail, report, aircraft, audit, settings; `art/silhouettes.ts` holds the type drawings                                              |
| `scripts`             | `profile`, `audit`, `validate`, `report`, `build:airports` command-line tools                                                                                                    |
| `fixtures`            | Synthetic exports that reproduce each file quirk; `fixtures/pair` is a matching LogTen + ForeFlight pair for the audit; `fixtures/backup` holds a sample backup per version      |
| `data/`               | Git-ignored. Real exports and generated reports go here and nowhere else                                                                                                         |

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
- Lint reports one warning: the list-virtualisation library is incompatible with the React
  compiler.

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
- No export to the apps (DESIGN §9), no Drive sync (§3.3). The backup file is the JSON export.
- Flight numbers are not parsed out of ForeFlight comments; they show up as longer remarks.
- Custom field definitions (`CUSTOM_FIELDS`, beside the column mappings in
  `src/core/importers/presets.ts`) are this pilot's, hard-coded like the mappings.
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

## Milestone 7: what was built

DESIGN §8.3 is the full description. In short:

- `experienceReport` in `src/core/reports` (contract in `types.ts`): recent experience
  (look-backs from an "as of" date), characteristics, category and class, engine, operating
  rule, by type (variant sub-lines, optional family line, or grouped by ICAO designator or
  type rating), simulators by level and by represented type; custom fields as columns.
  Rounding once or per flight. Every cell carries the entry ids behind it.
- Report screen (`src/app/routes/ReportRoute.tsx`, `components/ReportSheet.tsx`,
  `components/ReportLayoutPanel.tsx`, `styles/report.css`): three built-in layouts, saved
  layouts (profile table, `reportLayouts`), a layout panel for every switch, print or PDF on
  one landscape page, CSV. Tapping a number opens the logbook with a "Report: …" filter
  (`?report=1`; the list itself is in memory in the shell).
- Pilot details for the report header in Settings (profile table, `pilot`;
  `src/core/model/pilot.ts`).
- `npm run report` prints the report for an export.
- Checked against ForeFlight's own report of 2 June 2024 with the "Like ForeFlight" layout:
  every figure of the type, class, engine and simulator tables matches. Complex and
  retractable differ because the type list corrected ForeFlight's aircraft attributes.

Left for later: a user-defined filter for the report (the pilot mentioned LogTen's; not
needed yet), certificates as structured data rather than text.

## Milestone 8: what is built, and what is next

Goal: data survives a lost iPad (DESIGN §3.1, §3.3). Agreed with the pilot: build the backup
file, restore, and Drive sync now; leave two-device merge until after milestone 9.

**Built (DESIGN §3.3, "as built"):**

- `src/core/backup`: the file shape (version 1), `toBackup`, `serializeBackup`, `parseBackup`
  (refuses with a reason; migrates older versions), `summarizeBackup`. A synthetic sample of
  version 1 is in `fixtures/backup/v1.json` and is read by the tests.
- `src/storage/backup.ts`: `collectBackup` reads the store; `restoreBackup` rebuilds the two
  imported books from the backup's export files (`convertSource`, shared with `importFile`)
  and writes everything in one transaction through the new `LogbookStore.replaceAll`.
- Settings → Backup (`src/app/components/BackupSettings.tsx`): download, share, restore with a
  confirmation that names what is deleted, last-backup time, persistent-storage request.
- The backup is the small one: export files, decisions, aircraft edits, profile documents,
  `main`, and the name-order and flight-number-style settings. Restore replaces; it never
  merges.

Measured: converting and saving both imported books at the real exports' row counts takes
about a quarter of a second in Node (an iPad will be slower, but it is the same work as one
import of each file). Not yet tried: a backup of the real data, and download or share from
the iPad home-screen app.

**What is on the device** (Dexie database `flight-log`, schema version 3, `src/storage/db.ts`):

| Table                                                        | What                                                                                                      | In the backup?                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `entries`, `airframes`, `aircraftTypes`, `devices`, `people` | three books (`logten`, `foreflight`, `main`), rows keyed by book                                          | `main` only; the other two are rebuilt  |
| `books`                                                      | info per book (file name, import time, notes)                                                             | for `main`; rebuilt for the others      |
| `sources`                                                    | the two export files as text (about 1.6 MB together)                                                      | yes                                     |
| `decisions`                                                  | every audit decision                                                                                      | yes                                     |
| `profile`                                                    | aircraft edits (`aircraftEdits`), saved report layouts (`doc:reportLayouts`), pilot details (`doc:pilot`) | yes                                     |
| `settings`                                                   | display choices, selected book, working report layout, last-backup time                                   | name order and flight-number style only |

A new table or profile document must be added to the backup (`BackupContents`, `collectBackup`,
`restoreBackup`, `replaceAll`) with a new version and migration, or it will not survive a restore.

**Next: Drive.** The pilot is creating a Google Cloud project of its own for this app (not
shared with another project, so the sign-in screen carries this app's name): Drive API
enabled, an OAuth client ID of type "Web application", authorised JavaScript origins for the
Railway URL and `http://localhost:5173`, the `drive.file` scope only, published to production
so grants do not lapse weekly. The client ID is not secret; pass it at build time
(`VITE_GOOGLE_CLIENT_ID`, set on Railway). Then, in order:

1. **Sign-in trial** on the real iPad from the home-screen app: Google Identity Services'
   token client, one file uploaded. This is the known risk (popups in standalone mode,
   one-hour tokens with no silent renewal; DESIGN §3.1). If it fails, the small token-exchange
   service of §3.1 is needed before anything else. Load Google's script only when the pilot
   taps "Sign in", so the app stays whole offline.
2. **Sync:** create the visible "Flight Log" folder, upload `logbook.json` (the backup shape),
   write `backups/logbook-YYYY-MM-DD.json` at most once a day and before every import or bulk
   change, show when the last successful sync was. An expired sign-in only delays sync. Write
   the Drive calls behind an interface so tests use an in-memory fake; this container may not
   reach Google. `toBackup` gives the same text for the same data apart from `createdAt`,
   which can be used to skip an upload when nothing changed.
3. **After milestone 9, two devices:** merge on sync by record timestamps with tombstones, and
   upload with a version check and retry on conflict (whether Drive's check is strong enough
   is not verified). Entries have `createdAt` / `updatedAt` / `deletedAt` and decisions have
   `decidedAt`; aircraft edits and profile documents have no timestamp and need one each, or
   whole-document "newest wins".

## Asked for, for manual entry (milestone 9)

DESIGN §5 records three requests from the pilot: a PF tick that logs one takeoff and one
landing by day or night from the off/on times (the sun calculation already exists);
go-arounds or missed approaches as ticks with a short reason each; and an employment
timeline whose present employer supplies defaults, including the carrier's own code and a
choice of marketing partner so only the four digits of a flight number are typed. Flight
numbers then store the ICAO operating number plus the marketing carrier, shown as
`SKW(DL)5123` or ruby-style (DESIGN §5).

Open questions for the pilot are listed in DESIGN §12.
