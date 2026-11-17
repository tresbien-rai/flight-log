# Flight Log — Design Document

Status: **draft 2**, incorporating the pilot's answers to the first round of open questions. Nothing here is built yet except the repo scaffold.

## 1. What this is

A personal pilot logbook that runs as an installable web app on an iPad. It is a logbook only: no charts, no flight planning, no EFB functions.

It exists because the two apps in use today (LogTen Pro and ForeFlight) are both "spreadsheets with a nice entry form". They accept anything, they model airline and GA flying the same way, and logging in both means auditing them against each other by hand.

### Goals

1. **Part 91 and Part 121 flying are different things in the data model.** Every entry carries its operating rule, and every list, filter, total and report can be split by it.
2. **The logbook checks what you type.** A rule engine flags entries that are impossible, unlikely, or incomplete.
3. **Aircraft change over time.** A tail can be re-registered, and an airframe can be converted (CRJ-700 → CRJ-550). The logbook records when, and counts each flight under what the aircraft was on that day.
4. **An experience report worth using for applications**, starting from ForeFlight's layout and improving it.
5. **Import, audit and merge the existing LogTen and ForeFlight logbooks** into one clean record, with every disagreement resolved by the pilot.
6. **Leave room for crew-schedule import and voice entry** without building them yet.

### Not goals (for now)

- Anything other than logging: no weather, charts, W&B, duty/rest legality calculation.
- Multi-user accounts or a hosted service. The design should not prevent sharing later, but nothing is built for it.
- Non-FAA regulatory regimes.
- Endorsements, certificates and medical tracking (possible later; cheap to add once the core exists).

### Decisions already made

| Question                              | Answer                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Front end                             | React + TypeScript + Vite, installable PWA                                                             |
| Architecture                          | Architect's choice (see §3)                                                                            |
| Role next to LogTen / ForeFlight      | Runs alongside them at first, as an audit tool and report generator. Becomes the master logbook later. |
| When the two apps disagree            | No default winner. The pilot decides, with bulk actions for systematic patterns.                       |
| Logbook date                          | Local date at the departure airport                                                                    |
| Clock-time entry                      | UTC or local, both always shown; UTC is the default                                                    |
| Converted aircraft (CRJ-550, CRJ-450) | Their own lines on reports, shown as sub-lines beside the type they were converted from                |
| Hobbs / tach                          | Optional per profile; total time calculated from them when used                                        |
| Experience report                     | Start by matching ForeFlight's content, with every section, row and column switchable                  |
| Hosting                               | Railway (static site)                                                                                  |
| Drive layout                          | A visible "Flight Log" folder                                                                          |

---

## 2. What the real data says

Both exports (taken 2026-03-06) were profiled before designing anything. The findings below drive several decisions.

The exports are old and the pilot has since cleared the discrepancies listed here. The numbers stay in this document as evidence of what kinds of error occur, not as a to-do list.

|                       | LogTen Pro                                                                                                                                               | ForeFlight                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Format                | Tab-delimited, 280 columns, one row per leg, aircraft and type repeated on every row                                                                     | CSV with two stacked tables (aircraft, then flights), 68 columns |
| Rows                  | 1,652                                                                                                                                                    | 1,696 flights, 160 aircraft                                      |
| Date range            | 2014-02-25 → 2026-03-02                                                                                                                                  | same                                                             |
| Total time            | 2,637.3 h                                                                                                                                                | 2,662.2 h                                                        |
| Columns actually used | 124 of 280                                                                                                                                               | 58 of 68                                                         |
| Durations             | Decimal hours, 2 places                                                                                                                                  | Decimal hours, 1 place                                           |
| Clock times           | `HH:MM` UTC, airline legs only (since 2022-12)                                                                                                           | same                                                             |
| Date means            | same convention as each other (1,646 of 1,651 matched flights carry the same date); whether that is the UTC or the local date is not settled by the data |                                                                  |
| Simulator sessions    | 9 rows, one pseudo-tail                                                                                                                                  | 52 rows, five device IDs                                         |
| Part 121 marker       | `flight_faaPart121` on 498 of 616 airline legs                                                                                                           | custom `[Toggle]Part 121` on 482                                 |
| Part 91 marker        | never set                                                                                                                                                | none                                                             |

What follows from this:

