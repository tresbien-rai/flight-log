import { describe, expect, it } from 'vitest';
import type { Airport, AirportLookup } from '../airports/types';
import { toLogbook } from './toLogbook';
import type { ImportResult, SourceAircraft, SourceRecord } from './types';

function rec(over: Partial<SourceRecord> = {}): SourceRecord {
  return {
    source: 'logten',
    line: 2,
    raw: {},
    kind: 'flight',
    date: '2025-06-21',
    clock: {},
    durations: {},
    counts: {},
    approaches: [],
    people: [],
    custom: {},
    ...over,
  };
}

function ac(tail: string, over: Partial<SourceAircraft> = {}): SourceAircraft {
  return { tail, typeCode: 'C172', make: 'Cessna', model: '172S', ...over };
}

function res(
  records: SourceRecord[],
  aircraft: SourceAircraft[] = [],
  source: ImportResult['source'] = 'logten',
): ImportResult {
  return { source, records, aircraft, issues: [] };
}

const airports: AirportLookup = (ident) => {
  const table: Record<string, Partial<Airport>> = {
    KLAX: { ident: 'KLAX', tz: 'America/Los_Angeles' },
    KJFK: { ident: 'KJFK', tz: 'America/New_York' },
    RJTT: { ident: 'RJTT', tz: 'Asia/Tokyo' },
    BAD: { ident: 'BAD', tz: 'Not/AZone' },
  };
  const a = table[ident.toUpperCase()];
  return a ? ({ lat: 0, lon: 0, ...a } as Airport) : undefined;
};

const codes = (notes: { code: string }[]) => notes.map((n) => n.code);

describe('ids and determinism', () => {
  it('builds ids from source, line and tail', () => {
    const r = res(
      [
        rec({ source: 'foreflight', line: 7, tail: 'N1AB' }),
        rec({ source: 'foreflight', line: 8, tail: 'SIM1' }),
      ],
      [ac('N1AB'), ac('SIM1', { deviceLevel: 'FFS' })],
      'foreflight',
    );
    const { logbook } = toLogbook(r);
    expect(logbook.entries.map((e) => e.id)).toEqual(['foreflight:7', 'foreflight:8']);
    expect(logbook.airframes.map((a) => a.id)).toEqual(['af:N1AB']);
    expect(logbook.devices.map((d) => d.id)).toEqual(['dev:SIM1']);
    expect(logbook.aircraftTypes.map((t) => t.id)).toEqual(['C172']);
    expect(logbook.entries[0]!.source).toEqual({ kind: 'import', batchId: 'foreflight' });
    expect(logbook.entries[0]!.createdAt).toBe('1970-01-01T00:00Z');
    expect(logbook.entries[0]!.updatedAt).toBe('1970-01-01T00:00Z');
    expect(logbook.entries[0]!.acknowledged).toEqual([]);
    expect(logbook.entries[0]!.totalSource).toBe('typed');
  });

  it('is deterministic', () => {
    const r = res(
      [
        rec({
          tail: 'N1AB',
          from: 'KLAX',
          clock: { out: 30, in: 100 },
          people: [{ name: 'Example; Pat', role: 'instructor' }],
        }),
      ],
      [ac('N1AB')],
    );
    expect(toLogbook(r, { airports })).toEqual(toLogbook(r, { airports }));
  });

  it('keeps record order and uses unknown for a missing type code', () => {
    const r = res([rec({ line: 9, tail: 'N2' }), rec({ line: 3, tail: 'N2' })], [{ tail: 'N2' }]);
    const { logbook } = toLogbook(r);
    expect(logbook.entries.map((e) => e.id)).toEqual(['logten:9', 'logten:3']);
    expect(logbook.aircraftTypes.map((t) => t.id)).toEqual(['unknown']);
    expect(logbook.airframes[0]!.configurations).toEqual([{ value: 'unknown' }]);
  });
});

