/**
 * Turns one ImportResult into canonical logbook entries. See docs/DESIGN.md §4 and §7.
 *
 * Pure and deterministic: ids derive from the source, there is no clock, and the same input
 * always gives the same output. Every guess is reported as a ConversionNote.
 */

import { catalogType, matchType, type CatalogType } from '../aircraft';
import type { AirportLookup } from '../airports/types';
import {
  zeroDurations,
  type AircraftClass,
  type AircraftType,
  type Airframe,
  type CrewMember,
  type EngineType,
  type Entry,
  type Landings,
  type Logbook,
  type Person,
  type Seat,
  type TrainingDevice,
} from '../model';
import { instantAfter, localDateOf, minutesBetween, resolveUtcClock } from '../time/zone';
import { canonicalFlightNumber, clean, nameKey, parseName } from './normalize';
import type { ImportResult, SourceAircraft, SourceRecord } from './types';

export interface ConversionNote {
  code: string;
  message: string;
  line?: number;
  entryId?: string;
}

export interface ToLogbookOptions {
  airports?: AirportLookup;
  /**
   * What the source's date column means for a flight with clock times: the UTC date of
   * departure, or the local date at the departure airport. Both LogTen and ForeFlight
   * exports have been observed to use the UTC date. Default `utc`.
   */
  dateBasis?: 'utc' | 'local';
  /** Id for the entry made from a record. Default `<source>:<line>`. Must be unique. */
  entryId?: (rec: SourceRecord) => string;
  /** Recorded as each entry's `source.batchId`. Default: the import's source. */
  batchId?: string;
}

const DAY = 24 * 60;

function shiftMinutes(instant: string, delta: number): string {
  return new Date(Date.parse(instant.replace('Z', ':00Z')) + delta * 60_000)
    .toISOString()
    .replace(/:\d\d\.\d+Z$/, 'Z');
}

/**
 * The instant with this UTC clock time that is nearest to `anchor` in the sense a logbook
 * means it: normally after the anchor, but a time that would land more than `maxAfter`
 * minutes later is taken to be shortly before it instead (a mistyped or out-of-order time).
 * This keeps one bad cell from pushing every later time a day ahead.
 */
function near(anchor: string, utcMinutes: number, maxAfter: number): string {
  const after = instantAfter(anchor, utcMinutes);
  return minutesBetween(anchor, after) > maxAfter ? shiftMinutes(after, -DAY) : after;
}

/** Stamp for entries built here; the caller stamps real times. */
const EPOCH = '1970-01-01T00:00Z';

const BOOL_KEYS = [
  'retractable',
  'complex',
  'highPerformance',
  'taa',
  'pressurized',
  'tailwheel',
] as const;
type BoolKey = (typeof BOOL_KEYS)[number];
type OverrideKey = Exclude<BoolKey, 'tailwheel'>;
const OVERRIDE_KEYS: readonly OverrideKey[] = [
  'retractable',
  'complex',
  'highPerformance',
  'taa',
  'pressurized',
];

/** A listed type's id when the type list knows the aircraft, else the source's own code. */
function typeIdOf(a: SourceAircraft): string {
  return matchType(a)?.id ?? clean(a.typeCode) ?? 'unknown';
}

/** The type as the model stores it, without the type list's matching hints. */
function fromCatalog(t: CatalogType): AircraftType {
  const { codes, modelPattern, isDefaultForIcao, ...type } = t;
  void codes;
  void modelPattern;
  void isDefaultForIcao;
  return { ...type };
}

function isValidDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function buildAircraft(
  result: ImportResult,
  notes: ConversionNote[],
): {
  airframes: Airframe[];
  types: AircraftType[];
  devices: TrainingDevice[];
  airframeTails: Set<string>;
  deviceTails: Set<string>;
} {
  const airframes: Airframe[] = [];
  const devices: TrainingDevice[] = [];
  const airframeTails = new Set<string>();
  const deviceTails = new Set<string>();
  const byType = new Map<string, SourceAircraft[]>();
  const airframeType = new Map<string, string>();
  const frameSources: SourceAircraft[] = [];

  for (const a of result.aircraft) {
    if (a.deviceLevel !== undefined || a.isDevice) {
      if (deviceTails.has(a.tail)) continue;
      deviceTails.add(a.tail);
      const device: TrainingDevice = {
        id: `dev:${a.tail}`,
        name: a.tail,
        level: a.deviceLevel ?? 'AATD',
      };
      if (a.deviceLevel === undefined) {
        notes.push({
          code: 'device-level-assumed',
          message: `Device ${a.tail} has no level in the source; assumed AATD.`,
        });
      }
      const rep = matchType(a)?.id ?? clean(a.typeCode);
      if (rep !== undefined) device.represents = rep;
      devices.push(device);
      continue;
    }
    if (airframeTails.has(a.tail)) continue;
    airframeTails.add(a.tail);
    frameSources.push(a);
    const typeId = typeIdOf(a);
    airframeType.set(a.tail, typeId);
    const list = byType.get(typeId) ?? [];
    list.push(a);
    byType.set(typeId, list);
  }

  const types: AircraftType[] = [];
  const typeValues = new Map<string, Record<BoolKey, boolean>>();
  for (const [id, list] of byType) {
    const listed = catalogType(id);
    if (listed) {
      const type = fromCatalog(listed);
      const replaced = BOOL_KEYS.filter(
        (key) => key !== 'taa' && list.some((a) => a[key] !== undefined && a[key] !== type[key]),
      );
      if (list.some((a) => a.engine !== undefined && a.engine !== type.engine)) {
        replaced.push('engine' as never);
      }
      if (replaced.length > 0) {
        notes.push({
          code: 'type-attributes-from-list',
          message: `Type ${id}: ${replaced.join(', ')} taken from the type list, not the source.`,
        });
      }
      typeValues.set(id, type);
      types.push(type);
      continue;
    }
    const first = <T>(pick: (a: SourceAircraft) => T | undefined): T | undefined => {
      for (const a of list) {
        const v = pick(a);
        if (v !== undefined) return v;
      }
      return undefined;
    };
    const cls: AircraftClass | undefined = first((a) => a.class);
    const engine: EngineType | undefined = first((a) => a.engine);
    if (cls === undefined) {
      notes.push({
        code: 'class-assumed',
        message: `Type ${id} has no class in the source; assumed ASEL.`,
      });
    }
    if (engine === undefined) {
      notes.push({
        code: 'engine-assumed',
        message: `Type ${id} has no engine in the source; assumed piston.`,
      });
    }
    const values = {} as Record<BoolKey, boolean>;
    for (const key of BOOL_KEYS) {
      let yes = 0;
      let no = 0;
      for (const a of list) {
        const v = a[key];
        if (v === true) yes++;
        else if (v === false) no++;
      }
      values[key] = yes > 0 && yes >= no; // ties go to true ("any")
    }
    typeValues.set(id, values);
    types.push({
      id,
      icaoDesignator: undefined,
      make: first((a) => clean(a.make)) ?? '',
      model: first((a) => clean(a.model)) ?? '',
      category: 'airplane',
      class: cls ?? 'ASEL',
      engine: engine ?? 'piston',
      ...values,
    });
  }

  for (const a of frameSources) {
    const typeId = airframeType.get(a.tail) ?? 'unknown';
    const frame: Airframe = {
      id: `af:${a.tail}`,
      registrations: [{ value: a.tail }],
      configurations: [{ value: typeId }],
      serialNumber: a.serialNumber,
    };
    const tv = typeValues.get(typeId);
    if (tv) {
      const overrides: NonNullable<Airframe['overrides']> = {};
      // A listed type's attributes are facts; only its avionics (TAA) vary by airframe.
      for (const key of catalogType(typeId) ? (['taa'] as const) : OVERRIDE_KEYS) {
        const v = a[key];
        if (v !== undefined && v !== tv[key]) overrides[key] = v;
      }
      if (Object.keys(overrides).length > 0) frame.overrides = overrides;
    }
    airframes.push(frame);
  }

  return { airframes, types, devices, airframeTails, deviceTails };
}