- **A date is ambiguous without a stated convention.** A leg leaving LAX at 17:30 local is "today" locally and "tomorrow" in UTC. The two exports use the same convention as each other, but the files do not say which, so the new logbook stores exact UTC times and states what its date means (§4.2).
- **Neither logbook has the operating rule fully recorded.** About 120 airline legs have no Part 121 mark in either app, and no GA flight is marked Part 91 anywhere. This confirms goal 1 and means the import must infer a rule and ask for confirmation (§7.4).
- **"PIC + SIC + dual ≤ total" is not a valid check.** 160 dual-received flights also log PIC (legitimately, as a rated pilot under instruction), and every dual-given flight logs PIC. Validation rules have to know about roles (§6).
- **Zero landings is normal on an airline leg** (282 pilot-monitoring legs). The "takeoffs vs landings" check must depend on who was flying.
- **Aircraft records are messy in ways software should prevent:** `N738SK` and `N738SK␠` are two aircraft in ForeFlight; the CRJ-700 is spelled four ways; one CRJ is a "turbojet" and two have fixed gear.
- **Simulator time is modelled completely differently** in the two apps (a category in one, an equipment type in the other; session length in a different column from flight time in both). The new model treats a simulator session as its own kind of entry.
- **Both apps carry user-invented columns** that must survive: dual given split by student level (PPL / IRA / CPL), cross-country over 50 NM, passenger count, a "flag" toggle.
- **Approach strings are free text** ("ILS" and "ILS OR LOC RWY 24R" are the same thing; runway "6" vs "06").
- **`LOCAL` is used as a destination** on about 650 flights. It is not an airport.

### 2.1 First cross-match of the two exports

A throwaway script matched the two files flight by flight. This is a first pass, not the audit itself, but it sizes the job.

**Matching**

|                                                           | Count                                                |
| --------------------------------------------------------- | ---------------------------------------------------- |
| Matched one-to-one                                        | 1,651                                                |
| …on exact date, tail and airports                         | 1,634                                                |
| …date differs (by a day: 3; by weeks: 2), times identical | 5                                                    |
| …**tail differs**, same date, route and out time          | 8                                                    |
| …airport blank, `LOCAL` or different on one side          | 4                                                    |
| LogTen only                                               | 1 (a ground-training entry)                          |
| ForeFlight only                                           | 45 (43 simulator sessions, 2 zero-time airline rows) |

There is no real flight that exists in only one app. The 45 ForeFlight-only rows are simulator sessions never entered in LogTen (115.8 h of simulator time).

**Differences on matched flights**

| Field                                | Pairs differing                 | Nature                                                                                                    |
| ------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Total time                           | 506 by rounding only; 3 real    | ForeFlight keeps 0.1 h, LogTen 0.01 h. Real ones: **21.8 vs 2.3**, 1.2 vs 1.28, 1.3 vs 1.35               |
| PIC, dual received, dual given, solo | 0                               | identical                                                                                                 |
| Night                                | 44                              | ForeFlight always lower. LogTen often has night = full block time; ForeFlight looks auto-calculated       |
| Actual instrument                    | 30                              | both directions; individual entry differences                                                             |
| Simulated instrument                 | 26                              | 9 systematic (Redbird sessions), 17 individual                                                            |
| Landings                             | 34–56 depending on how compared | The apps count differently: LogTen's day landings include touch-and-goes, ForeFlight's are full-stop only |
| Takeoffs                             | 25 day, 11 night                | individual                                                                                                |
| Approaches                           | 18 count, 25 detail             | 16 approaches missing in ForeFlight; naming differs                                                       |
| Clock times                          | under 1%                        | 3 takeoff times differ by exactly 60 min, one is 00:00, one out time differs by 8 min                     |
| Tail number                          | 8                               | e.g. N706SK vs N768SK, N708SK vs N718SK — one app has the wrong aircraft                                  |
| Flight number                        | —                               | ForeFlight has no such field                                                                              |

**Grand totals (hours)**

|                   | LogTen  | ForeFlight | Why                                                          |
| ----------------- | ------- | ---------- | ------------------------------------------------------------ |
| Total             | 2,637.3 | 2,662.2    | +19.5 from one mistyped entry, +5.4 from per-flight rounding |
| Night             | 379.5   | 362.7      | 44 flights                                                   |
| Actual instrument | 128.7   | 125.5      | 30 flights                                                   |
| Simulator         | 9.5     | 125.3      | sessions logged only in ForeFlight                           |
| Landings          | 1,464   | 1,472      |                                                              |

What this adds to the design:

