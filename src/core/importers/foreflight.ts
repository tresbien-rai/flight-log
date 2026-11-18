/**
 * ForeFlight logbook CSV importer. See docs/DESIGN.md §2 and §7.
 *
 * The file holds two stacked tables (aircraft, then flights) found by their label rows, not by
 * position. Every cell is read defensively: bad content becomes an issue, never an exception.
 * Only a file with no usable flights table throws.
 */

import type {
  AircraftClass,
  CrewRole,
  CustomValue,
  DeviceLevel,
  DurationField,
  EngineType,
} from '../model';
import type {
  ColumnMapping,
  ImportIssue,
  ImportOptions,
  ImportResult,
  Importer,
  SourceAircraft,
  SourceCounts,
  SourceRecord,
} from './types';
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
  parseNumber,
} from './normalize';

type Row = string[];
type Warn = (code: string, message: string, column?: string) => void;

const isBlankRow = (row: Row): boolean => row.every((c) => c.trim() === '');
const isLabel = (row: Row, label: string): boolean =>
  (row[0] ?? '').trim().toLowerCase() === label.toLowerCase();

/** Header name to first column index. Empty headers are ignored. */
function indexHeader(header: Row): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => {
    const k = h.trim();
    if (k !== '' && !m.has(k)) m.set(k, i);
  });
  return m;
}

const ENGINES: Record<string, EngineType> = {
  piston: 'piston',
  reciprocating: 'piston',
  turboprop: 'turboprop',
  turbofan: 'turbofan',
  turbojet: 'turbojet',
  turboshaft: 'turboshaft',
  electric: 'electric',
  none: 'none',
};

const CLASSES: Record<string, AircraftClass> = {
  airplane_single_engine_land: 'ASEL',
  airplane_multi_engine_land: 'AMEL',
  airplane_single_engine_sea: 'ASES',
  airplane_multi_engine_sea: 'AMES',
  rotorcraft_helicopter: 'helicopter',
  helicopter: 'helicopter',
  rotorcraft_gyroplane: 'gyroplane',
  gyroplane: 'gyroplane',
  glider: 'other',
  lighter_than_air: 'other',
  balloon: 'other',
  airship: 'other',
  powered_lift: 'other',
  powered_parachute: 'other',
  weight_shift_control: 'other',
  weight_shift: 'other',
  other: 'other',
};

const DEVICES: Record<string, DeviceLevel> = {
  ffs: 'FFS',
  ftd: 'FTD',
  aatd: 'AATD',
  batd: 'BATD',
};

const ROLES: Record<string, CrewRole> = {
  pic: 'PIC',
  sic: 'SIC',
  instructor: 'instructor',
  student: 'student',
  examiner: 'examiner',
  passenger: 'passenger',
  observer: 'observer',
  'safety pilot': 'observer',
  other: 'other',
};

const COUNT_COLUMNS: readonly (readonly [string, keyof SourceCounts])[] = [
  ['DayTakeoffs', 'dayTakeoffs'],
  ['NightTakeoffs', 'nightTakeoffs'],
  ['DayLandingsFullStop', 'dayFullStopLandings'],
  ['NightLandingsFullStop', 'nightFullStopLandings'],
  ['AllLandings', 'allLandings'],
  ['Holds', 'holds'],
];

const DURATION_COLUMNS: readonly (readonly [string, DurationField])[] = [
  ['TotalTime', 'total'],
  ['PIC', 'pic'],
  ['SIC', 'sic'],
  ['Solo', 'solo'],
  ['Night', 'night'],
  ['CrossCountry', 'crossCountry'],
  ['ActualInstrument', 'actualInstrument'],
  ['SimulatedInstrument', 'simulatedInstrument'],
  ['DualReceived', 'dualReceived'],
  ['DualGiven', 'dualGiven'],
  ['SimulatedFlight', 'simulator'],
  ['GroundTraining', 'groundTraining'],
];

const CLOCK_COLUMNS = [
  ['TimeOut', 'out'],
  ['TimeOff', 'off'],
  ['TimeOn', 'on'],
  ['TimeIn', 'in'],
] as const;

