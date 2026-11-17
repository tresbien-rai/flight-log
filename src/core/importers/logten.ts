/**
 * LogTen Pro tab-delimited export importer. See docs/DESIGN.md §2 and §7.
 *
 * One row per leg; flight_*, aircraft_* and aircraftType_* columns are denormalised onto every
 * row. Header names mostly carry a stray leading space, which is trimmed.
 */

import type {
  AircraftClass,
  CrewRole,
  CustomValue,
  DeviceLevel,
  DurationField,
  EngineType,
  EntryKind,
  OperatingRule,
} from '../model';
import {
  clean,
  normalizeAirport,
  normalizeTail,
  parseApproachCell,
  parseBool,
  parseClock,
  parseCount,
  parseDate,
  parseDelimited,
  parseHours,
} from './normalize';
import type {
  ColumnMapping,
  ImportIssue,
  ImportOptions,
  ImportResult,
  Importer,
  SourceAircraft,
  SourceClock,
  SourceCounts,
  SourcePerson,
  SourceRecord,
} from './types';

const CLOCK_COLUMNS: readonly (readonly [string, keyof SourceClock])[] = [
  ['flight_actualDepartureTime', 'out'],
  ['flight_takeoffTime', 'off'],
  ['flight_landingTime', 'on'],
  ['flight_actualArrivalTime', 'in'],
  ['flight_scheduledDepartureTime', 'scheduledOut'],
  ['flight_scheduledArrivalTime', 'scheduledIn'],
];

const DURATION_COLUMNS: readonly (readonly [string, DurationField])[] = [
  ['flight_totalTime', 'total'],
  ['flight_pic', 'pic'],
  ['flight_sic', 'sic'],
  ['flight_solo', 'solo'],
  ['flight_night', 'night'],
  ['flight_crossCountry', 'crossCountry'],
  ['flight_actualInstrument', 'actualInstrument'],
  ['flight_simulatedInstrument', 'simulatedInstrument'],
  ['flight_dualReceived', 'dualReceived'],
  ['flight_dualGiven', 'dualGiven'],
  ['flight_simulator', 'simulator'],
  ['flight_ground', 'groundTraining'],
];

const COUNT_COLUMNS: readonly (readonly [string, keyof SourceCounts])[] = [
  ['flight_dayTakeoffs', 'dayTakeoffs'],
  ['flight_nightTakeoffs', 'nightTakeoffs'],
  ['flight_dayLandings', 'dayLandings'],
  ['flight_nightLandings', 'nightLandings'],
  ['flight_fullStops', 'fullStopLandings'],
  ['flight_touchAndGoes', 'touchAndGoes'],
  ['flight_holds', 'holds'],
  ['flight_goArounds', 'goArounds'],
];

const CREW_ROLES: Record<string, CrewRole> = {
  PIC: 'PIC',
  SIC: 'SIC',
  Instructor: 'instructor',
  Student: 'student',
  Observer: 'observer',
  Observer2: 'observer',
  Commander: 'PIC',
};

const CUSTOM_RE = /^flight_custom(Time|Op|Note|Landing|Takeoff|Capacity)\d+$/;
const CREW_RE = /^flight_selectedCrew(.+)$/;
const PAX_RE = /^flight_selectedPax\d+$/;
const APPROACH_RE = /^flight_selectedApproach\d+$/;
const DEVICE_LEVEL_RE = /(?:^|[^A-Z0-9])(FFS|FTD|AATD|BATD)(?:$|[^A-Z0-9])/;

