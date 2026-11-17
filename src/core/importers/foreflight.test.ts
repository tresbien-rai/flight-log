import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importForeFlight } from './foreflight';
import type { ImportResult, SourceRecord } from './types';

const FIXTURE = readFileSync(
  new URL('../../../fixtures/foreflight/sample.csv', import.meta.url),
  'utf8',
);
const sample = importForeFlight(FIXTURE);

/** The fixture's flight rows start at record 18. */
const row = (n: number): SourceRecord => sample.records.find((r) => r.line === n)!;

// ---- inline builders -------------------------------------------------------------------

const q = (c: string): string => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
const line = (cells: string[]): string => cells.map(q).join(',');

const AC_HEADER = [
  'AircraftID',
  'TypeCode',
  'Year',
  'Make',
  'Model',
  'GearType',
  'EngineType',
  'equipType (FAA)',
  'aircraftClass (FAA)',
  'complexAircraft (FAA)',
  'taa (FAA)',
  'highPerformance (FAA)',
  'pressurized (FAA)',
];

/** A complete file. `flights[0]` is the header row. `aircraft[0]` is the aircraft header. */
function file(flights: string[][], aircraft?: string[][], eol = '\r\n'): string {
  const parts: string[] = ['ForeFlight Logbook Import,This row is required for importing', ''];
  if (aircraft) parts.push('Aircraft Table', ...aircraft.map(line), '');
  parts.push('Flights Table ,  ,Deprecated: Do not edit manually', ...flights.map(line));
  return parts.join(eol) + eol;
}

/** Flight table from a header and rows given as objects keyed by column. */
function flightsOf(cols: string[], ...rows: Record<string, string>[]): string[][] {
  return [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ''))];
}

const COLS = [
  'Date',
  'AircraftID',
  'From',
  'To',
  'Route',
  'TimeOut',
  'TimeOff',
  'TimeOn',
  'TimeIn',
  'TotalTime',
  'PIC',
  'Night',
  'DualGiven',
  'SimulatedFlight',
  'GroundTraining',
  'Holds',
  'Approach1',
  'Approach2',
  'Person1',
  'Person2',
  'InstructorName',
  'PilotComments',
  'DayTakeoffs',
  'NightTakeoffs',
  'DayLandingsFullStop',
  'NightLandingsFullStop',
  'AllLandings',
];

function one(
  cells: Record<string, string>,
  cols = COLS,
  opts?: Parameters<typeof importForeFlight>[1],
) {
  const res = importForeFlight(
    file(flightsOf(cols, { Date: '2024-01-02', AircraftID: 'N1', ...cells }), [
      AC_HEADER,
      ['N1', 'C172', '', '', '', '', '', 'aircraft', '', '', '', '', ''],
    ]),
    opts,
  );
  return { res, rec: res.records[0]! };
}

const codes = (r: ImportResult): string[] => r.issues.map((i) => i.code);

// ---- tests -----------------------------------------------------------------------------

describe('section discovery', () => {
  it('finds the sections by label in a CRLF file with a trailing-space label', () => {
    expect(FIXTURE).toContain('Flights Table ,');
    expect(FIXTURE).toContain('\r\n');
    expect(sample.records).toHaveLength(15);
    expect(sample.aircraft).toHaveLength(9);
    expect(sample.records[0]!.line).toBe(18);
    expect(sample.records.at(-1)!.line).toBe(32);
    expect(sample.records.every((r) => r.source === 'foreflight')).toBe(true);
  });

  it('works with LF endings and a label with different case and spacing', () => {
    const text = file(
      flightsOf(COLS, { Date: '2024-01-02', AircraftID: 'N1' }),
      undefined,
      '\n',
    ).replace('Flights Table ', '  flights table');
    const res = importForeFlight(text);
    expect(res.records).toHaveLength(1);
    expect(res.records[0]!.line).toBe(5);
  });

  it('keeps file order and skips blank records, counting them in line numbers', () => {
    const text = file([
      ['Date', 'AircraftID'],
      ['2024-01-03', 'N1'],
      ['', ''],
      ['2024-01-01', 'N2'],
    ]);
    const res = importForeFlight(text);
    expect(res.records.map((r) => [r.line, r.date])).toEqual([
      [5, '2024-01-03'],
      [7, '2024-01-01'],
    ]);
  });

  it('tolerates a missing aircraft table with a warning', () => {
    const res = importForeFlight(file(flightsOf(COLS, { Date: '2024-01-02', AircraftID: 'N1' })));
    expect(codes(res)).toContain('no-aircraft-table');
    expect(res.aircraft).toEqual([{ tail: 'N1' }]);
  });

  it('throws a clear error when the Flights Table label is missing', () => {
    expect(() => importForeFlight('Date,AircraftID\r\n2024-01-01,N1\r\n')).toThrow(/Flights Table/);
    expect(() => importForeFlight('')).toThrow(/Flights Table/);
  });

  it('throws when the flights header lacks Date or AircraftID', () => {
    expect(() => importForeFlight('Flights Table\r\nDate,From\r\n2024-01-01,KAAA\r\n')).toThrow(
      /Date and AircraftID/,
    );
    expect(() => importForeFlight('Flights Table\r\n')).toThrow(/Date and AircraftID/);
  });

  it('rejects another app export (tab-delimited) by throwing', () => {
    expect(() => importForeFlight('Flight Date\tFrom\tTo\r\n2024-01-01\tKAAA\tKBBB\r\n')).toThrow();
  });
});