function parseAircraft(
  rows: { row: Row; line: number }[],
  header: Row,
  issues: ImportIssue[],
): SourceAircraft[] {
  const col = indexHeader(header);
  const cell = (row: Row, name: string): string | undefined => {
    const i = col.get(name);
    return i === undefined ? undefined : row[i];
  };
  const out = new Map<string, SourceAircraft>();

  for (const { row, line } of rows) {
    const rawTail = cell(row, 'AircraftID');
    const tail = normalizeTail(rawTail);
    const warn = (code: string, message: string, column: string): void => {
      issues.push({ severity: 'warning', code, message, line, column });
    };
    if (tail === undefined) {
      warn('aircraft-no-id', 'Aircraft row has no AircraftID and was skipped.', 'AircraftID');
      continue;
    }

    const ac: SourceAircraft = { tail };
    if (rawTail !== undefined && rawTail !== tail) ac.tailRaw = rawTail;
    const typeCode = clean(cell(row, 'TypeCode'));
    if (typeCode !== undefined) ac.typeCode = typeCode;
    const make = clean(cell(row, 'Make'));
    if (make !== undefined) ac.make = make;
    const model = clean(cell(row, 'Model'));
    if (model !== undefined) ac.model = model;

    const yearText = clean(cell(row, 'Year'));
    if (yearText !== undefined) {
      const y = parseCount(yearText);
      if (y === undefined) warn('bad-year', `Unreadable year "${yearText}".`, 'Year');
      else ac.year = y;
    }

    const engineText = clean(cell(row, 'EngineType'));
    if (engineText !== undefined) {
      const e = ENGINES[engineText.toLowerCase()];
      if (e === undefined) {
        warn('unknown-engine', `Unknown engine type "${engineText}".`, 'EngineType');
      } else ac.engine = e;
    }

    const classText = clean(cell(row, 'aircraftClass (FAA)'));
    if (classText !== undefined) {
      const c = CLASSES[classText.toLowerCase()];
      if (c === undefined) {
        warn('unknown-class', `Unknown aircraft class "${classText}".`, 'aircraftClass (FAA)');
      } else ac.class = c;
    }

    const equipText = clean(cell(row, 'equipType (FAA)'));
    if (equipText !== undefined) {
      const k = equipText.toLowerCase();
      const d = DEVICES[k];
      if (d !== undefined) ac.deviceLevel = d;
      else if (k !== 'aircraft') {
        warn('unknown-equip-type', `Unknown equipment type "${equipText}".`, 'equipType (FAA)');
      }
    }

    for (const [name, key] of [
      ['complexAircraft (FAA)', 'complex'],
      ['highPerformance (FAA)', 'highPerformance'],
      ['taa (FAA)', 'taa'],
      ['pressurized (FAA)', 'pressurized'],
    ] as const) {
      const text = clean(cell(row, name));
      if (text === undefined) continue;
      const b = parseBool(text);
      if (b === undefined) warn('bad-bool', `Unreadable flag "${text}".`, name);
      else ac[key] = b;
    }

    const gear = clean(cell(row, 'GearType'))?.toLowerCase();
    if (gear !== undefined) {
      ac.retractable = gear.startsWith('retractable');
      ac.tailwheel = gear.includes('conventional') || gear.includes('tailwheel');
    }

    const prev = out.get(tail);
    if (prev === undefined) {
      out.set(tail, ac);
      continue;
    }
    warn(
      'duplicate-aircraft',
      `Aircraft ${tail} appears more than once; first row kept.`,
      'AircraftID',
    );
    if (prev.typeCode !== ac.typeCode || prev.make !== ac.make || prev.model !== ac.model) {
      warn(
        'aircraft-conflict',
        `Duplicate rows for ${tail} disagree on type, make or model.`,
        'AircraftID',
      );
    }
  }
  return [...out.values()];
}

/** Split a user-defined header into its lower-case `[Type]` prefix and cleaned label. */
function parseCustomHeader(header: string): { type: string; label: string } | undefined {
  const m = /^\[([^\]]+)\](.*)$/.exec(header);
  if (!m) return undefined;
  return { type: m[1]!.trim().toLowerCase(), label: clean(m[2]) ?? header };
}

function parseByBracketType(
  type: string,
  t: string,
  column: string,
  warn: Warn,
): CustomValue | undefined {
  switch (type) {
    case 'hours': {
      const v = parseHours(t);
      if (v === undefined) warn('bad-duration', `Unreadable duration "${t.trim()}".`, column);
      return v;
    }
    case 'toggle': {
      const v = parseBool(t);
      if (v === undefined) warn('bad-toggle', `Unreadable toggle "${t.trim()}".`, column);
      return v;
    }
    case 'numeric':
    case 'decimal':
    case 'number': {
      const v = parseNumber(t);
      if (v === undefined) warn('bad-number', `Unreadable number "${t.trim()}".`, column);
      return v;
    }
    case 'counter': {
      const v = parseCount(t);
      if (v === undefined) warn('bad-count', `Unreadable count "${t.trim()}".`, column);
      return v;
    }
    default:
      return clean(t);
  }
}

