/**
 * The common shape every importer produces. See docs/DESIGN.md §7.1.
 *
 * A SourceRecord is one row of somebody else's logbook, normalised just far enough to be
 * compared with a row from a different app. It is NOT a canonical Entry: turning records into
 * entries (merging aircraft into airframes, people into person records, resolving clock times
 * to instants, choosing between disagreeing sources) happens later.
 *
 * Rules for importers:
 * - Every field is optional unless stated. `undefined` means the source does not say;
 *   `0` or `false` means the source says none. A blank cell is `undefined`, not zero.
 * - Never drop a row. If a row cannot be understood, emit it with what could be read and add
 *   an issue.
 * - Never throw on bad cell content; report an issue. Throw only when the file as a whole is
 *   not the expected format.
 * - `raw` keeps every non-empty cell verbatim, keyed by the (trimmed) column header, so later
 *   stages can show the pilot exactly what the source said.
 */

import type {
  AircraftClass,
  Approach,
  CrewRole,
  CustomValue,
  DeviceLevel,
  DurationField,
  EngineType,
  EntryKind,
  OperatingRule,
} from '../model';

export type SourceId = 'logten' | 'foreflight';

/** Clock times as minutes after 00:00 UTC (0–1439). The date is not known at this stage. */
export interface SourceClock {
  out?: number;
  off?: number;
  on?: number;
  in?: number;
  scheduledOut?: number;
  scheduledIn?: number;
}

export interface SourceCounts {
  dayTakeoffs?: number;
  nightTakeoffs?: number;
  /** Day landings of every kind (full-stop and touch-and-go). */
  dayLandings?: number;
  /** Night landings of every kind. */
  nightLandings?: number;
  dayFullStopLandings?: number;
  nightFullStopLandings?: number;
  /** Full-stop landings, day and night together, when the source does not split them. */
  fullStopLandings?: number;
  touchAndGoes?: number;
  /** Every landing, day and night, of every kind. */
  allLandings?: number;
  holds?: number;
  goArounds?: number;
}

export interface SourcePerson {
  /** As written in the source, trimmed, internal whitespace collapsed. Not re-ordered. */
  name: string;
  /** The role of this person on the flight (not of the logbook owner). */
  role: CrewRole;
}

export interface SourceAircraft {
  /** Normalised: trimmed, upper case. */
  tail: string;
  /** Exactly as in the source, when it differs from `tail`. */
  tailRaw?: string;
  /** The source's own short type string, e.g. `C-172S` (LogTen) or `C172` (ForeFlight). */
  typeCode?: string;
  make?: string;
  model?: string;
  engine?: EngineType;
  class?: AircraftClass;
  /** Set when this is a simulator or training device rather than an aircraft. */
  deviceLevel?: DeviceLevel;
  /** True when the source marks it a training device but gives no level. */
  isDevice?: boolean;
  complex?: boolean;
  highPerformance?: boolean;
  taa?: boolean;
  pressurized?: boolean;
  retractable?: boolean;
  tailwheel?: boolean;
  year?: number;
  serialNumber?: string;
}

export interface SourceRecord {
  source: SourceId;
  /** 1-based record number within the file (the header or banner is record 1). */
  line: number;
  raw: Record<string, string>;

  kind: EntryKind;
  /** `YYYY-MM-DD` exactly as the source gives it. Required; rows without one get an issue. */
  date: string;

  /** Normalised tail, matching an entry in ImportResult.aircraft. Absent for ground rows. */
  tail?: string;

  /** Airport idents, trimmed and upper-cased. Never the placeholder `LOCAL`. */
  from?: string;
  to?: string;
  /** True when the source marks the destination as local (e.g. `LOCAL`). */
  localFlight?: boolean;
  route?: string;
  flightNumber?: string;

  clock: SourceClock;
  /** Integer minutes. Only fields the source has a non-blank value for. */
  durations: Partial<Record<DurationField, number>>;
  counts: SourceCounts;
  approaches: Approach[];

  /** Only when the source states it explicitly. */
  rule?: OperatingRule;
  pilotFlying?: boolean;

  people: SourcePerson[];
  /** User-defined fields. Durations in integer minutes, toggles as booleans, counts as numbers. */
  custom: Record<string, CustomValue>;
  remarks?: string;
}

export type IssueSeverity = 'error' | 'warning';

export interface ImportIssue {
  severity: IssueSeverity;
  /** Stable machine-readable code, e.g. `bad-duration`, `unknown-approach-type`. */
  code: string;
  message: string;
  /** Record number, when the issue belongs to one row. */
  line?: number;
  /** Source column header, when the issue belongs to one cell. */
  column?: string;
}

export interface ImportResult {
  source: SourceId;
  records: SourceRecord[];
  /** One per distinct normalised tail, in order of first appearance. */
  aircraft: SourceAircraft[];
  issues: ImportIssue[];
}

/** An importer is a pure function from file text to an ImportResult. */
export type Importer = (text: string, options?: ImportOptions) => ImportResult;

/**
 * What to do with a column the importer has no built-in meaning for (the user-defined
 * fields each app lets a pilot add). Supplied by the caller, keyed by source column header.
 * Unmapped user-defined columns still land in `custom` under a key derived from the header.
 */
export type ColumnMapping =
  /** Decimal hours that belong in a built-in duration field. */
  | { duration: DurationField }
  /** A toggle that, when true, states the operating rule. */
  | { rule: OperatingRule }
  /** A user-defined field, stored in `custom` under `key`. */
  | { custom: string; type: 'duration' | 'count' | 'toggle' | 'text' };

export interface ImportOptions {
  columns?: Record<string, ColumnMapping>;
}
