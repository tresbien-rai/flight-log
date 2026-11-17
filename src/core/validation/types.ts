/**
 * Validation. See docs/DESIGN.md §6.
 *
 * A rule is a pure function. Entry rules look at one entry; logbook rules look across all of
 * them. Rules never throw on odd data and never mutate their input. A rule that lacks the
 * reference data it needs (an unknown airport, an entry with no clock times) stays silent
 * rather than guessing.
 */
import type { AirportLookup } from '../airports/types';
import type { AircraftType, Airframe, Entry, Logbook, TrainingDevice } from '../model';

/**
 * - `error`: cannot be true.
 * - `warning`: unlikely; worth a second look.
 * - `note`: incomplete, or merely worth knowing.
 */
export type Severity = 'error' | 'warning' | 'note';

export interface Finding {
  ruleId: string;
  severity: Severity;
  /** The entries concerned: one for an entry rule, one or more for a logbook rule. */
  entryIds: string[];
  /** Entry field paths the finding is about, e.g. `durations.night`, `landings`. */
  fields: string[];
  /** One plain sentence, with the offending values, e.g. "Night time (10.9) exceeds total time (1.9)." */
  message: string;
}

export interface RuleContext {
  logbook: Logbook;
  /** Absent when no airport data is loaded; rules needing it must then stay silent. */
  airports?: AirportLookup;
  /** The airframe an entry was flown in, if it has one and it exists. */
  airframeOf(entry: Entry): Airframe | undefined;
  /** The aircraft type in force on the entry's date (honouring `typeOverride`). */
  typeOf(entry: Entry): AircraftType | undefined;
  deviceOf(entry: Entry): TrainingDevice | undefined;
}

interface RuleBase {
  /** Stable, kebab-case, never reused: findings are acknowledged by this id. */
  id: string;
  /** Short name for a settings screen, e.g. "Night time within total". */
  title: string;
  /** One sentence on what the rule checks and why, shown to the pilot. */
  description: string;
}

export interface EntryRule extends RuleBase {
  scope: 'entry';
  check(entry: Entry, ctx: RuleContext): Finding[];
}

export interface LogbookRule extends RuleBase {
  scope: 'logbook';
  /** `entries` excludes deleted entries and is sorted by date, then out time. */
  check(entries: readonly Entry[], ctx: RuleContext): Finding[];
}

export type Rule = EntryRule | LogbookRule;

export interface ValidateOptions {
  airports?: AirportLookup;
  /** Rule ids to skip. */
  disabled?: readonly string[];
}