function applyMapping(
  mapping: ColumnMapping,
  t: string,
  column: string,
  rec: SourceRecord,
  warn: Warn,
): void {
  if ('duration' in mapping) {
    const v = parseHours(t);
    if (v === undefined) warn('bad-duration', `Unreadable duration "${t.trim()}".`, column);
    else rec.durations[mapping.duration] = v;
  } else if ('rule' in mapping) {
    const v = parseBool(t);
    if (v === undefined) warn('bad-toggle', `Unreadable toggle "${t.trim()}".`, column);
    else if (v) rec.rule = mapping.rule;
  } else {
    const type = { duration: 'hours', count: 'counter', toggle: 'toggle', text: 'text' }[
      mapping.type
    ];
    const v = parseByBracketType(type, t, column, warn);
    if (v !== undefined) rec.custom[mapping.custom] = v;
  }
}

export const importForeFlight: Importer = (text: string, options?: ImportOptions): ImportResult => {
  const records = parseDelimited(text, ',');
  const issues: ImportIssue[] = [];

  const flightsAt = records.findIndex((r) => isLabel(r, 'Flights Table'));
  if (flightsAt === -1) {
    throw new Error('Not a ForeFlight logbook export: no "Flights Table" section found.');
  }
  let headerAt = flightsAt + 1;
  while (headerAt < records.length && isBlankRow(records[headerAt]!)) headerAt++;
  const header = records[headerAt];
  const headerCols = header ? indexHeader(header) : undefined;
  if (!header || !headerCols || !headerCols.has('Date') || !headerCols.has('AircraftID')) {
    throw new Error(
      'Not a ForeFlight logbook export: the Flights Table header row must contain Date and AircraftID.',
    );
  }

  // Aircraft table (optional).
  const aircraft: SourceAircraft[] = [];
  const aircraftAt = records.findIndex((r, i) => i < flightsAt && isLabel(r, 'Aircraft Table'));
  let aircraftHeaderAt = aircraftAt + 1;
  while (
    aircraftAt !== -1 &&
    aircraftHeaderAt < flightsAt &&
    isBlankRow(records[aircraftHeaderAt]!)
  ) {
    aircraftHeaderAt++;
  }
  if (aircraftAt === -1 || aircraftHeaderAt >= flightsAt) {
    issues.push({
      severity: 'warning',
      code: 'no-aircraft-table',
      message: 'No usable "Aircraft Table" section found; aircraft details are unavailable.',
    });
  } else {
    const rows: { row: Row; line: number }[] = [];
    for (let i = aircraftHeaderAt + 1; i < flightsAt; i++) {
      const row = records[i]!;
      if (!isBlankRow(row)) rows.push({ row, line: i + 1 });
    }
    aircraft.push(...parseAircraft(rows, records[aircraftHeaderAt]!, issues));
  }
  const aircraftByTail = new Map(aircraft.map((a) => [a.tail, a]));
  const declared = new Set(aircraftByTail.keys());

  // Header analysis.
  const columns = options?.columns ?? {};
  const customCols: { index: number; header: string; type: string; label: string }[] = [];
  for (const [name, index] of headerCols) {
    const c = parseCustomHeader(name);
    if (c) customCols.push({ index, header: name, ...c });
  }
  const approachCols = [...headerCols].filter(([n]) => /^Approach\d+$/.test(n));
  const personCols = [...headerCols].filter(([n]) => /^Person\d+$/.test(n));

  const out: SourceRecord[] = [];

  for (let i = headerAt + 1; i < records.length; i++) {
    const row = records[i]!;
    if (isBlankRow(row)) continue;
    const line = i + 1;
    const cell = (name: string): string | undefined => {
      const idx = headerCols.get(name);
      return idx === undefined ? undefined : row[idx];
    };
    const warn: Warn = (code, message, column) => {
      const issue: ImportIssue = { severity: 'warning', code, message, line };
      if (column !== undefined) issue.column = column;
      issues.push(issue);
    };

    if (row.some((c, idx) => idx >= header.length && c.trim() !== '')) {
      issues.push({
        severity: 'error',
        code: 'ragged-row',
        message: `Row has more cells than the ${header.length} header columns.`,
        line,
      });
    }

    const raw: Record<string, string> = {};
    for (const [name, idx] of headerCols) {
      const v = row[idx];
      if (v !== undefined && v.trim() !== '') raw[name] = v;
    }

    // Date
    const dateText = cell('Date');
    const date = parseDate(dateText);
    if (date === undefined) {
      issues.push({
        severity: 'error',
        code: 'bad-date',
        message: `Unreadable date "${(dateText ?? '').trim()}".`,
        line,
        column: 'Date',
      });
    }

    // Durations
    const durations: SourceRecord['durations'] = {};
    for (const [name, field] of DURATION_COLUMNS) {
      const t = cell(name);
      if (t === undefined || t.trim() === '') continue;
      const v = parseHours(t);
      if (v === undefined) warn('bad-duration', `Unreadable duration "${t.trim()}".`, name);
      else durations[field] = v;
    }

    // Clock
    const clock: SourceRecord['clock'] = {};
    for (const [name, field] of CLOCK_COLUMNS) {
      const t = cell(name);
      if (t === undefined || t.trim() === '') continue;
      const v = parseClock(t);
      if (v === undefined) warn('bad-clock', `Unreadable clock time "${t.trim()}".`, name);
      else clock[field] = v;
    }

    // Counts
    const counts: SourceCounts = {};
    for (const [name, field] of COUNT_COLUMNS) {
      const t = cell(name);
      if (t === undefined || t.trim() === '') continue;
      const v = parseCount(t);
      if (v === undefined) warn('bad-count', `Unreadable count "${t.trim()}".`, name);
      else counts[field] = v;
    }

    // Aircraft and kind
    const tail = normalizeTail(cell('AircraftID'));
    let kind: SourceRecord['kind'] = 'flight';
    if (tail === undefined) {
      if ((durations.groundTraining ?? 0) > 0) kind = 'ground';
      else warn('missing-aircraft', 'Flight row has no AircraftID.', 'AircraftID');
    } else {
      if (!declared.has(tail)) {
        warn('unknown-aircraft', `Aircraft ${tail} is not in the aircraft table.`, 'AircraftID');
        if (!aircraftByTail.has(tail)) {
          const bare: SourceAircraft = { tail };
          aircraft.push(bare);
          aircraftByTail.set(tail, bare);
        }
      }
      if (aircraftByTail.get(tail)?.deviceLevel !== undefined) kind = 'simulator';
    }

    const rec: SourceRecord = {
      source: 'foreflight',
      line,
      raw,
      kind,
      date: date ?? (dateText ?? '').trim(),
      clock,
      durations,
      counts,
      approaches: [],
      people: [],
      custom: {},
    };
    if (tail !== undefined) rec.tail = tail;

    // Airports
    const from = normalizeAirport(cell('From'));
    const to = normalizeAirport(cell('To'));
    if (from.ident !== undefined) rec.from = from.ident;
    if (to.ident !== undefined) rec.to = to.ident;
    if (from.local || to.local) rec.localFlight = true;
    const route = clean(cell('Route'));
    if (route !== undefined) rec.route = route;

    // Approaches
    for (const [name, idx] of approachCols) {
      const t = row[idx];
      if (t === undefined || t.trim() === '') continue;
      const parsed = parseApproachCell(t);
      if (parsed === undefined) continue;
      for (let n = 0; n < parsed.count; n++) rec.approaches.push({ ...parsed.approach });
      for (const p of parsed.problems) warn(p, `Approach cell problem: ${p}.`, name);
    }

    // People (email and phone are deliberately dropped)
    for (const [name, idx] of personCols) {
      const t = row[idx];
      if (t === undefined || t.trim() === '') continue;
      const [nameField, roleField] = t.split(';');
      const personName = clean(nameField);
      if (personName === undefined) {
        warn('missing-person-name', 'Person cell has no name.', name);
        continue;
      }
      const roleText = clean(roleField);
      let role = roleText === undefined ? undefined : ROLES[roleText.toLowerCase()];
      if (role === undefined) {
        role = 'other';
        warn('unknown-role', `Unknown or missing role "${roleText ?? ''}".`, name);
      }
      rec.people.push({ name: personName, role });
    }
    const instructor = clean(cell('InstructorName'));
    if (
      instructor !== undefined &&
      !rec.people.some((p) => p.role === 'instructor' && p.name === instructor)
    ) {
      rec.people.push({ name: instructor, role: 'instructor' });
    }

    // ForeFlight's own export wraps every comment in literal double quotes.
    const remarks = cell('PilotComments')
      ?.trim()
      .replace(/^"([^]*)"$/, '$1')
      .trim();
    if (remarks) rec.remarks = remarks;

    // User-defined columns
    for (const c of customCols) {
      const t = row[c.index];
      if (t === undefined || t.trim() === '') continue;
      const mapping: ColumnMapping | undefined = columns[c.header] ?? columns[c.label];
      if (mapping !== undefined) {
        applyMapping(mapping, t, c.header, rec, warn);
        continue;
      }
      const v = parseByBracketType(c.type, t, c.header, warn);
      if (v !== undefined) rec.custom[c.label] = v;
    }

    out.push(rec);
  }

  return { source: 'foreflight', records: out, aircraft, issues };
};