describe('aircraft', () => {
  it('builds airframes and types', () => {
    const { logbook, notes } = toLogbook(
      res(
        [],
        [ac('N1AB', { serialNumber: '123', class: 'ASEL', engine: 'piston', retractable: true })],
      ),
    );
    expect(logbook.airframes).toEqual([
      {
        id: 'af:N1AB',
        registrations: [{ value: 'N1AB' }],
        configurations: [{ value: 'C172' }],
        serialNumber: '123',
      },
    ]);
    expect(logbook.aircraftTypes[0]).toMatchObject({
      id: 'C172',
      make: 'Cessna',
      model: '172S',
      category: 'airplane',
      class: 'ASEL',
      engine: 'piston',
      retractable: true,
      complex: false,
      tailwheel: false,
    });
    expect(logbook.aircraftTypes[0]!.icaoDesignator).toBeUndefined();
    expect(codes(notes)).toEqual([]);
  });

  it('assumes class and engine with notes, and empty make/model', () => {
    const { logbook, notes } = toLogbook(res([], [{ tail: 'N1', typeCode: 'X' }]));
    expect(logbook.aircraftTypes[0]).toMatchObject({
      make: '',
      model: '',
      class: 'ASEL',
      engine: 'piston',
    });
    expect(codes(notes)).toEqual(['class-assumed', 'engine-assumed']);
  });

  it('takes first-seen make, model, class and engine', () => {
    const { logbook, notes } = toLogbook(
      res(
        [],
        [
          { tail: 'A', typeCode: 'T' },
          { tail: 'B', typeCode: 'T', make: 'M1', model: 'X', class: 'AMEL', engine: 'turboprop' },
          { tail: 'C', typeCode: 'T', make: 'M2', model: 'Y', class: 'ASEL', engine: 'piston' },
        ],
      ),
    );
    expect(logbook.aircraftTypes).toHaveLength(1);
    expect(logbook.aircraftTypes[0]).toMatchObject({
      make: 'M1',
      model: 'X',
      class: 'AMEL',
      engine: 'turboprop',
    });
    expect(codes(notes)).toEqual([]);
  });

  it('sets a boolean true if any aircraft has it when there is no disagreement', () => {
    const { logbook } = toLogbook(res([], [ac('A', { complex: true }), ac('B')]));
    expect(logbook.aircraftTypes[0]!.complex).toBe(true);
    expect(logbook.airframes.every((f) => f.overrides === undefined)).toBe(true);
  });

  it('uses the majority and puts the minority on the airframe overrides', () => {
    const { logbook } = toLogbook(
      res(
        [],
        [
          ac('A', { taa: true, retractable: false }),
          ac('B', { taa: false, retractable: false }),
          ac('C', { taa: false, retractable: true }),
        ],
      ),
    );
    const t = logbook.aircraftTypes[0]!;
    expect(t.taa).toBe(false);
    expect(t.retractable).toBe(false);
    const byId = Object.fromEntries(logbook.airframes.map((f) => [f.id, f.overrides]));
    expect(byId['af:A']).toEqual({ taa: true });
    expect(byId['af:B']).toBeUndefined();
    expect(byId['af:C']).toEqual({ retractable: true });
  });

  it('does not override tailwheel (unsupported) but still takes the majority', () => {
    const { logbook } = toLogbook(
      res(
        [],
        [ac('A', { tailwheel: true }), ac('B', { tailwheel: true }), ac('C', { tailwheel: false })],
      ),
    );
    expect(logbook.aircraftTypes[0]!.tailwheel).toBe(true);
    expect(logbook.airframes.find((f) => f.id === 'af:C')!.overrides).toBeUndefined();
  });

  it('breaks a tie towards true', () => {
    const { logbook } = toLogbook(
      res([], [ac('A', { pressurized: true }), ac('B', { pressurized: false })]),
    );
    expect(logbook.aircraftTypes[0]!.pressurized).toBe(true);
    expect(logbook.airframes.find((f) => f.id === 'af:B')!.overrides).toEqual({
      pressurized: false,
    });
  });

  it('builds devices, assuming AATD with a note', () => {
    const { logbook, notes } = toLogbook(
      res([], [ac('SIM1', { deviceLevel: 'FFS' }), { tail: 'SIM2', isDevice: true }, ac('N1')]),
    );
    expect(logbook.devices).toEqual([
      { id: 'dev:SIM1', name: 'SIM1', level: 'FFS', represents: 'C172' },
      { id: 'dev:SIM2', name: 'SIM2', level: 'AATD' },
    ]);
    expect(codes(notes).filter((c) => c.startsWith('device'))).toEqual(['device-level-assumed']);
    expect(logbook.airframes.map((f) => f.id)).toEqual(['af:N1']);
  });

  it('does not invent types for devices', () => {
    const { logbook } = toLogbook(
      res([], [ac('SIM1', { deviceLevel: 'FFS', typeCode: 'CRJ-700' })]),
    );
    expect(logbook.aircraftTypes).toEqual([]);
    expect(logbook.devices[0]!.represents).toBe('CRJ-700');
  });
});

