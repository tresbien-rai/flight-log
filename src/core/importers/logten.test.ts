import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importLogTen } from './logten';
import type { ImportResult, SourceRecord } from './types';

const nodeProcess = process;
const readText = (path: string): string => readFileSync(path, 'utf8');

const fixtureText = readFileSync(
  new URL('../../../fixtures/logten/sample.txt', import.meta.url),
  'utf8',
);
const fixture = importLogTen(fixtureText);

/** Small inline export: header names get the stray leading space LogTen puts on most of them. */
function tsv(columns: string[], ...rows: string[][]): string {
  const header = columns.map((c, i) => (i === 0 ? c : ` ${c}`)).join('\t');
  return (
    [header, ...rows.map((r) => r.map((c) => (c.includes('\n') ? `"${c}"` : c)).join('\t'))].join(
      '\n',
    ) + '\n'
  );
}

/** One-row export built from a column -> value map. */
function one(cells: Record<string, string>, options?: Parameters<typeof importLogTen>[1]) {
  const cols = [
    'flight_flightDate',
    ...Object.keys(cells).filter((c) => c !== 'flight_flightDate'),
  ];
  const row = cols.map((c) => cells[c] ?? '');
  if (!('flight_flightDate' in cells)) row[0] = '2024-01-02';
  const res = importLogTen(tsv(cols, row), options);
  return { res, rec: res.records[0] as SourceRecord };
}

const codes = (res: ImportResult): string[] => res.issues.map((i) => i.code);

function byLine(line: number): SourceRecord {
  const r = fixture.records.find((x) => x.line === line);
  if (!r) throw new Error(`no record at line ${line}`);
  return r;
}