function deriveLandings(
  rec: SourceRecord,
  note: (code: string, message: string) => void,
): Landings {
  const c = rec.counts;
  const out: Landings = { dayFullStop: 0, nightFullStop: 0, dayTouchAndGo: 0, nightTouchAndGo: 0 };

  if (c.dayFullStopLandings !== undefined || c.nightFullStopLandings !== undefined) {
    out.dayFullStop = c.dayFullStopLandings ?? 0;
    out.nightFullStop = c.nightFullStopLandings ?? 0;
    const tg =
      c.allLandings !== undefined
        ? Math.max(0, c.allLandings - out.dayFullStop - out.nightFullStop)
        : 0;
    out.dayTouchAndGo = tg;
    if (tg > 0) {
      note('touch-and-go-split-assumed', 'Touch-and-go landings were all counted as day.');
    }
    return out;
  }

  if (c.dayLandings !== undefined || c.nightLandings !== undefined) {
    const day = c.dayLandings ?? 0;
    const night = c.nightLandings ?? 0;
    const tg = c.touchAndGoes ?? 0;
    if (tg === 0) {
      out.dayFullStop = day;
      out.nightFullStop = night;
    } else {
      out.dayTouchAndGo = Math.min(tg, day);
      out.nightTouchAndGo = night > 0 ? Math.min(tg - out.dayTouchAndGo, night) : 0;
      out.dayFullStop = day - out.dayTouchAndGo;
      out.nightFullStop = night - out.nightTouchAndGo;
      if (day > 0 && night > 0) {
        note(
          'touch-and-go-split-assumed',
          'Touch-and-go landings were split between day and night by assumption.',
        );
      }
    }
    if (c.fullStopLandings !== undefined) {
      const derived = out.dayFullStop + out.nightFullStop;
      if (c.fullStopLandings !== derived) {
        note(
          'landing-counts-inconsistent',
          `Source full-stop count ${c.fullStopLandings} disagrees with derived ${derived}.`,
        );
      }
    }
  }
  return out;
}