describe('quoted cells', () => {
  it('reads an embedded newline inside a quoted cell and counts it as one record', () => {
    const r = row(19);
    expect(r.line).toBe(19);
    expect(r.raw['Approach3']).toBe('1;VOR;31;KBBB;\r\nPartial Panel;');
    // The next record is exactly one line later: the newline did not split the record.
    expect(row(20).date).toBe('2024-03-03');
  });

  it('keeps internal newlines in remarks but trims the ends', () => {
    expect(row(19).remarks).toBe('Line one.\r\nLine two.');
  });
});

describe('kinds', () => {
  it('flight, simulator and ground', () => {
    expect(row(18).kind).toBe('flight');
    expect(row(28).kind).toBe('simulator'); // AATD
    expect(row(29).kind).toBe('simulator'); // FFS
    const ground = row(30);
    expect(ground.kind).toBe('ground');
    expect(ground.tail).toBeUndefined();
    expect(ground.durations.groundTraining).toBe(90);
  });

  it('simulator session length is in durations.simulator', () => {
    expect(row(28).durations).toMatchObject({ total: 0, pic: 0, simulator: 90 });
    expect(row(29).durations.total).toBeUndefined();
    expect(row(29).durations.simulator).toBe(240);
  });

  it('a row with no aircraft and no ground time stays a flight and warns', () => {
    const { res, rec } = one({ AircraftID: '', TotalTime: '1.0' });
    expect(rec.kind).toBe('flight');
    expect(rec.tail).toBeUndefined();
    expect(codes(res)).toContain('missing-aircraft');
  });

  it('a ground row with zero ground time is not ground', () => {
    const { rec } = one({ AircraftID: '', GroundTraining: '0.0' });
    expect(rec.kind).toBe('flight');
  });
});

describe('airports', () => {
  it('LOCAL sets localFlight and is never an airport', () => {
    const r = row(18);
    expect(r.from).toBe('KAAA');
    expect(r.to).toBeUndefined();
    expect(r.localFlight).toBe(true);
    expect(row(19).localFlight).toBeUndefined();
  });

  it('upper-cases and trims idents, and cleans the route', () => {
    const { rec } = one({ From: ' kaaa ', To: 'kbbb', Route: ' KAAA   KBBB ' });
    expect([rec.from, rec.to, rec.route]).toEqual(['KAAA', 'KBBB', 'KAAA KBBB']);
    expect(rec.flightNumber).toBeUndefined();
  });

  it('FROM can be LOCAL too, and blank airports are absent', () => {
    const { rec } = one({ From: 'LOCAL' });
    expect(rec.localFlight).toBe(true);
    expect(rec.from).toBeUndefined();
    expect(rec.to).toBeUndefined();
  });
});