describe('importLogTen: file level', () => {
  it('reads the fixture without errors', () => {
    expect(fixture.source).toBe('logten');
    expect(fixture.records).toHaveLength(19);
    expect(fixture.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('trims header names so raw is keyed by the trimmed header', () => {
    const r = byLine(2);
    expect(r.raw['flight_from']).toBe('KXYZ');
    expect(r.raw['flight_flightDate']).toBe('2015-03-02');
    expect(Object.keys(r.raw).some((k) => k !== k.trim())).toBe(false);
  });

  it('numbers records from the header as record 1', () => {
    expect(fixture.records[0]!.line).toBe(2);
    expect(fixture.records.at(-1)!.line).toBe(20);
  });

  it('throws a clear error when the file is not a LogTen export', () => {
    expect(() => importLogTen('a,b,c\n1,2,3\n')).toThrow(/flight_flightDate/);
    expect(() => importLogTen('')).toThrow(/LogTen/);
  });

  it('skips blank records silently but keeps line numbers', () => {
    const res = importLogTen(
      tsv(
        ['flight_flightDate', 'flight_from'],
        ['2024-01-02', 'KAAA'],
        [''],
        ['\t'],
        ['2024-01-03', 'KBBB'],
      ),
    );
    expect(res.records.map((r) => r.line)).toEqual([2, 5]);
    expect(res.issues).toEqual([]);
  });

  it('keeps a quoted multi-line cell in one record and keeps its newline', () => {
    const r = byLine(4);
    expect(r.remarks).toBe('First solo cross country\nWinds light and variable');
    expect(r.raw['flight_remarks']).toBe('First solo cross country\nWinds light and variable');
    expect(fixture.records.map((x) => x.line)).toContain(5);
  });
});

describe('importLogTen: record kinds', () => {
  it('classifies flights, simulators and ground rows', () => {
    const kinds = fixture.records.map((r) => r.kind);
    expect(kinds.filter((k) => k === 'simulator')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'ground')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'flight')).toHaveLength(16);
    expect(byLine(2).kind).toBe('flight');
  });

  it('simulator: training-device category, time in simulator, device aircraft', () => {
    const sim = byLine(10);
    expect(sim.kind).toBe('simulator');
    expect(sim.tail).toBe('SIM-TEST1');
    expect(sim.durations).toEqual({ simulatedInstrument: 72, simulator: 72 });
    expect(sim.from).toBeUndefined();
    const ac = fixture.aircraft.find((a) => a.tail === 'SIM-TEST1')!;
    expect(ac.deviceLevel).toBe('AATD');
    expect(ac.isDevice).toBeUndefined();
  });

  it('device without a level in its type string is only isDevice', () => {
    const { res } = one({
      aircraft_aircraftID: 'SIM9',
      aircraftType_type: 'GENERIC',
      aircraftType_selectedCategory: 'Training Device',
    });
    expect(res.records[0]!.kind).toBe('simulator');
    expect(res.aircraft[0]).toMatchObject({ tail: 'SIM9', isDevice: true });
    expect(res.aircraft[0]!.deviceLevel).toBeUndefined();
  });

  it('ground: no aircraft and ground time', () => {
    const g = byLine(12);
    expect(g.kind).toBe('ground');
    expect(g.tail).toBeUndefined();
    expect(g.durations).toEqual({ groundTraining: 60 });
    expect(g.people).toEqual([{ name: 'Sample, Sam', role: 'instructor' }]);
  });

  it('a row without aircraft and without ground time stays a flight', () => {
    expect(one({ flight_from: 'KAAA' }).rec.kind).toBe('flight');
  });
});

describe('importLogTen: date, airports, clock', () => {
  it('reports bad-date as an error and keeps the raw text', () => {
    const { res, rec } = one({ flight_flightDate: '2024-02-30' });
    expect(rec.date).toBe('2024-02-30');
    expect(res.issues).toEqual([
      expect.objectContaining({ severity: 'error', code: 'bad-date', line: 2 }),
    ]);
    const blank = one({ flight_flightDate: '', flight_from: 'KAAA' });
    expect(blank.rec.date).toBe('');
    expect(codes(blank.res)).toEqual(['bad-date']);
  });

  it('LOCAL sets localFlight and is never an airport', () => {
    const r = byLine(2);
    expect(r.from).toBe('KXYZ');
    expect(r.to).toBeUndefined();
    expect(r.localFlight).toBe(true);
    expect(byLine(4).localFlight).toBeUndefined();
    expect(byLine(4).to).toBe('KXYZ');
  });

  it('normalises airports and cleans route and flight number', () => {
    const { rec } = one({
      flight_from: ' kxyz ',
      flight_to: 'kabc',
      flight_route: ' KXYZ-KABC ',
      flight_flightNumber: 'AA 123 ',
    });
    expect(rec).toMatchObject({
      from: 'KXYZ',
      to: 'KABC',
      route: 'KXYZ-KABC',
      flightNumber: 'AA 123',
    });
  });

  it('maps the six clock columns', () => {
    expect(byLine(14).clock).toEqual({
      out: 13 * 60 + 40,
      off: 13 * 60 + 55,
      on: 14 * 60 + 50,
      in: 14 * 60 + 58,
      scheduledOut: 13 * 60 + 35,
      scheduledIn: 14 * 60 + 55,
    });
    expect(byLine(17).clock).toEqual({ out: 10 * 60, in: 12 * 60 + 15 });
    expect(byLine(19).clock).toEqual({});
    expect(byLine(16).clock.in).toBeLessThan(byLine(16).clock.out!);
  });

  it('warns about unreadable clock times', () => {
    const { res, rec } = one({ flight_takeoffTime: '25:99', flight_landingTime: 'noon' });
    expect(rec.clock).toEqual({});
    expect(res.issues.map((i) => [i.severity, i.code, i.column])).toEqual([
      ['warning', 'bad-clock', 'flight_takeoffTime'],
      ['warning', 'bad-clock', 'flight_landingTime'],
    ]);
  });
});

describe('importLogTen: durations and counts', () => {
  it('converts decimal hours to integer minutes', () => {
    expect(byLine(2).durations).toEqual({ total: 76, pic: 76, dualReceived: 76, night: 30 });
    expect(byLine(8).durations).toMatchObject({ total: 78, dualGiven: 78 });
    expect(byLine(4).durations).toMatchObject({ solo: 126, crossCountry: 126 });
  });

  it('leaves blank durations absent and keeps explicit zero', () => {
    const { rec } = one({ flight_totalTime: '0.00', flight_pic: '' });
    expect(rec.durations).toEqual({ total: 0 });
  });

  it('maps every duration column', () => {
    const { res, rec } = one({
      flight_totalTime: '1.00',
      flight_pic: '2.00',
      flight_sic: '3.00',
      flight_solo: '4.00',
      flight_night: '5.00',
      flight_crossCountry: '6.00',
      flight_actualInstrument: '7.00',
      flight_simulatedInstrument: '8.00',
      flight_dualReceived: '9.00',
      flight_dualGiven: '10.00',
      flight_simulator: '11.00',
      flight_ground: '12.00',
    });
    expect(rec.durations).toEqual({
      total: 60,
      pic: 120,
      sic: 180,
      solo: 240,
      night: 300,
      crossCountry: 360,
      actualInstrument: 420,
      simulatedInstrument: 480,
      dualReceived: 540,
      dualGiven: 600,
      simulator: 660,
      groundTraining: 720,
    });
    expect(res.issues).toEqual([]);
  });

  it('maps landings and takeoffs without inventing allLandings or full-stop splits', () => {
    expect(byLine(2).counts).toEqual({
      dayTakeoffs: 3,
      dayLandings: 3,
      fullStopLandings: 1,
      touchAndGoes: 2,
    });
    const c = byLine(16).counts;
    expect(c).toMatchObject({ nightTakeoffs: 1, nightLandings: 1, goArounds: 1 });
    expect(c.allLandings).toBeUndefined();
    expect(c.dayFullStopLandings).toBeUndefined();
    expect(c.nightFullStopLandings).toBeUndefined();
    expect(byLine(5).counts.holds).toBe(1);
  });

  it('turns bad durations and counts into warnings, not exceptions', () => {
    const { res, rec } = one({
      flight_totalTime: 'abc',
      flight_pic: '1,5',
      flight_dayLandings: '-1',
      flight_holds: 'two',
      flight_night: '0.50',
    });
    expect(rec.durations).toEqual({ night: 30 });
    expect(rec.counts).toEqual({});
    expect(res.issues.map((i) => [i.severity, i.code, i.column])).toEqual([
      ['warning', 'bad-duration', 'flight_totalTime'],
      ['warning', 'bad-duration', 'flight_pic'],
      ['warning', 'bad-count', 'flight_dayLandings'],
      ['warning', 'bad-count', 'flight_holds'],
    ]);
  });
});

describe('importLogTen: approaches', () => {
  it('expands a count of 2 and reports a problem cell', () => {
    const r = byLine(5);
    expect(r.approaches).toEqual([
      { type: 'ILS', runway: '06', airport: 'KXYZ' },
      { type: 'ILS', runway: '06', airport: 'KXYZ' },
      { type: 'RNAV-GPS', runway: '24R', airport: 'KABC' },
      { type: 'OTHER', runway: '15', airport: 'KABC', note: 'WIBBLE' },
    ]);
    const problems = fixture.issues.filter((i) => i.line === 5);
    expect(problems).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'unknown-approach-type',
        column: 'flight_selectedApproach3',
      }),
    ]);
  });

  it('copies approaches so expanded entries are independent objects', () => {
    const a = byLine(5).approaches;
    expect(a[0]).not.toBe(a[1]);
  });

  it('handles the shifted airport form and a missing type', () => {
    const r = byLine(6);
    expect(r.approaches).toEqual([{ type: 'OTHER', airport: 'KABC' }]);
    expect(fixture.issues.some((i) => i.line === 6 && i.code === 'unknown-approach-type')).toBe(
      true,
    );
  });

  it('reads approaches on a simulator row and a jet leg', () => {
    expect(byLine(10).approaches).toEqual([{ type: 'ILS', runway: '24R', airport: 'KABC' }]);
    expect(byLine(20).approaches).toEqual([{ type: 'ILS', runway: '24', airport: 'KABC' }]);
  });
});