- **The audit is tractable.** Roughly 500 differences are rounding and can be resolved in one bulk decision. About 200 need a human look, and they cluster in night time, instrument time, landings and approaches.
- **Per-flight rounding costs real hours.** Rounding each flight to 0.1 h has inflated ForeFlight's total by 5.4 h over 1,650 flights. This is the case for storing minutes and rounding once.
- **One typo was worth 19.5 hours** and neither app noticed. A plausibility rule and a total derived from clock times each catch it.
- **Night time needs a stated policy** (computed from times and position, with override), because the two apps evidently used different ones.
- **Landing counts need exact definitions** (full-stop vs touch-and-go, day vs night) so that import maps each source correctly instead of comparing unlike numbers.
- **Wrong-tail entries are a real error class.** Schedule import would remove most of them; meanwhile the matcher must pair flights whose tails disagree and ask which is right.

---

## 3. Architecture

```
┌────────────────────────── iPad / browser ──────────────────────────┐
│                                                                    │
│   React UI  (src/app)                                              │
│      │                                                             │
│      ▼                                                             │
│   Core  (src/core)  — pure TypeScript, no browser APIs             │
│      model · validation · importers · reconcile · reports · time   │
│      │                                                             │
│      ▼                                                             │
│   Storage  (src/storage)                                           │
│      local database (IndexedDB)  ◄──── the app always reads/writes │
│      sync engine  ─────────────────┐   here first                  │
│                                    │                               │
└────────────────────────────────────┼───────────────────────────────┘
                                     ▼
                     Google Drive (the pilot's own account)
                     one app folder: logbook file + dated backups
```

### 3.1 No server

The app is static files plus the browser. Data lives in the browser's database and is synced to a folder in the pilot's own Google Drive.

Why:

- **Works with no signal.** Logging a flight on the ramp or in a hotel with bad Wi-Fi must never wait on a network. The local database is the working copy; Drive is the durable copy.
- **Nothing to run, pay for, or secure.** A logbook is a 20-year record. A server is one more thing that can lapse.
- **The data stays the pilot's.** It sits as a readable file in their Drive, not in someone's database.
- **Sharing later is free.** Another pilot opens the same URL, signs in with their own Google account, and gets their own logbook. No tenancy to design.

What it costs:

- **Google sign-in in the browser gives one-hour access with no silent renewal guarantee.** On an iPad home-screen app this can mean a sign-in prompt more often than is pleasant. Because the app is local-first, an expired sign-in only delays sync; it never blocks logging. If it proves annoying, a very small token-exchange service fixes it without touching anything else.
- **Voice entry and schedule import will probably need a small server-side piece** (to hold an API key for transcription, or to fetch a schedule from a site that blocks browsers). That is a separate, optional add-on behind the intake interface (§10), not a reason to put the logbook itself on a server.

### 3.2 The core is separate from the UI

Everything that decides what a logbook _means_ lives in `src/core` and may not touch React, the DOM, or storage: the data model, validation rules, importers, the matching and diffing logic, totals and reports. A lint rule enforces this.

This matters for three reasons. The logic is the valuable part and must be exhaustively unit-tested. The same code runs from the command line (`scripts/`) so audits can be run against the real exports before any UI exists. And it keeps a future backend, CLI or native wrapper possible without a rewrite.

### 3.3 Storage and sync

- **Local:** IndexedDB via Dexie. Tables: entries, airframes, aircraft types, people, airports (user-added only), custom field definitions, import batches, reconciliation decisions, settings.
- **Remote:** a visible "Flight Log" folder the app creates in Drive, using the narrow `drive.file` permission (the app can see only files it created). The folder is visible to the pilot, so the logbook file and backups can be copied or downloaded without the app.
- **File shape:** one `logbook.json` containing every record (about 2 MB for the current logbook), plus `backups/logbook-YYYY-MM-DD.json` written at most once a day and before every import or bulk change.
- **Merging two devices:** every record has an `updatedAt` and deletions leave a tombstone. On sync, the app downloads the remote file, merges record by record (newest edit wins per record), and uploads using Drive's version check so a concurrent upload is detected and retried instead of overwritten. For one pilot on one or two devices this is enough; it is deliberately not a general collaborative-editing system.
- **Schema version** is stored in the file. Migrations are pure functions in core, tested against saved samples of every earlier version.
- **Export is always available** without sign-in: full JSON, plus CSV in ForeFlight's import format (§9).

### 3.4 Hosting

The built app is static files, served from Railway alongside the pilot's assistant app. Deployment is a build on push to the main branch. Nothing on Railway holds logbook data.

---

## 4. Data model

Sketches only; field lists are not final.

### 4.1 Entry

One entry is one leg, one simulator session, or one ground-training session.