describe('entries: basic fields', () => {
  it('copies simple fields and defaults counts to zero', () => {
    const { logbook } = toLogbook(
      res(
        [
          rec({
            tail: 'N1',
            from: 'KLAX',
            route: 'KLAX KSBA',
            flightNumber: '12',
            remarks: 'hi',
            pilotFlying: true,
            rule: '135',
            counts: { dayTakeoffs: 2, holds: 1, goArounds: 3 },
            durations: { total: 90, pic: 90 },
            custom: { a: 1 },
          }),
        ],
        [ac('N1')],
      ),
    );
    const e = logbook.entries[0]!;
    expect(e).toMatchObject({
      kind: 'flight',
      date: '2025-06-21',
      from: 'KLAX',
      route: 'KLAX KSBA',
      flightNumber: '12',
      remarks: 'hi',
      pilotFlying: true,
      rule: '135',
      airframeId: 'af:N1',
      dayTakeoffs: 2,
      nightTakeoffs: 0,
      holds: 1,
      goArounds: 3,
      custom: { a: 1 },
    });
    expect(e.to).toBeUndefined();
    expect(e.deviceId).toBeUndefined();
    expect(e.durations.total).toBe(90);
    expect(e.durations.sic).toBe(0);
    expect(Object.keys(e.durations)).toHaveLength(13);
  });

  it('corrects a flight in a device to a simulator', () => {
    const { logbook, notes } = toLogbook(
      res([rec({ tail: 'SIM1' })], [ac('SIM1', { deviceLevel: 'FTD' })]),
    );
    const e = logbook.entries[0]!;
    expect(e.kind).toBe('simulator');
    expect(e.deviceId).toBe('dev:SIM1');
    expect(e.airframeId).toBeUndefined();
    expect(notes).toContainEqual(
      expect.objectContaining({ code: 'kind-corrected', line: 2, entryId: 'logten:2' }),
    );
  });

  it('leaves simulator and ground entries alone and handles a missing tail', () => {
    const { logbook, notes } = toLogbook(
      res(
        [rec({ line: 2, kind: 'simulator', tail: 'SIM1' }), rec({ line: 3, kind: 'ground' })],
        [ac('SIM1', { deviceLevel: 'FFS' })],
      ),
    );
    expect(logbook.entries.map((e) => e.kind)).toEqual(['simulator', 'ground']);
    expect(logbook.entries[1]!.airframeId).toBeUndefined();
    expect(codes(notes)).not.toContain('kind-corrected');
  });

  it('notes a tail missing from the aircraft list', () => {
    const { logbook, notes } = toLogbook(res([rec({ tail: 'N9' })], []));
    expect(logbook.entries[0]!.airframeId).toBeUndefined();
    expect(codes(notes)).toContain('unknown-aircraft');
  });

  it('converts a bad date with a note', () => {
    const { logbook, notes } = toLogbook(
      res([rec({ date: '', rule: '91', clock: { out: 10, in: 20 }, from: 'KLAX' })]),
      { airports },
    );
    expect(logbook.entries[0]!.date).toBe('');
    expect(logbook.entries[0]!.out).toBeUndefined();
    expect(codes(notes)).toEqual(['bad-date']);
    const bad = toLogbook(res([rec({ date: '2025-02-30', rule: '91' })]));
    expect(codes(bad.notes)).toEqual(['bad-date']);
  });
});