describe('importLogTen: operating rule and pilot flying', () => {
  it('uses 121 when flagged', () => {
    expect(byLine(14).rule).toBe('121');
    expect(byLine(14).raw['flight_faaPart121']).toBe('1');
  });

  it('falls back to 91 and then absent', () => {
    expect(byLine(17).rule).toBe('91');
    expect(byLine(2).rule).toBeUndefined();
  });

  it('prefers 121 over 135 over 91 and warns on more than one', () => {
    const r = byLine(18);
    expect(r.rule).toBe('121');
    expect(fixture.issues.filter((i) => i.line === 18).map((i) => i.code)).toEqual([
      'multiple-rules',
    ]);
    const { res, rec } = one({ flight_faaPart135: '1', flight_faaPart91: '1' });
    expect(rec.rule).toBe('135');
    expect(codes(res)).toEqual(['multiple-rules']);
    expect(one({ flight_faaPart135: '1' }).rec.rule).toBe('135');
  });

  it('pilotFlying is true only when the capability column says so', () => {
    expect(byLine(2).pilotFlying).toBe(true);
    expect(byLine(15).pilotFlying).toBeUndefined();
    expect(one({ flight_pilotFlyingCapacity: '' }).rec.pilotFlying).toBeUndefined();
    expect(one({ flight_pilotFlyingCapacity: '0' }).rec.pilotFlying).toBe(false);
  });
});