```ts
type EntryKind = 'flight' | 'simulator' | 'ground';
type OperatingRule = '91' | '121' | '135' | 'other';

interface Entry {
  id: string;
  kind: EntryKind;

  // When
  date: string; // logbook date, YYYY-MM-DD (see 4.2)
  out?: string;
  off?: string;
  on?: string;
  in?: string; // UTC instants
  hobbsOut?: number; // tenths of an hour, as shown on the meter
  hobbsIn?: number;
  tachOut?: number;
  tachIn?: number;
  totalSource: 'block' | 'hobbs' | 'typed';
  scheduledOut?: string;
  scheduledIn?: string;

  // What kind of flying
  rule: OperatingRule; // required on every flight
  operatorId?: string; // airline / flight school / none
  flightNumber?: string;

  // Where
  from?: string;
  to?: string; // airport idents; `to` omitted = local flight
  route?: string;

  // In what
  airframeId: string; // or a training-device id for simulators
  typeOverride?: string; // rare: overrides what the airframe was on this date

  // Role
  seat?: 'PIC' | 'SIC';
  pilotFlying?: boolean;

  // Durations, integer minutes
  total: number;
  pic: number;
  sic: number;
  solo: number;
  night: number;
  crossCountry: number;
  actualInstrument: number;
  simulatedInstrument: number;
  dualReceived: number;
  dualGiven: number;
  simulator: number;
  groundTraining: number;

  // Counts
  dayTakeoffs: number;
  nightTakeoffs: number;
  dayLandings: number;
  nightLandings: number; // each split full-stop / touch-and-go
  approaches: Approach[];
  holds: number;
  goArounds: number;

  crew: CrewMember[]; // personId + role
  custom: Record<string, number | boolean | string>; // user-defined fields
  remarks?: string;

  // Bookkeeping
  source: { kind: 'manual' | 'import' | 'schedule' | 'voice'; batchId?: string };
  acknowledged: string[]; // ids of validation findings the pilot has accepted
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

Points worth calling out:

- **`rule` is a required field, not a tag.** It is chosen by the entry profile (§5), so in practice it is never typed.
- **Durations are whole minutes.** Airline block times come in minutes; decimal hours are a display format. Storing minutes removes the rounding disagreements seen between the two apps (ForeFlight rounds to 0.1 h per flight, LogTen keeps 0.01 h), and lets a report choose its own rounding. Totals are summed in minutes and rounded once.
- **Where clock times exist, `total` is derived from them** (in − out) and cannot silently disagree. This would have caught the one 21.8 h entry for a 2.3 h leg in ForeFlight.
- **A simulator session is `kind: 'simulator'`**, with its length in `simulator`, `total` zero, no airports required, and a training device instead of an airframe. Simulated-instrument time and approaches are allowed on it.
- **Approaches are structured:** type from a fixed list (ILS, LOC, RNAV (GPS), RNAV (RNP), VOR, NDB, visual, …), runway normalised to two digits + L/C/R, airport, and flags (circle-to-land, missed). The chart title can be kept as a note.
- **Custom fields are first-class.** A definition has a name, a type (duration, count, toggle, text) and which profiles show it. The existing ones migrate as: `DG-PPL` / `DG-IRA` / `DG-CPL` (durations), passenger count (count), flag (toggle). The matching LogTen columns arrive unlabelled (`customTime1/2/3` and `customTime10`); the pilot has confirmed they are the same four fields, and matching column totals identifies fields 1, 2 and 3 as CPL, IRA and PPL. Cross-country over 50 NM becomes a built-in, because it can be checked against the distance between the airports.

### 4.2 Dates and times

- Clock times are stored as UTC instants (`2025-06-22T17:31Z`), never as bare `HH:MM`.
- `date` is the **local date at the departure airport**, which is what a paper logbook and an airline schedule use. When out-time and departure airport are known it is derived; for older entries with no clock times it is stored as given.
- The UTC date is always available as a derived value.
- **Imports are UTC-dated.** Both the LogTen and the ForeFlight export date an airline leg by the UTC date of departure (a leg leaving Los Angeles at 18:38 local on the 30th is dated the 31st). The converter takes the source date as UTC, resolves the clock times against it, and derives the local date from the departure airport's time zone. Reports that help the pilot find an entry in the old app show the source's date.

**Entering clock times.** ACARS reports give UTC, and typing UTC avoids conversion mistakes, so UTC is the default. Like LogTen, and unlike ForeFlight:

- Each time field accepts either UTC or local, with a switch on the form (remembered per profile).
- Whichever is typed, the other is shown beside it at once, using the time zone of the relevant airport (departure for out/off, arrival for on/in).
- The local date, and a "+1" marker when a leg crosses midnight in either zone, are shown as soon as the out time is entered, so a wrong date is visible before saving.
- Only the UTC instant is stored. Local is always computed, so a time-zone database update can never change what was logged.

This needs a time zone for every airport, which the bundled airport table carries (§4.4).

**Hobbs and tach.** Optional, switched on per profile (off by default, intended for GA). An entry then carries `hobbsOut` / `hobbsIn` and `tachOut` / `tachIn`. Each entry records where its total came from:

| Source of total | How it is calculated       |
| --------------- | -------------------------- |
| Block times     | in − out (airline default) |
| Hobbs           | hobbs in − hobbs out       |
| Typed           | entered directly           |

When a source is present the total is calculated from it and a typed total that disagrees is a validation error. Tach is recorded but never drives the total. The previous hobbs-in for the same airframe is offered as the next hobbs-out, and a gap or overlap between consecutive entries on one airframe is a note.

### 4.3 Aircraft: airframes, registrations, configurations

This is the part existing logbooks get wrong. They store "tail number → type" as one fixed fact. Here there are three separate things:

```ts
interface AircraftType {
  id: string;                 // ours, e.g. 'CRJ-550' — NOT the ICAO code
  icaoDesignator: string;     // 'CRJ7' (the 550 shares it with the 700)
  make: string; model: string;          // picked from a list, not typed
  category: 'airplane' | 'rotorcraft' | 'glider' | ...;
  class: 'ASEL' | 'AMEL' | 'ASES' | 'AMES' | ...;
  engine: 'piston' | 'turboprop' | 'turbofan' | ...;
  typeRating?: string;        // 'CL-65' — shared by CRJ-200/450/550/700/900
  variantOf?: string;         // 'CRJ-550' → 'CRJ-700', 'CRJ-450' → 'CRJ-200'
  complex: boolean; highPerformance: boolean; taa: boolean;
  pressurized: boolean; retractable: boolean; tailwheel: boolean;
  seats?: number; mtowLb?: number;
}