describe('clock times', () => {
  it('maps TimeOut/Off/On/In to minutes after midnight', () => {
    expect(row(23).clock).toEqual({ out: 820, off: 832, on: 930, in: 941 });
    expect(row(24).clock).toEqual({ out: 1430, off: 1438, on: 80, in: 91 });
  });

  it('blank means absent; 00:00 is kept as a real value', () => {
    expect(row(18).clock).toEqual({});
    expect(row(25).clock).toEqual({ out: 0, in: 0 });
  });

  it('bad clock cells warn and are dropped', () => {
    const { res, rec } = one({ TimeOut: '9:61', TimeIn: 'noon', TimeOff: '13:05' });
    expect(rec.clock).toEqual({ off: 785 });
    expect(res.issues.filter((i) => i.code === 'bad-clock').map((i) => i.column)).toEqual([
      'TimeOut',
      'TimeIn',
    ]);
  });
});

describe('durations', () => {
  it('maps every duration column to integer minutes', () => {
    const { rec } = one({
      TotalTime: '2.8',
      PIC: '1.2',
      DualGiven: '0.5',
      Night: '0.3',
      SimulatedFlight: '1.5',
      GroundTraining: '0.2',
    });
    expect(rec.durations).toEqual({
      total: 168,
      pic: 72,
      dualGiven: 30,
      night: 18,
      simulator: 90,
      groundTraining: 12,
    });
  });

  it('maps the remaining duration columns', () => {
    const cols = [
      'Date',
      'AircraftID',
      'SIC',
      'Solo',
      'CrossCountry',
      'ActualInstrument',
      'SimulatedInstrument',
      'DualReceived',
    ];
    const { rec } = one(
      {
        SIC: '1.0',
        Solo: '2.0',
        CrossCountry: '3.0',
        ActualInstrument: '0.1',
        SimulatedInstrument: '0.2',
        DualReceived: '0.3',
      },
      cols,
    );
    expect(rec.durations).toEqual({
      sic: 60,
      solo: 120,
      crossCountry: 180,
      actualInstrument: 6,
      simulatedInstrument: 12,
      dualReceived: 18,
    });
  });

  it('keeps 0.0 (none) distinct from blank (not recorded)', () => {
    const r = row(20); // total 0.0, pic 0.0, night 0.0, solo blank
    expect(r.durations.total).toBe(0);
    expect(r.durations.pic).toBe(0);
    expect(r.durations.night).toBe(0);
    expect('solo' in r.durations).toBe(false);
    expect('crossCountry' in r.durations).toBe(false);
    expect('total' in row(29).durations).toBe(false);
  });

  it('bad durations warn with the column and are dropped', () => {
    const { res, rec } = one({ TotalTime: 'abc', PIC: '1,5', Night: '1.25' });
    expect(rec.durations).toEqual({ night: 75 });
    const bad = res.issues.filter((i) => i.code === 'bad-duration');
    expect(bad.map((i) => i.column)).toEqual(['TotalTime', 'PIC']);
    expect(bad.every((i) => i.severity === 'warning' && i.line === 9)).toBe(true);
  });
});

describe('takeoffs, landings and holds', () => {
  it('maps the landing columns without inventing totals', () => {
    const r = row(18);
    expect(r.counts).toEqual({
      dayTakeoffs: 3,
      nightTakeoffs: 0,
      dayFullStopLandings: 2,
      nightFullStopLandings: 0,
      allLandings: 3,
      holds: 0,
    });
    expect(r.counts.dayLandings).toBeUndefined();
    expect(r.counts.nightLandings).toBeUndefined();
    expect(r.counts.fullStopLandings).toBeUndefined();
    expect(r.counts.touchAndGoes).toBeUndefined();
  });

  it('blank counts are absent', () => {
    expect(row(25).counts).toEqual({});
    expect(row(26).counts).toEqual({
      dayTakeoffs: 4,
      dayFullStopLandings: 1,
      allLandings: 4,
      holds: 2,
    });
  });

  it('bad counts warn', () => {
    const { res, rec } = one({ DayTakeoffs: 'x', AllLandings: '-1', Holds: '2' });
    expect(rec.counts).toEqual({ holds: 2 });
    expect(res.issues.filter((i) => i.code === 'bad-count').map((i) => i.column)).toEqual([
      'DayTakeoffs',
      'AllLandings',
    ]);
  });
});