/** Lower-case letters only, so `Turbo-fan`, `turbo fan` and `TurboFan` compare equal. */
function key(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

const ENGINES: Record<string, EngineType> = {
  reciprocating: 'piston',
  piston: 'piston',
  turboprop: 'turboprop',
  turbofan: 'turbofan',
  turbojet: 'turbojet',
  turboshaft: 'turboshaft',
  electric: 'electric',
  none: 'none',
  nonpowered: 'none',
};

const CLASSES: Record<string, AircraftClass> = {
  singleengineland: 'ASEL',
  multiengineland: 'AMEL',
  singleenginesea: 'ASES',
  multienginesea: 'AMES',
  helicopter: 'helicopter',
  gyroplane: 'gyroplane',
  glider: 'other',
  balloon: 'other',
  airship: 'other',
  poweredlift: 'other',
  poweredparachute: 'other',
  weightshift: 'other',
  other: 'other',
};

function isDeviceCategory(category: string | undefined): boolean {
  return category !== undefined && key(category) === 'trainingdevice';
}

export const importLogTen: Importer = (text: string, options?: ImportOptions): ImportResult => {
  const table = parseDelimited(text, '\t');
  const headerRow = table[0];
  if (headerRow === undefined) {
    throw new Error('Not a LogTen Pro export: the file is empty.');
  }
  const headers = headerRow.map((h) => h.trim());
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    if (!index.has(h)) index.set(h, i);
  });
  if (!index.has('flight_flightDate')) {
    throw new Error(
      'Not a LogTen Pro tab-delimited export: the header row has no "flight_flightDate" column.',
    );
  }

  const issues: ImportIssue[] = [];
  const records: SourceRecord[] = [];
  const aircraft: SourceAircraft[] = [];
  const aircraftByTail = new Map<string, SourceAircraft>();
  const columns = options?.columns ?? {};

  const crewColumns: { name: string; role: CrewRole }[] = [];
  const paxColumns: string[] = [];
  const approachColumns: string[] = [];
  const defaultCustom: string[] = [];
  for (const h of headers) {
    const crew = CREW_RE.exec(h);
    if (crew) crewColumns.push({ name: h, role: CREW_ROLES[crew[1]!] ?? 'other' });
    else if (PAX_RE.test(h)) paxColumns.push(h);
    else if (APPROACH_RE.test(h)) approachColumns.push(h);
    else if (CUSTOM_RE.test(h) && !(h in columns)) defaultCustom.push(h);
  }

  for (let r = 1; r < table.length; r++) {
    const cells = table[r]!;
    if (cells.every((c) => c.trim() === '')) continue;
    const line = r + 1;

    const issue = (
      severity: 'error' | 'warning',
      code: string,
      message: string,
      column?: string,
    ): void => {
      const i: ImportIssue = { severity, code, message, line };
      if (column !== undefined) i.column = column;
      issues.push(i);
    };
    const warn = (code: string, message: string, column?: string): void =>
      issue('warning', code, message, column);

    if (cells.length !== headers.length) {
      issue(
        'error',
        'ragged-row',
        `Row has ${cells.length} fields but the header has ${headers.length}.`,
      );
    }

    const raw: Record<string, string> = {};
    for (let i = 0; i < headers.length && i < cells.length; i++) {
      const v = cells[i]!;
      const h = headers[i]!;
      if (v !== '' && h !== '' && !(h in raw)) raw[h] = v;
    }
    /** A non-blank cell, trimmed; undefined if blank or the column is absent. */
    const get = (col: string): string | undefined => {
      const v = raw[col]?.trim();
      return v === undefined || v === '' ? undefined : v;
    };
    const dur = (col: string, code = 'bad-duration'): number | undefined => {
      const v = get(col);
      if (v === undefined) return undefined;
      const m = parseHours(v);
      if (m === undefined) warn(code, `Cannot read "${col}" as hours.`, col);
      return m;
    };
    const count = (col: string): number | undefined => {
      const v = get(col);
      if (v === undefined) return undefined;
      const n = parseCount(v);
      if (n === undefined) warn('bad-count', `Cannot read "${col}" as a count.`, col);
      return n;
    };
    const flag = (col: string): boolean | undefined => {
      const v = get(col);
      if (v === undefined) return undefined;
      const b = parseBool(v);
      if (b === undefined) warn('bad-toggle', `Cannot read "${col}" as a yes/no flag.`, col);
      return b;
    };

    // Date
    const dateText = get('flight_flightDate');
    let date = parseDate(dateText);
    if (date === undefined) {
      issue('error', 'bad-date', 'Missing or invalid flight date.', 'flight_flightDate');
      date = dateText ?? '';
    }

    // Aircraft
    const idCell = raw['aircraft_aircraftID'];
    const tail = normalizeTail(idCell);
    const category = get('aircraftType_selectedCategory');
    const device = isDeviceCategory(category);

    const groundMinutes = dur('flight_ground');

    let kind: EntryKind = 'flight';
    if (device) kind = 'simulator';
    else if (tail === undefined && groundMinutes !== undefined) kind = 'ground';

    if (tail !== undefined) {
      const ac = buildAircraft(tail, idCell, get, device, (code, message, column) =>
        warn(code, message, column),
      );
      const known = aircraftByTail.get(tail);
      if (known === undefined) {
        aircraftByTail.set(tail, ac);
        aircraft.push(ac);
      } else if (
        known.typeCode !== ac.typeCode ||
        known.make !== ac.make ||
        known.model !== ac.model
      ) {
        warn('aircraft-conflict', `Aircraft ${tail} appears with a different type than before.`);
      }
    }

    const rec: SourceRecord = {
      source: 'logten',
      line,
      raw,
      kind,
      date,
      clock: {},
      durations: {},
      counts: {},
      approaches: [],
      people: [],
      custom: {},
    };
    if (tail !== undefined) rec.tail = tail;

    // Airports
    const from = normalizeAirport(raw['flight_from']);
    const to = normalizeAirport(raw['flight_to']);
    if (from.ident !== undefined) rec.from = from.ident;
    if (to.ident !== undefined) rec.to = to.ident;
    if (from.local || to.local) rec.localFlight = true;
    const route = clean(raw['flight_route']);
    if (route !== undefined) rec.route = route;
    const flightNumber = clean(raw['flight_flightNumber']);
    if (flightNumber !== undefined) rec.flightNumber = flightNumber;

    // Clock times
    for (const [col, field] of CLOCK_COLUMNS) {
      const v = get(col);
      if (v === undefined) continue;
      const m = parseClock(v);
      if (m === undefined) warn('bad-clock', `Cannot read "${col}" as a clock time.`, col);
      else rec.clock[field] = m;
    }

    // Durations
    for (const [col, field] of DURATION_COLUMNS) {
      const m = col === 'flight_ground' ? groundMinutes : dur(col);
      if (m !== undefined) rec.durations[field] = m;
    }

    // Counts
    for (const [col, field] of COUNT_COLUMNS) {
      const n = count(col);
      if (n !== undefined) rec.counts[field] = n;
    }

    // Approaches
    for (const col of approachColumns) {
      const v = get(col);
      if (v === undefined) continue;
      const parsed = parseApproachCell(v);
      if (parsed === undefined) continue;
      for (const problem of parsed.problems) {
        warn(problem, `Approach cell "${col}" has a problem: ${problem}.`, col);
      }
      for (let k = 0; k < parsed.count; k++) rec.approaches.push({ ...parsed.approach });
    }

    // Operating rule
    const p121 = flag('flight_faaPart121') === true;
    const p135 = flag('flight_faaPart135') === true;
    const p91 = flag('flight_faaPart91') === true;
    if (p121) rec.rule = '121';
    else if (p135) rec.rule = '135';
    else if (p91) rec.rule = '91';
    if ([p121, p135, p91].filter(Boolean).length > 1) {
      warn('multiple-rules', 'More than one FAA part flag is set.');
    }

    const pf = flag('flight_pilotFlyingCapacity');
    if (pf !== undefined) rec.pilotFlying = pf;

    // People
    const people: SourcePerson[] = [];
    for (const { name: col, role } of crewColumns) {
      const name = clean(raw[col]);
      if (name !== undefined) people.push({ name, role });
    }
    for (const col of paxColumns) {
      const name = clean(raw[col]);
      if (name !== undefined) people.push({ name, role: 'passenger' });
    }
    rec.people = people;

    const remarks = get('flight_remarks');
    if (remarks !== undefined) rec.remarks = remarks;

    // User-mapped columns
    for (const [col, mapping] of Object.entries(columns)) {
      applyMapping(col, mapping, rec, get, warn);
    }
    // Unmapped custom columns
    for (const col of defaultCustom) {
      const v = get(col);
      if (v === undefined) continue;
      const name = col.slice('flight_'.length);
      const family = CUSTOM_RE.exec(col)![1]!;
      let value: CustomValue | undefined;
      switch (family) {
        case 'Time':
          value = dur(col);
          break;
        case 'Capacity':
          value = flag(col);
          break;
        case 'Note':
          value = clean(v);
          break;
        default:
          value = count(col);
      }
      if (value !== undefined) rec.custom[name] = value;
    }

    records.push(rec);
  }

  return { source: 'logten', records, aircraft, issues };
};