export function toLogbook(
  result: ImportResult,
  options: ToLogbookOptions = {},
): { logbook: Logbook; notes: ConversionNote[] } {
  const notes: ConversionNote[] = [];
  const { airframes, types, devices, airframeTails, deviceTails } = buildAircraft(result, notes);

  const people = new Map<string, Person>();
  const tzWarned = new Set<string>();
  let ruleDefaulted = 0;

  const tzOf = (ident: string | undefined, rec: SourceRecord, entryId: string) => {
    let tz: string | undefined;
    if (ident !== undefined && options.airports) {
      try {
        tz = options.airports(ident)?.tz;
        if (tz !== undefined) new Intl.DateTimeFormat('en-US', { timeZone: tz });
      } catch {
        tz = undefined;
      }
    }
    if (tz === undefined) {
      const key = ident ?? '';
      if (!tzWarned.has(key)) {
        tzWarned.add(key);
        notes.push({
          code: 'no-timezone',
          message:
            ident === undefined
              ? 'No departure airport; clock times assumed to fall on the logged date in UTC.'
              : `No time zone for ${ident}; clock times assumed to fall on the logged date in UTC.`,
          line: rec.line,
          entryId,
        });
      }
    }
    return tz;
  };

  const entries: Entry[] = result.records.map((rec) => {
    const id = options.entryId?.(rec) ?? `${rec.source}:${rec.line}`;
    const note = (code: string, message: string) =>
      notes.push({ code, message, line: rec.line, entryId: id });

    let kind = rec.kind;
    let airframeId: string | undefined;
    let deviceId: string | undefined;
    if (rec.tail !== undefined) {
      if (deviceTails.has(rec.tail)) {
        deviceId = `dev:${rec.tail}`;
        if (kind === 'flight') {
          kind = 'simulator';
          note('kind-corrected', `Flight in training device ${rec.tail} recorded as simulator.`);
        }
      } else if (airframeTails.has(rec.tail)) {
        airframeId = `af:${rec.tail}`;
      } else {
        note('unknown-aircraft', `Aircraft ${rec.tail} is not in the import's aircraft list.`);
      }
    }

    const validDate = isValidDate(rec.date);
    if (!validDate) note('bad-date', `Invalid or missing date "${rec.date}".`);

    // Clock times.
    const clock = rec.clock;
    const times: Pick<Entry, 'out' | 'off' | 'on' | 'in' | 'scheduledOut' | 'scheduledIn'> = {};
    let localDate = rec.date;
    const hasClock = Object.values(clock).some((v) => v !== undefined);
    if (validDate && hasClock) {
      const tz = tzOf(rec.from, rec, id);
      const basis = options.dateBasis ?? 'utc';
      const anchorAt = (v: number) =>
        resolveUtcClock(rec.date, v, basis === 'utc' ? undefined : tz);
      let anchor: string | undefined;
      for (const key of ['out', 'off', 'on', 'in'] as const) {
        const v = clock[key];
        if (v === undefined) continue;
        // Each time is placed relative to the first one present, not to its predecessor.
        if (anchor === undefined) {
          anchor = anchorAt(v);
          times[key] = anchor;
        } else {
          times[key] = near(anchor, v, 18 * 60);
        }
      }
      if (clock.scheduledOut !== undefined) {
        times.scheduledOut =
          times.out === undefined
            ? anchorAt(clock.scheduledOut)
            : near(shiftMinutes(times.out, -12 * 60), clock.scheduledOut, DAY);
      }
      if (clock.scheduledIn !== undefined) {
        const from = times.scheduledOut ?? times.out;
        times.scheduledIn =
          from === undefined ? anchorAt(clock.scheduledIn) : instantAfter(from, clock.scheduledIn);
      }
      if (basis === 'utc' && tz !== undefined && anchor !== undefined) {
        localDate = localDateOf(anchor, tz);
      }
    }

    const durations = { ...zeroDurations(), ...rec.durations };

    let rule = rec.rule;
    if (rule === undefined) {
      rule = '91';
      ruleDefaulted++;
    }

    let seat: Seat | undefined;
    if (durations.sic > 0 && durations.pic === 0) seat = 'SIC';
    else if (durations.pic > 0 && durations.sic === 0) seat = 'PIC';

    const crew: CrewMember[] = [];
    for (const p of rec.people) {
      const key = nameKey(p.name);
      if (key === '') continue;
      const personId = `p:${key}`;
      if (!people.has(personId)) {
        const { given, family } = parseName(p.name);
        people.set(personId, { id: personId, name: p.name, givenName: given, familyName: family });
      }
      if (!crew.some((m) => m.personId === personId && m.role === p.role)) {
        crew.push({ personId, role: p.role });
      }
    }

    const landings = deriveLandings(rec, note);

    return {
      id,
      kind,
      date: localDate,
      ...times,
      totalSource: 'typed',
      rule,
      flightNumber: canonicalFlightNumber(rec.flightNumber),
      from: rec.from,
      to: rec.to,
      route: rec.route,
      airframeId,
      deviceId,
      seat,
      pilotFlying: rec.pilotFlying,
      durations,
      dayTakeoffs: rec.counts.dayTakeoffs ?? 0,
      nightTakeoffs: rec.counts.nightTakeoffs ?? 0,
      landings,
      approaches: rec.approaches.map((a) => ({ ...a })),
      holds: rec.counts.holds ?? 0,
      goArounds: rec.counts.goArounds ?? 0,
      crew,
      custom: { ...rec.custom },
      remarks: rec.remarks,
      source: { kind: 'import', batchId: options.batchId ?? result.source },
      acknowledged: [],
      createdAt: EPOCH,
      updatedAt: EPOCH,
    } satisfies Entry;
  });

  if (ruleDefaulted > 0) {
    notes.push({
      code: 'rule-assumed',
      message: `${ruleDefaulted} entries had no operating rule in the source; defaulted to Part 91.`,
    });
  }

  return {
    logbook: { entries, airframes, aircraftTypes: types, devices, people: [...people.values()] },
    notes,
  };
}