interface Airframe {
  id: string;
  serialNumber?: string;
  registrations: { tail: string; from?: string; to?: string }[];
  configurations: { typeId: string; from?: string; to?: string }[];
  operatorId?: string;
}

interface TrainingDevice { id: string; name: string; level: 'FFS' | 'FTD' | 'AATD' | 'BATD'; represents?: string; }
```

- An **entry points at an airframe**, not at a tail string. What tail it wore and what type it was are looked up by the entry's date.
- **A conversion is one edit:** "N7xxSK: CRJ-700 until 2025-03-09, CRJ-550 from 2025-03-10". The app shows which existing entries move to the new type, and every report follows automatically. Nothing is re-typed.
- **A re-registration is one edit** too, and the airframe's history stays joined across both tails.
- **Converted variants are always counted separately.** The CRJ-550 (from the CRJ-700) and the coming CRJ-450 (from the CRJ-200) share a certificate and an ICAO designator with their parent, but each is its own type here, linked to the parent by `variantOf`. Reports list them as separate lines next to the parent (§8). Adding two lines is easy; splitting one line after the fact is not.
- **Reports can also group by ICAO designator or by type rating** when an application asks for CL-65 time as one number.
- **Conversion dates can be filled in later.** No CRJ-550 time is logged yet, so this is in place before it is needed. An airframe with no configuration history simply has one type. When dates are found, entering them re-counts any affected entries.
- **Attributes belong to the type, not the tail**, so one CRJ cannot be a turbojet with fixed gear. A per-airframe override exists for real differences (a TAA-equipped 172 among non-TAA ones).
- **Tails are normalised on entry** (trimmed, upper-cased) and are unique per date range.
- A fleet conversion list can be pasted or imported in bulk (tail + effective date), since a company converts many airframes.
- Validation flags entries within a few days of a configuration change for a second look, since the effective date is the easy thing to get wrong.

### 4.4 People, operators, airports

- **People** are records (name, optional employee number), referenced by entries with a role. Imports arrive with three name formats ("Last; First", "Last, First", "First Last"); the importer normalises and proposes merges rather than creating three people.
- **Operators** (an airline, a flight school) carry defaults: rule, usual seat, flight-number prefix. They exist mainly to drive profiles and filters.
- **Airports** ship as a bundled read-only table (ident, IATA, name, lat/long, time zone), used for ident equivalence (`LAX` = `KLAX`), local dates, distance (cross-country checks) and day/night calculation. The pilot can add private strips.

---

## 5. Entry profiles

The entry form is not one form. A **profile** decides which fields are shown, which are pre-filled, and which validation rules apply.

|             | Airline (Part 121)                                        | GA (Part 91)                     | Instruction given                 | Simulator                  |
| ----------- | --------------------------------------------------------- | -------------------------------- | --------------------------------- | -------------------------- |
| Rule        | 121                                                       | 91                               | 91                                | —                          |
| Shown first | flight number, tail, from/to, out/off/on/in, PF/PM        | tail, from/to, total, landings   | tail, student, total, lesson type | device, length, approaches |
| Pre-filled  | seat, operator, cross-country, crew from the previous leg | PIC = total, aircraft last flown | PIC = dual given = total          | —                          |
| Derived     | total, night, landings day/night split                    | night if times given             | —                                 | —                          |
| Hidden      | solo, dual                                                | flight number, pax               | flight number, pax                | airports, landings         |

Profiles are data, not code, so a new kind of flying (Part 135, a second airline) is a new profile, not a new screen. Night time and the day/night split of landings are computed from times and airport positions whenever those are known, and can be overridden.

---

## 6. Validation

A rule is a pure function: given an entry and its context (the airframe, neighbouring entries, settings), it returns zero or more findings.

```ts
interface Finding {
  ruleId: string;
  severity: 'error' | 'warning' | 'note';
  fields: string[];
  message: string;
  fix?: Suggestion;
}
```

- **Error** — cannot be true. Blocks saving a new entry; on imported entries it is shown and must be fixed or explicitly overridden.
- **Warning** — unlikely. Saved, but listed until fixed or acknowledged.
- **Note** — incomplete or worth a look.

Acknowledging a warning records it on the entry, so it stays quiet but remains visible in an audit view. Rules run on entry, on import, and across the whole logbook on demand.

Starting rule set:

**Within one entry**

- No component time (PIC, SIC, night, instrument, dual, solo, cross-country) exceeds total.
- PIC and SIC are not both logged for the same time, except where a profile allows it.
- Solo requires no other crew and PIC = solo.
- Dual given requires PIC; dual received requires an instructor named.
- Total equals in − out when both are present; airborne time (on − off) is less than block time; out ≤ off ≤ on ≤ in.
- Takeoffs and landings: on a leg from A to B flown as pilot flying, at least one of each; totals plausible for the duration (99 takeoffs and 1 landing is an error; 12 landings in 1.0 h is a warning). Pilot-monitoring legs may have none.
- Night landings require some night time, or a landing time after dark at that airport.
- Approaches or holds require instrument time (actual or simulated), or a simulator entry. Warning, not error.
- Actual + simulated instrument ≤ total.
- Cross-country over 50 NM requires the airports to be more than 50 NM apart.
- Duration plausible for the type and distance (catches 21.8 h in a CRJ, or a 20-minute LAX–JFK).
- From / to are known airports; aircraft exists and was in service on that date.
- Airline profile: flight number present, crew present, rule is 121.

**Across entries**

- Same airframe, overlapping times.
- The pilot in two places at once.
- A leg's departure airport differs from the previous leg's arrival on the same duty day (note).
- Likely duplicates (same date, airframe, airports, and time).
- Entry dated within a few days of that airframe's configuration or registration change.

**Across the logbook**

- Aircraft types with inconsistent attributes; airframes never flown; people who look like the same person.

Each rule has an id, a test file, and a one-line explanation the UI can show. Rules can be switched off individually.

---

## 7. Import, audit and merge

This is the first thing to be built, because it produces the clean logbook everything else needs and is useful on day one while both old apps stay in use.

### 7.1 Stages

```
 LogTen .txt ──► parse ──┐
                         ├──► normalise ──► match ──► diff ──► resolve ──► canonical entries
 ForeFlight .csv ► parse ┘        │            │         │         │
                                  ▼            ▼         ▼         ▼
                            raw rows kept   pairs +   field-level  decisions
                            verbatim        orphans   differences  saved