describe('rule', () => {
  it('defaults to 91 with a single note carrying the count', () => {
    const { logbook, notes } = toLogbook(
      res([rec({ line: 2 }), rec({ line: 3, rule: '121' }), rec({ line: 4 }), rec({ line: 5 })]),
    );
    expect(logbook.entries.map((e) => e.rule)).toEqual(['91', '121', '91', '91']);
    const n = notes.filter((x) => x.code === 'rule-assumed');
    expect(n).toHaveLength(1);
    expect(n[0]!.message).toContain('3');
    expect(n[0]!.line).toBeUndefined();
  });

  it('adds no note when every rule is stated', () => {
    const { notes } = toLogbook(res([rec({ rule: '91' })]));
    expect(codes(notes)).toEqual([]);
  });
});

describe('seat', () => {
  const seatOf = (durations: SourceRecord['durations']) =>
    toLogbook(res([rec({ durations })])).logbook.entries[0]!.seat;

  it('infers SIC, PIC or nothing', () => {
    expect(seatOf({ sic: 60 })).toBe('SIC');
    expect(seatOf({ pic: 60 })).toBe('PIC');
    expect(seatOf({ pic: 30, sic: 30 })).toBeUndefined();
    expect(seatOf({})).toBeUndefined();
    expect(seatOf({ pic: 0, sic: 0 })).toBeUndefined();
  });
});

describe('clock times', () => {
  it('resolves a Los Angeles evening departure across UTC midnight', () => {
    const { logbook, notes } = toLogbook(
      res([
        rec({ from: 'KLAX', to: 'KJFK', clock: { out: 30, off: 45, on: 5 * 60, in: 5 * 60 + 10 } }),
      ]),
      { airports, dateBasis: 'local' },
    );
    const e = logbook.entries[0]!;
    expect(e.out).toBe('2025-06-22T00:30Z');
    expect(e.off).toBe('2025-06-22T00:45Z');
    expect(e.on).toBe('2025-06-22T05:00Z');
    expect(e.in).toBe('2025-06-22T05:10Z');
    expect(codes(notes)).not.toContain('no-timezone');
  });

  it('chains an arrival after midnight UTC', () => {
    const { logbook } = toLogbook(
      res([rec({ from: 'KLAX', clock: { out: 23 * 60 + 30, off: 23 * 60 + 45, on: 60, in: 70 } })]),
      { airports, dateBasis: 'local' },
    );
    const e = logbook.entries[0]!;
    expect(e.out).toBe('2025-06-21T23:30Z');
    expect(e.off).toBe('2025-06-21T23:45Z');
    expect(e.on).toBe('2025-06-22T01:00Z');
    expect(e.in).toBe('2025-06-22T01:10Z');
  });

  it('uses the departure zone east of UTC', () => {
    const { logbook } = toLogbook(res([rec({ from: 'RJTT', clock: { out: 21 * 60 } })]), {
      airports,
      dateBasis: 'local',
    });
    expect(logbook.entries[0]!.out).toBe('2025-06-20T21:00Z');
  });

  it('anchors the first present time when out is missing', () => {
    const { logbook } = toLogbook(res([rec({ from: 'KLAX', clock: { off: 45, in: 3 * 60 } })]), {
      airports,
      dateBasis: 'local',
    });
    const e = logbook.entries[0]!;
    expect(e.out).toBeUndefined();
    expect(e.off).toBe('2025-06-22T00:45Z');
    expect(e.on).toBeUndefined();
    expect(e.in).toBe('2025-06-22T03:00Z');
  });

  it('resolves scheduled times', () => {
    const { logbook } = toLogbook(
      res([
        rec({
          from: 'KLAX',
          clock: { out: 40, scheduledOut: 30, scheduledIn: 20 },
        }),
        rec({ line: 3, from: 'KLAX', clock: { out: 40, scheduledIn: 120 } }),
        rec({ line: 4, from: 'KLAX', clock: { scheduledIn: 120 } }),
      ]),
      { airports, dateBasis: 'local' },
    );
    const [a, b, c] = logbook.entries;
    expect(a!.scheduledOut).toBe('2025-06-22T00:30Z');
    expect(a!.scheduledIn).toBe('2025-06-23T00:20Z');
    expect(b!.scheduledIn).toBe('2025-06-22T02:00Z');
    expect(c!.scheduledIn).toBe('2025-06-22T02:00Z');
  });

  it('falls back to the logged date as the UTC date without an airports option', () => {
    const { logbook, notes } = toLogbook(
      res([
        rec({ line: 2, from: 'KLAX', clock: { out: 30, in: 100 } }),
        rec({ line: 3, from: 'KLAX', clock: { out: 30 } }),
        rec({ line: 4, from: 'KJFK', clock: { out: 30 } }),
      ]),
    );
    expect(logbook.entries[0]!.out).toBe('2025-06-21T00:30Z');
    expect(logbook.entries[0]!.in).toBe('2025-06-21T01:40Z');
    const nz = notes.filter((n) => n.code === 'no-timezone');
    expect(nz).toHaveLength(2); // once per ident
    expect(nz[0]!.line).toBe(2);
  });

  it('notes a missing departure airport once, and bad zones count as unresolvable', () => {
    const { logbook, notes } = toLogbook(
      res([
        rec({ line: 2, clock: { out: 30 } }),
        rec({ line: 3, clock: { out: 30 } }),
        rec({ line: 4, from: 'BAD', clock: { out: 30 } }),
        rec({ line: 5, from: 'ZZZZ', clock: { out: 30 } }),
      ]),
      { airports },
    );
    expect(logbook.entries.map((e) => e.out)).toEqual(Array(4).fill('2025-06-21T00:30Z'));
    expect(notes.filter((n) => n.code === 'no-timezone')).toHaveLength(3);
  });

  it('does not note a time zone for records without clock times', () => {
    const { notes } = toLogbook(res([rec({ from: 'KLAX' })]));
    expect(codes(notes)).toEqual(['rule-assumed']);
  });
});