function applyMapping(
  col: string,
  mapping: ColumnMapping,
  rec: SourceRecord,
  get: (col: string) => string | undefined,
  warn: (code: string, message: string, column?: string) => void,
): void {
  const v = get(col);
  if (v === undefined) return;
  if ('duration' in mapping) {
    const m = parseHours(v);
    if (m === undefined) warn('bad-duration', `Cannot read "${col}" as hours.`, col);
    else rec.durations[mapping.duration] = m;
  } else if ('rule' in mapping) {
    const b = parseBool(v);
    if (b === undefined) warn('bad-toggle', `Cannot read "${col}" as a yes/no flag.`, col);
    else if (b && rec.rule === undefined) rec.rule = mapping.rule as OperatingRule;
  } else {
    let value: CustomValue | undefined;
    switch (mapping.type) {
      case 'duration':
        value = parseHours(v);
        if (value === undefined) warn('bad-duration', `Cannot read "${col}" as hours.`, col);
        break;
      case 'count':
        value = parseCount(v);
        if (value === undefined) warn('bad-count', `Cannot read "${col}" as a count.`, col);
        break;
      case 'toggle':
        value = parseBool(v);
        if (value === undefined) warn('bad-toggle', `Cannot read "${col}" as a yes/no flag.`, col);
        break;
      case 'text':
        value = clean(v);
        break;
    }
    if (value !== undefined) rec.custom[mapping.custom] = value;
  }
}

