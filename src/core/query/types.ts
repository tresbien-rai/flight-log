/**
 * Reading a logbook: looking things up, filtering, and adding up. Pure functions used by the
 * UI and by reports. See docs/DESIGN.md §8.
 */
import type {
  AircraftType,
  Airframe,
  Durations,
  Entry,
  EntryKind,
  OperatingRule,
  Person,
  Seat,
  TrainingDevice,
} from '../model';

/** Lookups over one logbook, built once and reused. */
export interface LogbookIndex {
  airframeOf(entry: Entry): Airframe | undefined;
  deviceOf(entry: Entry): TrainingDevice | undefined;
  /** The aircraft type in force on the entry's date, honouring `typeOverride`. */
  typeOf(entry: Entry): AircraftType | undefined;
  /** The tail the airframe wore on the entry's date, or the device name; undefined if neither. */
  tailOf(entry: Entry): string | undefined;
  person(id: string): Person | undefined;
  /** Aircraft types that at least one entry uses, sorted by id. */
  typesInUse: AircraftType[];
  /** Earliest and latest entry date, or undefined for an empty logbook. */
  dateRange: { first: string; last: string } | undefined;
}

export interface EntryFilter {
  /**
   * Free text, matched case-insensitively against tail, from, to, route, flight number,
   * aircraft type id, crew names and remarks. Several words must all match.
   */
  text?: string;
  /** Inclusive `YYYY-MM-DD` bounds on the entry date. */
  dateFrom?: string;
  dateTo?: string;
  /** Empty or absent means "any". */
  rules?: OperatingRule[];
  kinds?: EntryKind[];
  typeIds?: string[];
  /** Airframe or training-device ids. */
  aircraftIds?: string[];
  seats?: Seat[];
  /** Only these entries, e.g. the ones behind a number on the experience report. */
  entryIds?: readonly string[];
  /** Only entries whose id is in `flagged` (e.g. entries with validation findings). */
  onlyFlagged?: boolean;
}

export interface Totals {
  /** Number of entries of each kind. */
  flights: number;
  simulatorSessions: number;
  groundSessions: number;
  durations: Durations;
  dayTakeoffs: number;
  nightTakeoffs: number;
  dayLandings: number;
  nightLandings: number;
  approaches: number;
  holds: number;
}

export type SortOrder = 'newest' | 'oldest';

/** How much one type, airframe or device has been used. */
export interface Usage {
  /** Flights (entries of kind `flight`). */
  flights: number;
  /** Flight time of those flights, minutes. */
  minutes: number;
  /** Simulator sessions and their length, for devices and the types they represent. */
  sessions: number;
  sessionMinutes: number;
  /** First and last entry date. */
  first?: string;
  last?: string;
}

export interface AircraftUsage {
  /** By aircraft type id, as in force on each entry's date. */
  types: Map<string, Usage>;
  airframes: Map<string, Usage>;
  devices: Map<string, Usage>;
}