describe('landings', () => {
  const landingsOf = (counts: SourceRecord['counts']) => {
    const { logbook, notes } = toLogbook(res([rec({ counts, rule: '91' })]));
    return { l: logbook.entries[0]!.landings, codes: codes(notes) };
  };

  it('(a) ForeFlight style: full-stop split known, remainder are touch-and-goes by day', () => {
    expect(
      landingsOf({ dayFullStopLandings: 2, nightFullStopLandings: 1, allLandings: 6 }),
    ).toEqual({
      l: { dayFullStop: 2, nightFullStop: 1, dayTouchAndGo: 3, nightTouchAndGo: 0 },
      codes: ['touch-and-go-split-assumed'],
    });
  });

  it('(a) has no touch-and-goes when all landings equal the full stops or are absent', () => {
    expect(
      landingsOf({ dayFullStopLandings: 2, nightFullStopLandings: 1, allLandings: 3 }),
    ).toEqual({
      l: { dayFullStop: 2, nightFullStop: 1, dayTouchAndGo: 0, nightTouchAndGo: 0 },
      codes: [],
    });
    expect(landingsOf({ dayFullStopLandings: 2 })).toEqual({
      l: { dayFullStop: 2, nightFullStop: 0, dayTouchAndGo: 0, nightTouchAndGo: 0 },
      codes: [],
    });
    // All landings below the full stops never goes negative.
    expect(landingsOf({ dayFullStopLandings: 2, allLandings: 1 }).l.dayTouchAndGo).toBe(0);
  });

  it('(a) wins over day/night landings when both are present', () => {
    expect(
      landingsOf({ dayFullStopLandings: 1, dayLandings: 5, nightLandings: 5, allLandings: 1 }).l,
    ).toEqual({ dayFullStop: 1, nightFullStop: 0, dayTouchAndGo: 0, nightTouchAndGo: 0 });
  });

  it('(b) LogTen style without touch-and-goes: all full-stop', () => {
    expect(landingsOf({ dayLandings: 3, nightLandings: 2 })).toEqual({
      l: { dayFullStop: 3, nightFullStop: 2, dayTouchAndGo: 0, nightTouchAndGo: 0 },
      codes: [],
    });
    expect(landingsOf({ dayLandings: 3, touchAndGoes: 0 }).l.dayFullStop).toBe(3);
  });

  it('(b) day only: touch-and-goes are day, no note', () => {
    expect(landingsOf({ dayLandings: 5, nightLandings: 0, touchAndGoes: 3 })).toEqual({
      l: { dayFullStop: 2, nightFullStop: 0, dayTouchAndGo: 3, nightTouchAndGo: 0 },
      codes: [],
    });
    expect(landingsOf({ dayLandings: 5, touchAndGoes: 3 }).codes).toEqual([]);
  });

  it('(b) night only: touch-and-goes are night, no note', () => {
    expect(landingsOf({ nightLandings: 4, touchAndGoes: 3 })).toEqual({
      l: { dayFullStop: 0, nightFullStop: 1, dayTouchAndGo: 0, nightTouchAndGo: 3 },
      codes: [],
    });
  });

  it('(b) both day and night: day first, remainder to night, with a note', () => {
    expect(landingsOf({ dayLandings: 2, nightLandings: 3, touchAndGoes: 4 })).toEqual({
      l: { dayFullStop: 0, nightFullStop: 1, dayTouchAndGo: 2, nightTouchAndGo: 2 },
      codes: ['touch-and-go-split-assumed'],
    });
    expect(landingsOf({ dayLandings: 4, nightLandings: 3, touchAndGoes: 1 })).toEqual({
      l: { dayFullStop: 3, nightFullStop: 3, dayTouchAndGo: 1, nightTouchAndGo: 0 },
      codes: ['touch-and-go-split-assumed'],
    });
  });

  it('(b) caps night touch-and-goes at night landings', () => {
    expect(landingsOf({ dayLandings: 1, nightLandings: 1, touchAndGoes: 9 }).l).toEqual({
      dayFullStop: 0,
      nightFullStop: 0,
      dayTouchAndGo: 1,
      nightTouchAndGo: 1,
    });
  });

  it('(b) flags a full-stop count that disagrees', () => {
    expect(
      landingsOf({ dayLandings: 5, nightLandings: 0, touchAndGoes: 3, fullStopLandings: 2 }).codes,
    ).toEqual([]);
    expect(
      landingsOf({ dayLandings: 5, nightLandings: 0, touchAndGoes: 3, fullStopLandings: 4 }).codes,
    ).toEqual(['landing-counts-inconsistent']);
    expect(landingsOf({ dayLandings: 3, fullStopLandings: 1 }).codes).toEqual([
      'landing-counts-inconsistent',
    ]);
  });

  it('(c) no landing information gives zeros', () => {
    expect(landingsOf({})).toEqual({
      l: { dayFullStop: 0, nightFullStop: 0, dayTouchAndGo: 0, nightTouchAndGo: 0 },
      codes: [],
    });
    expect(landingsOf({ allLandings: 4, fullStopLandings: 2, touchAndGoes: 2 }).l).toEqual({
      dayFullStop: 0,
      nightFullStop: 0,
      dayTouchAndGo: 0,
      nightTouchAndGo: 0,
    });
  });

  it('attaches entry id and line to landing notes', () => {
    const { notes } = toLogbook(
      res([
        rec({
          line: 11,
          rule: '91',
          counts: { dayLandings: 2, nightLandings: 2, touchAndGoes: 1 },
        }),
      ]),
    );
    expect(notes).toEqual([
      expect.objectContaining({
        code: 'touch-and-go-split-assumed',
        line: 11,
        entryId: 'logten:11',
      }),
    ]);
  });
});

