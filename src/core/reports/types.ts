/**
 * The experience report: a logbook and a layout in, tables out. See docs/DESIGN.md §8.
 *
 * Conventions:
 * - Durations are integer minutes. Rounding to tenths for display is the UI's job, except that
 *   a `perFlight` layout rounds each entry to six minutes (0.1 h) before adding, as ForeFlight
 *   does. The report says which was used.
 * - Every cell carries the ids of the entries behind it, so any number can be opened as a list.
 * - Simulator and ground sessions are never flight time. Flight sections count flights only;
 *   simulator sections count simulator sessions only; ground sessions appear nowhere.
 */
import type { OperatingRule } from '../model';

/** Sections, in the order they are printed. */
export const SECTION_IDS = [
  'recent',
  'characteristics',
  'categoryClass',
  'engine',
  'rule',
  'types',
  'simulatorLevels',
  'simulatorTypes',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/**
 * Built-in columns. Custom fields are columns too, as `custom:<field id>`.
 *
 * Landings: `dayLandings` and `nightLandings` include touch-and-goes; `dayFullStop` and
 * `nightFullStop` do not (ForeFlight's "day" and "night" landing columns are full-stop only).
 *
 * The `pic…` columns are worked out per flight: PIC time that was also night (the smaller of
 * PIC and night), also cross-country, also instrument (actual plus simulated); PIC time in a
 * turbine or a multi-engine aircraft.
 */
export const BUILT_IN_COLUMNS = [
  'total',
  'pic',
  'sic',
  'crossCountry',
  'crossCountry50',
  'night',
  'actualInstrument',
  'simulatedInstrument',
  'dualGiven',
  'dualReceived',
  'solo',
  'picNight',
  'picCrossCountry',
  'picInstrument',
  'picTurbine',
  'picMultiEngine',
  'dayTakeoffs',
  'nightTakeoffs',
  'dayLandings',
  'nightLandings',
  'dayFullStop',
  'nightFullStop',
  'allLandings',
  'approaches',
  'holds',
  'simulator',
] as const;

export type BuiltInColumn = (typeof BUILT_IN_COLUMNS)[number];
export type CustomColumn = `custom:${string}`;
export type ColumnId = BuiltInColumn | CustomColumn;

export type ColumnUnit = 'minutes' | 'count';

export interface ColumnInfo {
  id: ColumnId;
  /** Full name, for the layout panel and tooltips. */
  label: string;
  /** Column heading, a few letters per line. */
  short: string;
  unit: ColumnUnit;
}

/** A period counted back from the report's "as of" date. Both ends inclusive. */
export interface LookBack {
  unit: 'days' | 'months';
  count: number;
}

export type ReportPeriod =
  | { kind: 'all' }
  /** Inclusive `YYYY-MM-DD` bounds; either may be absent. */
  | { kind: 'range'; from?: string; to?: string };

export type Rounding = 'total' | 'perFlight';

/** How the type table groups flights. */
export type TypeGrouping = 'type' | 'icao' | 'typeRating';

export interface SectionLayout {
  on: boolean;
  /** Columns shown, in order. Ids that do not apply to the section are ignored. */
  columns: ColumnId[];
  /** Row ids not shown. Totals still include them. */
  hiddenRows: string[];
}

export interface ReportLayout {
  period: ReportPeriod;
  /** Only flights under these rules. Empty: every rule. Simulator sessions are never filtered. */
  rules: OperatingRule[];
  rounding: Rounding;
  /** Show rows and columns that are zero throughout. */
  showEmpty: boolean;
  typeGrouping: TypeGrouping;
  /**
   * With `typeGrouping: 'type'`: a combined line above a type and its converted variants
   * (CRJ-700 family over CRJ-700 and CRJ-550). Without it, a variant is a sub-line under its
   * parent.
   */
  familyLines: boolean;
  /** Rows of the `recent` section. */
  lookBacks: LookBack[];
  /**
   * The date look-backs count back from. Absent: the period's end if it has one, otherwise
   * today.
   */
  asOf?: string;
  sections: Record<SectionId, SectionLayout>;
}

export interface NamedLayout {
  id: string;
  name: string;
  layout: ReportLayout;
}

export interface ReportCell {
  /** Minutes or a count, as the column's unit says. */
  value: number;
  /** Entries that contributed a non-zero amount, in logbook order. */
  entryIds: readonly string[];
}

export interface ReportRow {
  /** Stable within its section: a type id, a class, an engine, `121`, `d90`, `m12`, … */
  id: string;
  label: string;
  /** 1 for a variant under its parent or family line. */
  depth: 0 | 1;
  /** A combined line over its sub-lines; not added into the section total. */
  family?: boolean;
  /** Flights (or simulator sessions) in this row. */
  count: number;
  /** The entries in this row. */
  entryIds: readonly string[];
  /** One per section column, in the same order. */
  cells: ReportCell[];
  /** For `recent` rows: the dates the row covers. */
  range?: { from: string; to: string };
}

export interface ReportSection {
  id: SectionId;
  title: string;
  /** Heading of the label column, e.g. "Aircraft type". */
  rowHeading: string;
  /** What `count` counts, for "914 flights". Absent: the section shows no count. */
  countNoun?: { one: string; many: string };
  columns: ColumnInfo[];
  rows: ReportRow[];
  /** Absent where rows overlap (characteristics, look-backs) and a sum would mean nothing. */
  total?: ReportRow;
}

export interface Report {
  /** Resolved period: the first and last date covered, or undefined when there are no entries. */
  period: ReportPeriod;
  covered?: { from: string; to: string };
  asOf: string;
  rounding: Rounding;
  rules: OperatingRule[];
  /** Sections that are on and have something to show, in print order. */
  sections: ReportSection[];
}

export interface ReportOptions {
  /** `YYYY-MM-DD`, for look-backs when the layout gives no other date. */
  today: string;
}
