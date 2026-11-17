import type { Airport, AirportLookup } from '../airports/types';
import { zeroDurations } from '../model';
import type { AircraftType, Airframe, Durations, Entry, Landings, Logbook } from '../model';
import { validate } from './engine';
import type { Finding, Rule, ValidateOptions } from './types';

type EntryOverrides = Partial<Omit<Entry, 'durations' | 'landings'>> & {
  durations?: Partial<Durations>;
  landings?: Partial<Landings>;
};

/**
 * A clean one-hour GA flight from KAAA to KBBB (about 60 NM) in airframe `a1`: it trips no rule.
 * Pass overrides to break one thing at a time.
 */
export function makeEntry(overrides: EntryOverrides = {}): Entry {
  const { durations, landings, ...rest } = overrides;
  return {
    id: 'e1',
    kind: 'flight',
    date: '2025-06-22',
    totalSource: 'typed',
    rule: '91',
    from: 'KAAA',
    to: 'KBBB',
    airframeId: 'a1',
    durations: { ...zeroDurations(), total: 60, pic: 60, ...durations },
    dayTakeoffs: 1,
    nightTakeoffs: 0,
    landings: {
      dayFullStop: 1,
      nightFullStop: 0,
      dayTouchAndGo: 0,
      nightTouchAndGo: 0,
      ...landings,
    },
    approaches: [],
    holds: 0,
    goArounds: 0,
    crew: [],
    custom: {},
    source: { kind: 'manual' },
    acknowledged: [],
    createdAt: '2025-06-22T00:00Z',
    updatedAt: '2025-06-22T00:00Z',
    ...rest,
  };
}

export function makeType(overrides: Partial<AircraftType> = {}): AircraftType {
  return {
    id: 't1',
    make: 'Cessna',
    model: '172',
    category: 'airplane',
    class: 'ASEL',
    engine: 'piston',
    complex: false,
    highPerformance: false,
    taa: false,
    pressurized: false,
    retractable: false,
    tailwheel: false,
    ...overrides,
  };
}

export function makeAirframe(overrides: Partial<Airframe> = {}): Airframe {
  return {
    id: 'a1',
    registrations: [{ value: 'N1' }],
    configurations: [{ value: 't1' }],
    ...overrides,
  };
}

/** A logbook with one airframe `a1` of type `t1` and one device `d1`, unless overridden. */
export function makeLogbook(overrides: Partial<Logbook> = {}): Logbook {
  return {
    entries: [],
    airframes: [makeAirframe()],
    aircraftTypes: [makeType()],
    devices: [{ id: 'd1', name: 'Sim', level: 'FFS' }],
    people: [],
    ...overrides,
  };
}

/** Airports on the equator: KAAA at 0°E, KBBB 1° east (~60 NM), KCCC 0.5° (~30 NM), KFAR 10° (~600 NM). */
export const TEST_AIRPORTS: Airport[] = [
  { ident: 'KAAA', iata: 'AAA', lat: 0, lon: 0, tz: 'UTC' },
  { ident: 'KBBB', lat: 0, lon: 1, tz: 'UTC' },
  { ident: 'KCCC', lat: 0, lon: 0.5, tz: 'UTC' },
  { ident: 'KFAR', lat: 0, lon: 10, tz: 'UTC' },
];

export const lookup: AirportLookup = (ident) =>
  TEST_AIRPORTS.find((a) => a.ident === ident.toUpperCase() || a.iata === ident.toUpperCase());

/** Runs one rule over some entries through the real engine. */
export function run(
  rule: Rule,
  entries: Entry | Entry[],
  logbook: Partial<Logbook> = {},
  options: ValidateOptions = {},
): Finding[] {
  const list = Array.isArray(entries) ? entries : [entries];
  return validate(makeLogbook({ ...logbook, entries: list }), options, [rule]);
}

/** Like `run`, with airport data loaded. */
export function runWithAirports(
  rule: Rule,
  entries: Entry | Entry[],
  logbook: Partial<Logbook> = {},
): Finding[] {
  return run(rule, entries, logbook, { airports: lookup });
}