```

1. **Parse.** One adapter per source. It knows the file's quirks (LogTen: padded header names, quoted multi-line cells, thousands separators; ForeFlight: two stacked tables, CRLF, structured `a;b;c` cells) and nothing else. Every raw row is kept verbatim with its line number.
2. **Normalise** into a common shape: minutes, UTC instants, canonical airport idents, trimmed tails, structured approaches, people split from roles. Each normalisation is a named, tested step and is recorded on the row, so the audit can say "these differ only because of trailing whitespace".
3. **Match** rows one-to-one, in tiers of decreasing strictness: exact (date, tail, from, to, out time) → date off by a day or more with identical times → same day and route with a different tail → same day and time with a different route. Each pair records its tier; anything below the first tier is shown for confirmation. Unmatched rows on either side are "orphans".
4. **Diff** every comparable field of each pair, and classify each difference: _equivalent_ (same value, different representation), _systematic_ (a known pattern such as 0.1 h rounding), or _real_.
5. **Resolve.** The pilot picks a value per real difference: LogTen's, ForeFlight's, or a typed one. Systematic classes can be resolved in bulk ("for all 412 rounding differences, keep the more precise value"). Orphans are kept, dropped, or matched by hand.
6. **Produce canonical entries**, run the full validation rule set over them, and list what it finds.

### 7.2 Decisions are saved

Each resolution is stored against a fingerprint of the two raw rows. Importing a fresher export three months later replays every earlier decision automatically and asks only about what is new or changed. This is what makes "run alongside for a while" workable: the audit becomes a five-minute monthly check instead of a side-by-side read.

### 7.3 The audit screen

A table of pairs, filterable by difference class, field, year, aircraft type and rule. Selecting a pair shows the two rows side by side with differing fields highlighted, and the validation findings for each candidate value. A summary at the top shows grand totals per source and the running total of the merged logbook, so the pilot can see the numbers converge.

### 7.4 Filling in the operating rule

Neither source records the rule reliably. On import, the app proposes one per entry from the evidence (explicit flag → airline type + SIC + flight number or crew → otherwise 91), groups the proposals ("118 unflagged CRJ legs, 2022-12 to 2023-07: mark as Part 121?"), and applies them only when confirmed.

### 7.5 Aircraft on import

Aircraft from both sources are merged into airframes by normalised tail. Type spellings are mapped onto the built-in type list once ("CL-600 Regional Jet CRJ-700", "Regional Jet CRJ-700" → CRJ-700). Conversions are not in either export and are entered afterwards (§4.3).

### 7.6 Privacy of real data

Real exports contain other people's names. They live only in the git-ignored `data/` directory. Tests use small synthetic fixtures written to reproduce each quirk found in the real files.

---

## 8. Experience report

The first version reproduces the content of ForeFlight's Experience Report, whose strength is the fine breakdown by class and by type. Every section, row and column can be switched off, and anything that is entirely zero is hidden unless asked for (ForeFlight always prints NVG columns; this report will not).

### 8.1 Sections (from the ForeFlight sample)

| Section                         | Rows                                                              | Columns                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                          | —                                                                 | Name, period covered ("All Time" or a date range)                                                                                               |
| Certificates                    | Each certificate with its ratings and type ratings; medical class | —                                                                                                                                               |
| Flight tags                     | Last flight review, last IPC                                      | date                                                                                                                                            |
| Aircraft characteristic         | Complex, TAA, high performance, retract, turbine                  | total                                                                                                                                           |
| Category / class                | AMEL, ASEL, …                                                     | total, PIC                                                                                                                                      |
| Engine type                     | Turbofan, piston, …                                               | total, PIC                                                                                                                                      |
| Simulator (by device level)     | AATD, BATD, FFS, FTD                                              | simulated flight, simulated instrument                                                                                                          |
| **Experience by aircraft type** | One per type, with flight count, plus totals                      | total time, day landings, night landings, all landings, PIC, SIC, XC, actual instrument, simulated instrument, night, dual given, dual received |
| Simulator by type represented   | One per type, with session count, plus totals                     | simulated flight, simulated instrument, dual given, dual received                                                                               |
| Custom fields by aircraft type  | One per type, plus totals                                         | one column per custom field                                                                                                                     |

Certificates, medical, flight review and IPC dates are typed into a small profile page for now; they are printed, not tracked.

### 8.2 Changes from ForeFlight

- **Show / hide anything.** Sections, columns and rows are individually switchable, and the choices are saved as named layouts ("Airline application", "Insurance renewal").
- **Empty columns and rows disappear** by default.
- **Converted variants are sub-lines.** CRJ-700 and CRJ-550 are separate rows, shown together with an optional combined line above them; the same for CRJ-200 and CRJ-450 (figures below are made up):

  ```
  CRJ-700 family      739 flights   1,420.5
     CRJ-700          565 flights   1,106.0
     CRJ-550          174 flights     314.5
  ```

  ForeFlight groups by ICAO code and so cannot separate them.

- **Types are our types, not ICAO codes**, so `C172` can stay one line or be opened into 172R / 172S when wanted.
- **Operating rule as a dimension.** A Part 121 / Part 91 split is available as a section of its own and as a filter on the whole report.
- **Extra columns available** (off by default): turbine PIC, multi-engine PIC, PIC cross-country, night PIC, approaches, holds.
- **Period.** All time, a date range, or a set of standard look-backs (30 / 90 days, 6 / 12 / 24 months) side by side.
- **Custom fields sit where they belong.** Duration fields (DG-PPL, DG-IRA, DG-CPL, XC over 50 NM) can be columns in the main experience table instead of a separate table. Toggles and counts (flag, passenger count) are off by default, since a sum of passenger counts is rarely wanted.
- **Every number can be tapped** to list the entries behind it.
- **Rounding** is a report option (per flight, as ForeFlight does, or once on the total) and is printed on the report.
- **Output:** on screen, print / PDF (landscape, as the sample), and CSV.

Reports are pure functions in core: entries and a layout in, a set of tables out. The UI and the PDF only draw the tables.

---

## 9. Export

- **ForeFlight CSV** in its import-template layout, so ForeFlight's logbook can be refreshed from this one while it remains the EFB.
- **LogTen tab-delimited**, while LogTen is still in use.
- **Plain CSV and JSON** of everything.
- **Printable logbook pages** (later).

Export adapters are the importers' mirror images and are tested by round trip: export → import → identical entries.

---

## 10. Later: schedule import and voice entry

Neither is built in the first version. One decision now keeps both cheap: **every way of creating an entry produces a draft, and every draft goes through the same review screen and the same validation.**

```ts
interface DraftEntry {
  fields: Partial<Entry>;
  confidence: Record<string, number>;
  origin: 'manual' | 'schedule' | 'voice' | 'import';
  raw?: unknown;
}
```

- **Schedule import** turns a pairing into draft legs (date, flight number, airports, scheduled times, crew). After the flight the pilot opens the draft and supplies only what the schedule could not know: actual times, tail, who flew, approaches. The source format is not chosen yet; it will be one more adapter.
- **Voice entry** turns a spoken debrief ("Skywest 3412, 788 Sierra Kilo, out at 1514, off at 46, on 1647, in 51, my leg, RNAV 28 left") into a draft with a confidence per field. Low-confidence fields are highlighted on the review screen. The grammar is small and domain-specific, which makes it tractable; speech-to-text quality on iPad Safari is the unknown, and may require a small server-side transcription call.
- Because drafts carry partial data, a schedule draft and a voice draft for the same leg can be merged.

---

## 11. Build order

Milestones 0 to 3 are done.

| #     | Milestone                                                     | What exists at the end                                                                            |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 0     | Scaffold                                                      | Repo, tooling, CI, this document                                                                  |
| 1     | Core model + importers                                        | Both exports parse into the common shape; command-line profile of each file; synthetic fixtures   |
| 2     | Matching + diff                                               | Command-line audit report of the two real exports: pairs, orphans, classified differences, totals |
| 3     | Validation engine                                             | Rule set runs over imported data from the command line                                            |
| 4     | App shell + local storage                                     | Installable PWA; import files; browse entries; filter by rule, type, date                         |
| 5     | Audit UI                                                      | Resolve differences, save decisions, re-import replays them. **First point of real usefulness.**  |
| 6     | Aircraft management                                           | Airframes, registrations, configurations, bulk conversion entry                                   |
| 7     | Experience report                                             | On screen, PDF, CSV                                                                               |
| 8     | Drive sync + backups                                          | Data survives a lost iPad                                                                         |
| 9     | Manual entry with profiles                                    | The app can become the master logbook                                                             |
| 10    | Export to ForeFlight / LogTen                                 | Old apps can be fed or retired                                                                    |
| later | Schedule import, voice entry, printable logbook, endorsements |                                                                                                   |

Milestones 1–3 need no UI and are well-specified, test-driven work, which suits delegation to cheaper models with review. Milestones 5 and 9 carry the design risk and need the most attention.

---

## 12. Open questions

Answered: logbook date, time entry, report layout, converted variants, custom field labels, hosting, Drive layout, hobbs/tach. Still open:

1. **Conversion dates** for CRJ-700 → CRJ-550 (and later CRJ-200 → CRJ-450) airframes. Not needed until the first such flight is logged.
2. **Crew schedule source and format**, when that feature comes up.