describe('importLogTen: people', () => {
  it('assigns roles from the crew and pax column names without reformatting names', () => {
    expect(byLine(2).people).toEqual([
      { name: 'Example; Pat', role: 'PIC' },
      { name: 'Sample, Sam', role: 'instructor' },
    ]);
    expect(byLine(9).people).toEqual([
      { name: 'Learner, Lee', role: 'student' },
      { name: 'Watcher, Wes', role: 'observer' },
      { name: 'Extra, Eve', role: 'other' },
    ]);
    expect(byLine(8).people).toEqual([{ name: 'Learner, Lee', role: 'student' }]);
    expect(byLine(7).people).toEqual([
      { name: 'Guest, Gail', role: 'passenger' },
      { name: 'Visitor, Vic', role: 'passenger' },
    ]);
  });

  it('maps PIC, SIC, observer 2 and commander', () => {
    expect(byLine(14).people).toEqual([
      { name: 'Captain, Cap Tain', role: 'PIC' },
      { name: 'Example; Pat', role: 'SIC' },
      { name: 'Watcher, Wes', role: 'observer' },
    ]);
    expect(byLine(18).people.map((p) => p.role)).toEqual(['PIC', 'SIC', 'PIC']);
    const { rec } = one({
      flight_selectedCrewRelief: 'A, A',
      flight_selectedCrewFlightAttendant2: 'B, B',
      flight_selectedCrewObserver: 'C, C',
    });
    expect(rec.people.map((p) => p.role)).toEqual(['other', 'other', 'observer']);
  });
});

describe('importLogTen: remarks', () => {
  it('trims remarks and keeps internal newlines', () => {
    const { rec } = one({ flight_remarks: '  line one\n  line two  ' });
    expect(rec.remarks).toBe('line one\n  line two');
    expect(one({ flight_remarks: '' }).rec.remarks).toBeUndefined();
  });
});

describe('importLogTen: custom columns', () => {
  it('stores unmapped custom columns under their name without flight_', () => {
    expect(byLine(8).custom).toEqual({ customTime3: 78, customTime10: 78 });
    expect(byLine(9).custom).toEqual({ customTime1: 60, customCapacity2: true });
  });

  it('parses each family by type', () => {
    const { res, rec } = one({
      flight_customTime4: '1.50',
      flight_customOp2: '3',
      flight_customLanding1: '2',
      flight_customTakeoff9: '4',
      flight_customCapacity3: '1',
      flight_customNote5: '  some   note ',
      flight_customTime5: '',
    });
    expect(rec.custom).toEqual({
      customTime4: 90,
      customOp2: 3,
      customLanding1: 2,
      customTakeoff9: 4,
      customCapacity3: true,
      customNote5: 'some note',
    });
    expect(res.issues).toEqual([]);
  });

  it('warns on a bad default custom cell and keeps it in raw', () => {
    const { res, rec } = one({ flight_customTime4: 'lots' });
    expect(rec.custom).toEqual({});
    expect(rec.raw['flight_customTime4']).toBe('lots');
    expect(codes(res)).toEqual(['bad-duration']);
  });

  it('ColumnMapping { duration } feeds a built-in duration field', () => {
    const { rec } = one(
      { flight_customTime10: '2.00' },
      { columns: { flight_customTime10: { duration: 'crossCountry50' } } },
    );
    expect(rec.durations).toEqual({ crossCountry50: 120 });
    expect(rec.custom).toEqual({});
  });

  it('ColumnMapping { rule } sets the rule only when the Part flags did not', () => {
    const cols = { columns: { flight_customCapacity1: { rule: '135' as const } } };
    expect(one({ flight_customCapacity1: '1' }, cols).rec.rule).toBe('135');
    expect(one({ flight_customCapacity1: '' }, cols).rec.rule).toBeUndefined();
    expect(one({ flight_customCapacity1: '1', flight_faaPart121: '1' }, cols).rec.rule).toBe('121');
  });

  it('ColumnMapping { custom, type } parses by type', () => {
    const { res, rec } = one(
      {
        flight_customTime1: '0.50',
        flight_customOp1: '7',
        flight_customCapacity1: '1',
        flight_customNote1: ' hi  there ',
      },
      {
        columns: {
          flight_customTime1: { custom: 'ppl', type: 'duration' },
          flight_customOp1: { custom: 'pax', type: 'count' },
          flight_customCapacity1: { custom: 'flag', type: 'toggle' },
          flight_customNote1: { custom: 'note', type: 'text' },
        },
      },
    );
    expect(rec.custom).toEqual({ ppl: 30, pax: 7, flag: true, note: 'hi there' });
    expect(res.issues).toEqual([]);
  });

  it('maps arbitrary non-custom columns named in options', () => {
    const { rec } = one(
      { flight_paxCount: '65', flight_review: '1' },
      { columns: { flight_paxCount: { custom: 'pax', type: 'count' } } },
    );
    expect(rec.custom).toEqual({ pax: 65 });
  });

  it('warns on bad mapped cells without throwing', () => {
    const { res, rec } = one(
      { flight_customTime1: 'x', flight_customOp1: 'y', flight_customCapacity1: 'maybe' },
      {
        columns: {
          flight_customTime1: { duration: 'night' },
          flight_customOp1: { custom: 'a', type: 'count' },
          flight_customCapacity1: { custom: 'b', type: 'toggle' },
        },
      },
    );
    expect(rec.custom).toEqual({});
    expect(codes(res)).toEqual(['bad-duration', 'bad-count', 'bad-toggle']);
  });
});