describe('crew and people', () => {
  it('merges name spellings and de-duplicates crew', () => {
    const { logbook } = toLogbook(
      res([
        rec({
          line: 2,
          people: [
            { name: 'Example; Pat', role: 'instructor' },
            { name: 'Pat Example', role: 'instructor' },
            { name: 'Example, Pat', role: 'student' },
            { name: 'Sam  Q. Sample', role: 'passenger' },
          ],
        }),
        rec({ line: 3, people: [{ name: 'pat example', role: 'instructor' }] }),
      ]),
    );
    expect(logbook.people).toEqual([
      { id: 'p:pat example', name: 'Example; Pat' },
      { id: 'p:sam q sample', name: 'Sam  Q. Sample' },
    ]);
    expect(logbook.entries[0]!.crew).toEqual([
      { personId: 'p:pat example', role: 'instructor' },
      { personId: 'p:pat example', role: 'student' },
      { personId: 'p:sam q sample', role: 'passenger' },
    ]);
    expect(logbook.entries[1]!.crew).toEqual([{ personId: 'p:pat example', role: 'instructor' }]);
  });
});

describe('isolation from the input', () => {
  it('does not alias approaches, custom, durations or crew', () => {
    const input = res(
      [
        rec({
          approaches: [{ type: 'ILS', runway: '24R' }],
          custom: { x: 1 },
          durations: { total: 60 },
          people: [{ name: 'Pat Example', role: 'PIC' }],
        }),
      ],
      [ac('N1')],
    );
    const snapshot = structuredClone(input);
    const { logbook } = toLogbook(input);
    const e = logbook.entries[0]!;
    e.approaches[0]!.runway = '06';
    e.approaches.push({ type: 'VOR' });
    e.custom['x'] = 99;
    e.durations.total = 1;
    e.crew.push({ personId: 'x', role: 'other' });
    logbook.airframes[0]!.registrations.push({ value: 'Z' });
    expect(input).toEqual(snapshot);
  });
});

