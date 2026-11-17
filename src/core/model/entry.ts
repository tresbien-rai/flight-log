/**
 * Canonical logbook model. See docs/DESIGN.md §4.
 *
 * Conventions:
 * - Durations are integer minutes.
 * - Instants are UTC ISO strings (`2025-06-22T17:31Z`); dates are `YYYY-MM-DD`.
 * - `undefined` means "not recorded"; `0` means "recorded as none".
 */

export type EntryKind = 'flight' | 'simulator' | 'ground';

export type OperatingRule = '91' | '121' | '135' | 'other';

export type Seat = 'PIC' | 'SIC';

/** Where an entry's total time came from. Block and hobbs totals are derived, never typed. */
export type TotalSource = 'block' | 'hobbs' | 'typed';

export const DURATION_FIELDS = [
  'total',
  'pic',
  'sic',
  'solo',
  'night',
  'crossCountry',
  'crossCountry50',
  'actualInstrument',
  'simulatedInstrument',
  'dualReceived',
  'dualGiven',
  'simulator',
  'groundTraining',
] as const;

export type DurationField = (typeof DURATION_FIELDS)[number];

/** Minutes per duration field. */
export type Durations = Record<DurationField, number>;

export const APPROACH_TYPES = [
  'ILS',
  'LOC',
  'LOC-BC',
  'LDA',
  'SDF',
  'RNAV-GPS',
  'RNAV-RNP',
  'GLS',
  'VOR',
  'NDB',
  'TACAN',
  'PAR',
  'ASR',
  'VISUAL',
  'OTHER',
] as const;

export type ApproachType = (typeof APPROACH_TYPES)[number];

export interface Approach {
  type: ApproachType;
  /** Two digits plus optional L/C/R, e.g. `06`, `24R`. Absent for circling-only procedures. */
  runway?: string;
  airport?: string;
  circleToLand?: boolean;
  missed?: boolean;
  /** Anything from the source that is not captured above, e.g. the chart title. */
  note?: string;
}

export type CrewRole =
  'PIC' | 'SIC' | 'instructor' | 'student' | 'examiner' | 'observer' | 'passenger' | 'other';

export interface CrewMember {
  personId: string;
  role: CrewRole;
}

export type CustomValue = number | boolean | string;

export interface Landings {
  /** All day landings, full-stop and touch-and-go. */
  day: number;
  /** All night landings, full-stop and touch-and-go. */
  night: number;
  dayFullStop: number;
  nightFullStop: number;
}

export interface Entry {
  id: string;
  kind: EntryKind;

  /** Local date at the departure airport. */
  date: string;
  out?: string;
  off?: string;
  on?: string;
  in?: string;
  scheduledOut?: string;
  scheduledIn?: string;

  /** Meter readings in tenths of an hour, e.g. 1234.5 h is stored as 12345. */
  hobbsOut?: number;
  hobbsIn?: number;
  tachOut?: number;
  tachIn?: number;
  totalSource: TotalSource;

  rule: OperatingRule;
  operatorId?: string;
  flightNumber?: string;

  from?: string;
  /** Absent on a local flight that returned to `from`. */
  to?: string;
  route?: string;

  /** An airframe for flights, a training device for simulator sessions, absent for ground. */
  airframeId?: string;
  deviceId?: string;
  /** Rare: overrides the type the airframe had on this date. */
  typeOverride?: string;

  seat?: Seat;
  pilotFlying?: boolean;

  durations: Durations;

  dayTakeoffs: number;
  nightTakeoffs: number;
  landings: Landings;
  approaches: Approach[];
  holds: number;
  goArounds: number;

  crew: CrewMember[];
  /** Keyed by custom field id. */
  custom: Record<string, CustomValue>;
  remarks?: string;

  source: { kind: 'manual' | 'import' | 'schedule' | 'voice'; batchId?: string };
  /** Ids of validation findings the pilot has accepted. */
  acknowledged: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export function zeroDurations(): Durations {
  return Object.fromEntries(DURATION_FIELDS.map((f) => [f, 0])) as Durations;
}