describe('importLogTen: aircraft', () => {
  it('de-duplicates by normalised tail, first appearance first', () => {
    expect(fixture.aircraft.map((a) => a.tail)).toEqual([
      'N101AB',
      'N102CD',
      'N201PA',
      'SIM-TEST1',
      'N301XY',
      'N302XY',
      'N303XY',
    ]);
    expect(byLine(4).tail).toBe('N102CD');
  });

  it('maps type, engine, class and attribute flags', () => {
    const c172 = fixture.aircraft[0]!;
    expect(c172).toEqual({
      tail: 'N101AB',
      typeCode: 'C-172S',
      make: 'CESSNA AIRCRAFT COMPANY (USA)',
      model: '172S Skyhawk',
      engine: 'piston',
      class: 'ASEL',
      taa: true,
      year: 2004,
      serialNumber: 'SN-0001',
    });
    const jet = fixture.aircraft.find((a) => a.tail === 'N301XY')!;
    expect(jet).toMatchObject({
      engine: 'turbofan',
      class: 'AMEL',
      retractable: true,
      pressurized: true,
    });
    expect(jet.complex).toBeUndefined();
    expect(fixture.aircraft.find((a) => a.tail === 'N201PA')).toMatchObject({
      complex: true,
      retractable: true,
    });
  });

  it('keeps the untouched tail text in tailRaw when normalising changed it', () => {
    expect(fixture.aircraft.find((a) => a.tail === 'N102CD')!.tailRaw).toBe('n102cd ');
    expect(fixture.aircraft[0]!.tailRaw).toBeUndefined();
  });

  it('warns once per conflicting row and keeps the first definition', () => {
    const text = tsv(
      [
        'flight_flightDate',
        'aircraft_aircraftID',
        'aircraftType_type',
        'aircraftType_make',
        'aircraftType_model',
      ],
      ['2024-01-01', 'N1AA', 'C-172S', 'CESSNA', '172S'],
      ['2024-01-02', 'N1AA', 'C-172S', 'CESSNA', '172S'],
      ['2024-01-03', 'n1aa', 'C-182R', 'CESSNA', '182R'],
    );
    const res = importLogTen(text);
    expect(res.aircraft).toHaveLength(1);
    expect(res.aircraft[0]!.typeCode).toBe('C-172S');
    expect(res.issues).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'aircraft-conflict', line: 4 }),
    ]);
  });

  it('warns on unknown engine and class but still imports', () => {
    const { res, rec } = one({
      aircraft_aircraftID: 'N5',
      aircraftType_selectedEngineType: 'Warp',
      aircraftType_selectedAircraftClass: 'Hover',
    });
    expect(rec.tail).toBe('N5');
    expect(res.aircraft[0]!.engine).toBeUndefined();
    expect(res.aircraft[0]!.class).toBeUndefined();
    expect(codes(res)).toEqual(['unknown-engine', 'unknown-class']);
  });

  it('maps the other engine and class names', () => {
    const engines = ['Turbo-prop', 'Turbo-jet', 'Turbo-shaft', 'Electric'];
    expect(
      engines.map(
        (e) =>
          one({ aircraft_aircraftID: 'N6', aircraftType_selectedEngineType: e }).res.aircraft[0]!
            .engine,
      ),
    ).toEqual(['turboprop', 'turbojet', 'turboshaft', 'electric']);
    const classes = ['Single-Engine Sea', 'Multi-Engine Sea', 'Helicopter', 'Gyroplane', 'Glider'];
    expect(
      classes.map(
        (c) =>
          one({ aircraft_aircraftID: 'N6', aircraftType_selectedAircraftClass: c }).res.aircraft[0]!
            .class,
      ),
    ).toEqual(['ASES', 'AMES', 'helicopter', 'gyroplane', 'other']);
  });
});