function buildAircraft(
  tail: string,
  idCell: string | undefined,
  get: (col: string) => string | undefined,
  device: boolean,
  warn: (code: string, message: string, column?: string) => void,
): SourceAircraft {
  const ac: SourceAircraft = { tail };
  if (idCell !== undefined && idCell !== tail) ac.tailRaw = idCell;

  const typeCode = clean(get('aircraftType_type'));
  const make = clean(get('aircraftType_make'));
  const model = clean(get('aircraftType_model'));
  if (typeCode !== undefined) ac.typeCode = typeCode;
  if (make !== undefined) ac.make = make;
  if (model !== undefined) ac.model = model;

  const engineText = get('aircraftType_selectedEngineType');
  if (engineText !== undefined) {
    const e = ENGINES[key(engineText)];
    if (e === undefined) {
      warn(
        'unknown-engine',
        `Unknown engine type "${engineText}".`,
        'aircraftType_selectedEngineType',
      );
    } else {
      ac.engine = e;
    }
  }
  const classText = get('aircraftType_selectedAircraftClass');
  if (classText !== undefined) {
    const c = CLASSES[key(classText)];
    if (c === undefined) {
      warn(
        'unknown-class',
        `Unknown aircraft class "${classText}".`,
        'aircraftType_selectedAircraftClass',
      );
    } else {
      ac.class = c;
    }
  }

  if (device) {
    const level = typeCode === undefined ? undefined : DEVICE_LEVEL_RE.exec(typeCode.toUpperCase());
    if (level) ac.deviceLevel = level[1] as DeviceLevel;
    else ac.isDevice = true;
  }

  const bools: readonly (readonly [string, keyof SourceAircraft])[] = [
    ['aircraft_complex', 'complex'],
    ['aircraft_highPerformance', 'highPerformance'],
    ['aircraft_pressurized', 'pressurized'],
    ['aircraft_technicallyAdvanced', 'taa'],
    ['aircraft_undercarriageRetractable', 'retractable'],
    ['aircraft_tailwheel', 'tailwheel'],
  ];
  for (const [col, field] of bools) {
    const v = get(col);
    if (v === undefined) continue;
    const b = parseBool(v);
    if (b === undefined) warn('bad-toggle', `Cannot read "${col}" as a yes/no flag.`, col);
    else (ac as unknown as Record<string, unknown>)[field] = b;
  }

  const year = parseCount(get('aircraft_year'));
  if (year !== undefined) ac.year = year;
  const serial = clean(get('aircraft_serialNumber'));
  if (serial !== undefined) ac.serialNumber = serial;
  return ac;
}