describe('clock times with a UTC-dated source (the default)', () => {
  it('takes the logged date as the UTC date and derives the local date', () => {
    const { logbook } = toLogbook(res([rec({ from: 'KLAX', clock: { out: 30, in: 5 * 60 } })]), {
      airports,
    });
    const e = logbook.entries[0]!;
    expect(e.out).toBe('2025-06-21T00:30Z');
    expect(e.in).toBe('2025-06-21T05:00Z');
    // 00:30Z on the 21st is the evening of the 20th in Los Angeles.
    expect(e.date).toBe('2025-06-20');
  });

  it('keeps the logged date when the airport is unknown', () => {
    const { logbook } = toLogbook(res([rec({ from: 'ZZZZ', clock: { out: 30 } })]), { airports });
    expect(logbook.entries[0]!.date).toBe('2025-06-21');
  });

  it('does not let one out-of-order time push later times a day ahead', () => {
    // Off is typed before out; on and in are still placed relative to out.
    const { logbook } = toLogbook(
      res([rec({ from: 'KLAX', clock: { out: 74, off: 10 * 60 + 31, on: 204, in: 206 } })]),
      { airports },
    );
    const e = logbook.entries[0]!;
    expect(e.out).toBe('2025-06-21T01:14Z');
    expect(e.off).toBe('2025-06-21T10:31Z');
    expect(e.on).toBe('2025-06-21T03:24Z');
    expect(e.in).toBe('2025-06-21T03:26Z');
  });

  it('places a time just before out on the same day, not a day later', () => {
    const { logbook } = toLogbook(
      res([rec({ from: 'KLAX', clock: { out: 16 * 60 + 47, off: 15 * 60 + 38 } })]),
      { airports },
    );
    expect(logbook.entries[0]!.off).toBe('2025-06-21T15:38Z');
  });

  it('still rolls an arrival past midnight', () => {
    const { logbook } = toLogbook(
      res([rec({ from: 'KLAX', clock: { out: 23 * 60 + 30, in: 70 } })]),
      { airports },
    );
    expect(logbook.entries[0]!.in).toBe('2025-06-22T01:10Z');
  });
});