describe('importLogTen: ragged and hostile input', () => {
  it('imports what aligns from a short row and reports ragged-row', () => {
    const text = tsv(
      ['flight_flightDate', 'flight_from', 'flight_to', 'flight_totalTime'],
      ['2024-01-02', 'KAAA', 'KBBB'],
      ['2024-01-03', 'KCCC', 'KDDD', '1.00'],
    );
    const res = importLogTen(text);
    expect(res.records).toHaveLength(2);
    expect(res.records[0]).toMatchObject({ from: 'KAAA', to: 'KBBB', durations: {} });
    expect(res.issues).toEqual([
      expect.objectContaining({ severity: 'error', code: 'ragged-row', line: 2 }),
    ]);
  });

  it('imports a long row too', () => {
    const text = tsv(['flight_flightDate', 'flight_from'], ['2024-01-02', 'KAAA', 'extra']);
    const res = importLogTen(text);
    expect(res.records[0]!.from).toBe('KAAA');
    expect(codes(res)).toEqual(['ragged-row']);
  });

  it('never throws on junk cell content', () => {
    const cols = [
      'flight_flightDate',
      'flight_from',
      'flight_totalTime',
      'flight_dayLandings',
      'flight_takeoffTime',
      'flight_selectedApproach1',
      'flight_faaPart121',
      'aircraft_aircraftID',
      'aircraft_year',
      'aircraft_complex',
      'flight_pilotFlyingCapacity',
    ];
    const junk = ['??', '\u0000', '1e999', '"', ';;;;', 'NaN', '   ', '-', '99:99'];
    const rows = junk.map((j) => cols.map(() => j));
    expect(() => importLogTen(tsv(cols, ...rows))).not.toThrow();
  });

  it('accepts CRLF line endings and a BOM', () => {
    const text = '﻿flight_flightDate\t flight_from\r\n2024-01-02\tKAAA\r\n';
    const res = importLogTen(text);
    expect(res.records[0]).toMatchObject({ date: '2024-01-02', from: 'KAAA' });
  });
});

describe('importLogTen: raw', () => {
  it('keeps every non-empty cell verbatim and omits empty ones', () => {
    const r = byLine(4);
    expect(r.raw['aircraft_aircraftID']).toBe('n102cd ');
    expect(r.raw['flight_distance']).toBe('1,684.0');
    expect(r.raw['flight_flightNumber']).toBeUndefined();
    expect(r.raw['flight_dayTakeoffs']).toBe('2');
    const first = byLine(2);
    expect(first.raw['flight_selectedCrewPIC']).toBe(' Example; Pat ');
    expect(Object.values(first.raw).every((v) => v !== '')).toBe(true);
  });

  it('leaves unmapped columns only in raw', () => {
    const r = byLine(13);
    expect(r.raw['flight_review']).toBe('1');
    expect(r.custom).toEqual({});
  });
});

describe('importLogTen: real export (opt-in)', () => {
  const path = nodeProcess.env['LOGTEN_REAL_EXPORT'];
  it.skipIf(!path)('imports the real export with no error issues', () => {
    let res: ImportResult | undefined;
    expect(() => {
      res = importLogTen(readText(path!));
    }).not.toThrow();
    expect(res!.records.length).toBeGreaterThan(0);
    expect(res!.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
