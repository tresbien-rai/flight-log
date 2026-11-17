/**
 * Turns one ImportResult into canonical logbook entries. See docs/DESIGN.md §4 and §7.
 *
 * Pure and deterministic: ids derive from the source, there is no clock, and the same input
 * always gives the same output. Every guess is reported as a ConversionNote.
 */

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
import { instantAfter, resolveUtcClock } from '../time/zone';
import { clean } from './normalize';
import type { ImportResult, SourceAircraft, SourceRecord } from './types';

export interface ConversionNote {
  code: string;
  message: string;
  line?: number;
  entryId?: string;
}

export interface ToLogbookOptions {
  airports?: AirportLookup;
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

function typeIdOf(a: SourceAircraft): string {
  return clean(a.typeCode) ?? 'unknown';
}

/** Lower-case "given family" key; "Family; Given" and "Family, Given" are reordered. */
function personKey(name: string): string {
  let n = name;
  const m = /[;,]/.exec(n);
  if (m && m.index !== undefined) {
    const family = n.slice(0, m.index);
    const given = n.slice(m.index + 1);
    n = `${given} ${family}`;
  }
  return n.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
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
      const rep = clean(a.typeCode);
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
      for (const key of OVERRIDE_KEYS) {
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
    const id = `${rec.source}:${rec.line}`;
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
    const hasClock = Object.values(clock).some((v) => v !== undefined);
    if (validDate && hasClock) {
      const tz = tzOf(rec.from, rec, id);
      let prev: string | undefined;
      for (const key of ['out', 'off', 'on', 'in'] as const) {
        const v = clock[key];
        if (v === undefined) continue;
        prev = prev === undefined ? resolveUtcClock(rec.date, v, tz) : instantAfter(prev, v);
        times[key] = prev;
      }
      if (clock.scheduledOut !== undefined) {
        times.scheduledOut = resolveUtcClock(rec.date, clock.scheduledOut, tz);
      }
      if (clock.scheduledIn !== undefined) {
        const anchor = times.scheduledOut ?? times.out;
        times.scheduledIn =
          anchor === undefined
            ? resolveUtcClock(rec.date, clock.scheduledIn, tz)
            : instantAfter(anchor, clock.scheduledIn);
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
      const key = personKey(p.name);
      if (key === '') continue;
      const personId = `p:${key}`;
      if (!people.has(personId)) people.set(personId, { id: personId, name: p.name });
      if (!crew.some((m) => m.personId === personId && m.role === p.role)) {
        crew.push({ personId, role: p.role });
      }
    }

    const landings = deriveLandings(rec, note);

    return {
      id,
      kind,
      date: rec.date,
      ...times,
      totalSource: 'typed',
      rule,
      flightNumber: rec.flightNumber,
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
      source: { kind: 'import', batchId: result.source },
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