describe('approaches', () => {
  it('expands counts, keeps chart titles, circle remarks and multi-line comments', () => {
    const r = row(19);
    expect(r.approaches).toEqual([
      { type: 'ILS', runway: '24R', airport: 'KBBB', note: 'ILS OR LOC RWY 24R' },
      { type: 'ILS', runway: '24R', airport: 'KBBB', note: 'ILS OR LOC RWY 24R' },
      {
        type: 'RNAV-GPS',
        runway: '06',
        airport: 'KBBB',
        note: 'RNAV (GPS) Y RWY 06; Straight-in',
      },
      { type: 'VOR', runway: '31', airport: 'KBBB', note: 'Partial Panel' },
      { type: 'ILS', runway: '24', airport: 'KBBB', circleToLand: true },
    ]);
    // Expanded entries are independent objects.
    expect(r.approaches[0]).not.toBe(r.approaches[1]);
  });

  it('reads approaches from any ApproachN column and recognises back courses', () => {
    expect(row(32).approaches).toEqual([{ type: 'LOC-BC', airport: 'KBBB' }]);
    expect(row(28).approaches).toHaveLength(3);
  });

  it('turns parser problems into warnings naming the column', () => {
    const { res, rec } = one({
      Approach1: '1;MYSTERY;99;KBBB;',
      Approach2: '0;ILS;24;KBBB;;',
    });
    expect(rec.approaches).toHaveLength(2);
    expect(rec.approaches[0]).toMatchObject({ type: 'OTHER', airport: 'KBBB' });
    const got = res.issues.map((i) => [i.code, i.column]);
    expect(got).toEqual([
      ['unknown-approach-type', 'Approach1'],
      ['bad-runway', 'Approach1'],
      ['bad-count', 'Approach2'],
    ]);
    expect(res.issues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('ignores cells that are only separators', () => {
    const { res, rec } = one({ Approach1: ';;;;;' });
    expect(rec.approaches).toEqual([]);
    expect(res.issues).toEqual([]);
  });
});

describe('people', () => {
  it('parses roles and never copies email or phone', () => {
    const r = row(22);
    expect(r.people).toEqual([
      { name: 'Dana Instructor', role: 'instructor' },
      { name: 'Jo Passenger', role: 'passenger' },
      { name: 'Pat Example', role: 'PIC' },
    ]);
    expect(JSON.stringify(sample.records.map((x) => x.people))).not.toMatch(/example\.com|555/);
    expect(JSON.stringify(sample.records.map((x) => x.custom))).not.toMatch(/example\.com|555/);
    // The verbatim cell stays in raw only.
    expect(r.raw['Person1']).toContain('dana.i@example.com');
  });

  it('maps every known role, case-insensitively', () => {
    const cols = [
      'Date',
      'AircraftID',
      'Person1',
      'Person2',
      'Person3',
      'Person4',
      'Person5',
      'Person6',
    ];
    const { res, rec } = one(
      {
        Person1: 'A One;pic;;',
        Person2: 'B Two;SIC;;',
        Person3: 'C Three;STUDENT;;',
        Person4: 'D Four;Examiner;;',
        Person5: 'E Five;Observer;;',
        Person6: 'F Six;Safety Pilot;;',
      },
      cols,
    );
    expect(rec.people.map((p) => p.role)).toEqual([
      'PIC',
      'SIC',
      'student',
      'examiner',
      'observer',
      'observer',
    ]);
    expect(codes(res)).not.toContain('unknown-role');
  });

  it('unknown or missing roles become other with a warning; nameless cells are skipped', () => {
    const { res, rec } = one({
      Person1: 'Quinn Odd;Wizard;;',
      Person2: ';PIC;;',
    });
    expect(rec.people).toEqual([{ name: 'Quinn Odd', role: 'other' }]);
    expect(codes(res)).toEqual(expect.arrayContaining(['unknown-role', 'missing-person-name']));
    const { rec: r2, res: res2 } = one({ Person1: '  Sam   Q  Public ' });
    expect(r2.people).toEqual([{ name: 'Sam Q Public', role: 'other' }]);
    expect(codes(res2)).toContain('unknown-role');
  });

  it('adds InstructorName as an instructor unless already listed', () => {
    expect(row(22).people.filter((p) => p.role === 'instructor')).toHaveLength(1);
    expect(row(18).people).toEqual([
      { name: 'Sam Student', role: 'student' },
      { name: 'Pat Example', role: 'instructor' },
    ]);
    expect(row(30).people).toEqual([{ name: 'Dana Instructor', role: 'instructor' }]);
  });

  it('adds InstructorName when the listed instructor has a different name', () => {
    const { rec } = one({
      Person1: 'Dana Instructor;Instructor;;',
      InstructorName: 'Other Person',
    });
    expect(rec.people.map((p) => p.name)).toEqual(['Dana Instructor', 'Other Person']);
  });
});

describe('remarks, rule and pilotFlying', () => {
  it('trims PilotComments; blank gives none', () => {
    expect(row(18).remarks).toBe('Pattern work.');
    expect(row(20).remarks).toBe('Zero-time row.');
    expect(row(22).remarks).toBeUndefined();
  });

  it('leaves rule and pilotFlying absent by default', () => {
    for (const r of sample.records) {
      expect(r.rule).toBeUndefined();
      expect(r.pilotFlying).toBeUndefined();
    }
  });
});

describe('user-defined columns', () => {
  it('stores each bracket type under its label by default', () => {
    expect(row(18).custom).toEqual({ 'DG-PPL': 72, 'XC (50NM)': 0 });
    expect(row(19).custom).toEqual({ Flag: true, 'Passenger Count': 2, 'XC (50NM)': 90 });
    expect(row(21).custom).toEqual({ Flag: false });
    expect(row(23).custom).toEqual({
      'Part 121': true,
      'Passenger Count': 61,
      'XC (50NM)': 120,
    });
  });

  it('handles Text, Counter, unknown prefixes and the bare-label fallback', () => {
    const cols = [
      'Date',
      'AircraftID',
      '[Text]Memo',
      '[Counter]Laps',
      '[Date]Check',
      '[Weird] Thing ',
      '[Hours]',
    ];
    const { res, rec } = one(
      {
        '[Text]Memo': '  hello   there ',
        '[Counter]Laps': '3.0',
        '[Date]Check': '2024-02-01',
        '[Weird] Thing ': ' x ',
        '[Hours]': '1.0',
      },
      cols,
    );
    expect(rec.custom).toEqual({
      Memo: 'hello there',
      Laps: 3,
      Check: '2024-02-01',
      Thing: 'x',
      '[Hours]': 60,
    });
    expect(codes(res)).toEqual([]);
  });

  it('skips blank cells and warns on bad ones', () => {
    const { res, rec } = one(
      {
        '[Hours]XC (50NM)': 'oops',
        '[Toggle]Flag': 'maybe',
        '[Numeric]Passenger Count': 'many',
        '[Hours]DG-PPL': '',
      },
      [...COLS, '[Hours]XC (50NM)', '[Toggle]Flag', '[Numeric]Passenger Count', '[Hours]DG-PPL'],
    );
    expect(rec.custom).toEqual({});
    expect(
      res.issues.filter((i) => i.column?.startsWith('[')).map((i) => [i.code, i.column]),
    ).toEqual([
      ['bad-duration', '[Hours]XC (50NM)'],
      ['bad-toggle', '[Toggle]Flag'],
      ['bad-number', '[Numeric]Passenger Count'],
    ]);
  });

  const withCols = [...COLS, '[Hours]XC (50NM)', '[Toggle]Part 121', '[Numeric]Passenger Count'];
  const cells = {
    '[Hours]XC (50NM)': '1.5',
    '[Toggle]Part 121': 'true',
    '[Numeric]Passenger Count': '61.000000',
  };

  it('mapping to a duration, by full header and by bare label', () => {
    for (const key of ['[Hours]XC (50NM)', 'XC (50NM)']) {
      const { rec } = one(cells, withCols, { columns: { [key]: { duration: 'crossCountry50' } } });
      expect(rec.durations.crossCountry50).toBe(90);
      expect(rec.custom['XC (50NM)']).toBeUndefined();
      expect(rec.custom['Part 121']).toBe(true); // others untouched
    }
  });

  it('mapping to a rule sets it only when the toggle is true', () => {
    for (const key of ['[Toggle]Part 121', 'Part 121']) {
      const opts = { columns: { [key]: { rule: '121' as const } } };
      const yes = one(cells, withCols, opts).rec;
      expect(yes.rule).toBe('121');
      expect(yes.custom['Part 121']).toBeUndefined();
      const no = one({ ...cells, '[Toggle]Part 121': 'false' }, withCols, opts).rec;
      expect(no.rule).toBeUndefined();
      const blank = one({ ...cells, '[Toggle]Part 121': '' }, withCols, opts).rec;
      expect(blank.rule).toBeUndefined();
    }
  });

  it('mapping to a custom key with each type', () => {
    const { rec } = one(cells, withCols, {
      columns: {
        'XC (50NM)': { custom: 'xc50', type: 'duration' },
        '[Toggle]Part 121': { custom: 'airline', type: 'toggle' },
        'Passenger Count': { custom: 'pax', type: 'count' },
      },
    });
    expect(rec.custom).toEqual({ xc50: 90, airline: true, pax: 61 });
    const text = one(cells, withCols, {
      columns: { 'Passenger Count': { custom: 'paxText', type: 'text' } },
    }).rec;
    expect(text.custom['paxText']).toBe('61.000000');
  });

  it('prefers the full-header mapping over the bare label', () => {
    const { rec } = one(cells, withCols, {
      columns: {
        'XC (50NM)': { custom: 'bare', type: 'duration' },
        '[Hours]XC (50NM)': { custom: 'full', type: 'duration' },
      },
    });
    expect(rec.custom['full']).toBe(90);
    expect(rec.custom['bare']).toBeUndefined();
  });

  it('bad values under a mapping warn and set nothing', () => {
    const { res, rec } = one({ '[Hours]XC (50NM)': 'x', '[Toggle]Part 121': 'huh' }, withCols, {
      columns: {
        'XC (50NM)': { duration: 'crossCountry50' },
        'Part 121': { rule: '121' },
      },
    });
    expect(rec.durations.crossCountry50).toBeUndefined();
    expect(rec.rule).toBeUndefined();
    expect(codes(res)).toEqual(expect.arrayContaining(['bad-duration', 'bad-toggle']));
  });

  it('applies mappings across the fixture', () => {
    const res = importForeFlight(FIXTURE, {
      columns: { 'Part 121': { rule: '121' }, 'XC (50NM)': { duration: 'crossCountry50' } },
    });
    expect(res.records.filter((r) => r.rule === '121').map((r) => r.line)).toEqual([23, 24]);
    expect(res.records.find((r) => r.line === 19)!.durations.crossCountry50).toBe(90);
  });
});

describe('aircraft table', () => {
  const byTail = (t: string) => sample.aircraft.find((a) => a.tail === t)!;

  it('maps a single-engine trainer', () => {
    expect(byTail('N101AB')).toEqual({
      tail: 'N101AB',
      typeCode: 'C172',
      make: 'Cessna',
      model: '172S Skyhawk',
      year: 2004,
      engine: 'piston',
      class: 'ASEL',
      taa: true,
      retractable: false,
      tailwheel: false,
    });
  });

  it('maps gear, flags and classes', () => {
    expect(byTail('N202CD')).toMatchObject({ complex: true, retractable: true, tailwheel: false });
    expect(byTail('N303EF')).toMatchObject({ class: 'AMEL', retractable: false });
    expect(byTail('N404GH')).toMatchObject({
      engine: 'turbofan',
      pressurized: true,
      retractable: true,
    });
    expect(byTail('N505JK').highPerformance).toBe(true);
    expect(byTail('N707PQ')).toMatchObject({ tailwheel: true, retractable: false, year: 1985 });
    expect(byTail('N707PQ').typeCode).toBeUndefined();
    expect(byTail('N101AB').complex).toBeUndefined();
  });

  it('maps training devices and leaves blank gear undefined', () => {
    expect(byTail('SIM-AATD-1')).toMatchObject({ deviceLevel: 'AATD', class: 'ASEL' });
    expect(byTail('SIM-AATD-1').retractable).toBeUndefined();
    expect(byTail('SIM-AATD-1').tailwheel).toBeUndefined();
    expect(byTail('SIM-AATD-1').engine).toBeUndefined();
    expect(byTail('FFS-EX-100').deviceLevel).toBe('FFS');
    expect(byTail('N101AB').deviceLevel).toBeUndefined();
  });

  it('merges whitespace-only tail duplicates, first wins, with a warning', () => {
    expect(sample.aircraft.filter((a) => a.tail === 'N404GH')).toHaveLength(1);
    expect(byTail('N404GH').tailRaw).toBeUndefined();
    const dup = sample.issues.filter((i) => i.code === 'duplicate-aircraft');
    expect(dup).toHaveLength(1);
    expect(dup[0]!.line).toBe(9);
    expect(codes(sample)).not.toContain('aircraft-conflict');
    expect(codes(sample)).toEqual(['duplicate-aircraft']);
  });

  it('flights using the trailing-space tail resolve to the same aircraft', () => {
    expect(row(24).tail).toBe('N404GH');
    expect(row(24).raw['AircraftID']).toBe('N404GH ');
  });

  it('keeps tailRaw when the first row differs, and warns on conflicting duplicates', () => {
    const text = file(flightsOf(['Date', 'AircraftID'], { Date: '2024-01-01', AircraftID: 'n5' }), [
      AC_HEADER,
      [
        ' n5 ',
        'C172',
        '',
        'Cessna',
        '172S',
        'fixed_tricycle',
        'Piston',
        'aircraft',
        'airplane_single_engine_land',
      ],
      ['N5', 'C182', '', 'Cessna', '182T', '', '', 'aircraft', ''],
    ]);
    const res = importForeFlight(text);
    expect(res.aircraft).toHaveLength(1);
    expect(res.aircraft[0]).toMatchObject({ tail: 'N5', tailRaw: ' n5 ', typeCode: 'C172' });
    expect(codes(res)).toEqual(['duplicate-aircraft', 'aircraft-conflict']);
    expect(res.records[0]!.tail).toBe('N5');
  });

  it('warns on unknown engine, class and equipment values', () => {
    const text = file(flightsOf(['Date', 'AircraftID'], { Date: '2024-01-01', AircraftID: 'N6' }), [
      AC_HEADER,
      [
        'N6',
        'X',
        '1999',
        'M',
        'Mod',
        'retractable_conventional',
        'Rocket',
        'gadget',
        'hovercraft',
        'TRUE',
        'FALSE',
        'maybe',
        '',
      ],
    ]);
    const res = importForeFlight(text);
    expect(codes(res)).toEqual([
      'unknown-engine',
      'unknown-class',
      'unknown-equip-type',
      'bad-bool',
    ]);
    expect(res.aircraft[0]).toEqual({
      tail: 'N6',
      typeCode: 'X',
      year: 1999,
      make: 'M',
      model: 'Mod',
      complex: true,
      taa: false,
      retractable: true,
      tailwheel: true,
    });
    expect(res.records[0]!.kind).toBe('flight');
  });

  it('maps the device levels and class names', () => {
    const rows = [
      ['D1', 'ffs', 'airplane_single_engine_sea', 'Electric'],
      ['D2', 'ftd', 'airplane_multi_engine_sea', 'Turboprop'],
      ['D3', 'batd', 'rotorcraft_helicopter', 'Turboshaft'],
      ['D4', 'aatd', 'rotorcraft_gyroplane', 'None'],
      ['D5', 'aircraft', 'glider', 'Turbojet'],
    ].map(([id, equip, cls, eng]) => [id!, '', '', '', '', '', eng!, equip!, cls!, '', '', '', '']);
    const res = importForeFlight(
      file(flightsOf(['Date', 'AircraftID'], { Date: '2024-01-01', AircraftID: 'D1' }), [
        AC_HEADER,
        ...rows,
      ]),
    );
    expect(codes(res)).toEqual([]);
    expect(res.aircraft.map((a) => [a.deviceLevel, a.class, a.engine])).toEqual([
      ['FFS', 'ASES', 'electric'],
      ['FTD', 'AMES', 'turboprop'],
      ['BATD', 'helicopter', 'turboshaft'],
      ['AATD', 'gyroplane', 'none'],
      [undefined, 'other', 'turbojet'],
    ]);
    expect(res.records[0]!.kind).toBe('simulator');
  });

  it('adds a bare aircraft and warns for an unknown tail, once per record', () => {
    const text = file(
      flightsOf(
        ['Date', 'AircraftID'],
        { Date: '2024-01-01', AircraftID: 'n9 ' },
        { Date: '2024-01-02', AircraftID: 'N9' },
      ),
      [AC_HEADER, ['N1', 'C172', '', '', '', '', '', 'aircraft', '', '', '', '', '']],
    );
    const res = importForeFlight(text);
    expect(res.aircraft.map((a) => a.tail)).toEqual(['N1', 'N9']);
    expect(res.aircraft[1]).toEqual({ tail: 'N9' });
    expect(res.issues.filter((i) => i.code === 'unknown-aircraft').map((i) => i.line)).toEqual([
      9, 10,
    ]);
  });

  it('every record tail is in the aircraft list', () => {
    const tails = new Set(sample.aircraft.map((a) => a.tail));
    for (const r of sample.records) if (r.tail !== undefined) expect(tails.has(r.tail)).toBe(true);
  });

  it('skips aircraft rows with no id', () => {
    const text = file(flightsOf(['Date', 'AircraftID'], { Date: '2024-01-01', AircraftID: 'N1' }), [
      AC_HEADER,
      ['', 'C172', '', '', '', '', '', 'aircraft', '', '', '', '', ''],
      ['N1', '', '', '', '', '', '', 'aircraft', '', '', '', '', ''],
    ]);
    const res = importForeFlight(text);
    expect(res.aircraft.map((a) => a.tail)).toEqual(['N1']);
    expect(codes(res)).toEqual(['aircraft-no-id']);
  });
});

describe('bad cells give issues, not exceptions', () => {
  it('bad and blank dates are error issues and rows are kept', () => {
    const res = importForeFlight(
      file([
        ['Date', 'AircraftID'],
        ['2024-13-45', 'N1'],
        [' 03/04/2024 ', 'N1'],
        ['', 'N1'],
        ['2024-02-29', 'N1'],
      ]),
    );
    expect(res.records.map((r) => r.date)).toEqual(['2024-13-45', '03/04/2024', '', '2024-02-29']);
    const errs = res.issues.filter((i) => i.severity === 'error');
    expect(errs.map((i) => [i.code, i.line, i.column])).toEqual([
      ['bad-date', 5, 'Date'],
      ['bad-date', 6, 'Date'],
      ['bad-date', 7, 'Date'],
    ]);
  });

  it('flags rows with more non-empty cells than header columns', () => {
    const text =
      'Flights Table\r\nDate,AircraftID\r\n2024-01-01,N1,extra\r\n2024-01-02,N1,\r\n2024-01-03,N1,,\r\n';
    const res = importForeFlight(text);
    expect(res.records).toHaveLength(3);
    expect(
      res.issues.filter((i) => i.code === 'ragged-row').map((i) => [i.severity, i.line]),
    ).toEqual([['error', 3]]);
  });

  it('survives a file full of nonsense cells', () => {
    const cols = [...COLS, '[Hours]H', '[Toggle]T'];
    const junk = Object.fromEntries(cols.map((c) => [c, '\u0000;;"'])) as Record<string, string>;
    const res = importForeFlight(file(flightsOf(cols, junk, { ...junk, Date: '2024-01-01' })));
    expect(res.records).toHaveLength(2);
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it('header-only flights table gives no records', () => {
    const res = importForeFlight(file([['Date', 'AircraftID']]));
    expect(res.records).toEqual([]);
  });
});

describe('raw', () => {
  it('keeps every non-empty cell verbatim keyed by trimmed header, ignoring empty headers', () => {
    const text =
      'Flights Table\r\n Date ,AircraftID,,From,Notes\r\n2024-01-01, N1 ,junk, kaaa ,  \r\n';
    const rec = importForeFlight(text).records[0]!;
    expect(rec.raw).toEqual({ Date: '2024-01-01', AircraftID: ' N1 ', From: ' kaaa ' });
  });

  it('includes zero values and cells the importer does not otherwise use', () => {
    const r = row(23);
    expect(r.raw['OnDuty']).toBe('12:30');
    expect(r.raw['OffDuty']).toBe('16:30');
    expect(r.raw['TotalTime']).toBe('2.0');
    expect(r.raw['PIC']).toBe('0.0');
    expect(r.raw['[Toggle]Part 121']).toBe('true');
    expect('Solo' in r.raw).toBe(false);
    expect(row(29).raw['Checkride (FAA)']).toBe('TRUE');
  });
});

describe('fixture overall', () => {
  it('has the expected kinds', () => {
    const kinds = sample.records.map((r) => r.kind);
    expect(kinds.filter((k) => k === 'simulator')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'ground')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'flight')).toHaveLength(12);
  });

  it('has no error issues', () => {
    expect(sample.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('real export', () => {
  it.skipIf(!process.env['FOREFLIGHT_REAL_EXPORT'])('imports without throwing or errors', () => {
    const text = readFileSync(process.env['FOREFLIGHT_REAL_EXPORT']!, 'utf8');
    const res = importForeFlight(text);
    expect(res.records.length).toBeGreaterThan(0);
    expect(res.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
