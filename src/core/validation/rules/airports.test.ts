import { describe, expect, it } from 'vitest';
import { makeAirframe, makeEntry, makeLogbook, makeType, run, runWithAirports } from '../testing';
import { implausibleDuration, missingAirport, unknownAirport, xc50TooShort } from './airports';
import { haversineNm } from './helpers';

describe('haversineNm', () => {
  it('is 60 NM per degree on the equator', () => {
    expect(
      haversineNm(
        { ident: 'A', lat: 0, lon: 0, tz: 'UTC' },
        { ident: 'B', lat: 0, lon: 1, tz: 'UTC' },
      ),
    ).toBeCloseTo(60.04, 1);
  });
  it('is symmetric and zero for the same point', () => {
    const a = { ident: 'A', lat: 33.94, lon: -118.4, tz: 'UTC' };
    const b = { ident: 'B', lat: 40.64, lon: -73.78, tz: 'UTC' };
    expect(haversineNm(a, b)).toBeCloseTo(haversineNm(b, a), 6);
    expect(haversineNm(a, a)).toBe(0);
    expect(haversineNm(a, b)).toBeGreaterThan(2000);
  });
});

describe('implausible-duration', () => {
  it('warns above 16 hours for any flight', () => {
    const f = run(implausibleDuration, makeEntry({ durations: { total: 16 * 60 + 1 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    const jet = { aircraftTypes: [makeType({ engine: 'turbofan' })] };
    expect(run(implausibleDuration, makeEntry({ durations: { total: 16 * 60 } }), jet)).toEqual([]);
    expect(
      run(implausibleDuration, makeEntry({ durations: { total: 16 * 60 + 1 } }), jet),
    ).toHaveLength(1);
  });
  it('warns above 8 hours only for piston types', () => {
    const e = makeEntry({ durations: { total: 8 * 60 + 1 } });
    expect(run(implausibleDuration, e)).toHaveLength(1);
    expect(run(implausibleDuration, makeEntry({ durations: { total: 8 * 60 } }))).toEqual([]);
    const jet = { aircraftTypes: [makeType({ engine: 'turbofan' })] };
    expect(run(implausibleDuration, e, jet)).toEqual([]);
    expect(run(implausibleDuration, e, { airframes: [] })).toEqual([]);
  });
  it('warns when the implied speed is above 600 kt', () => {
    const e = makeEntry({ from: 'KAAA', to: 'KFAR', durations: { total: 30 } });
    const f = runWithAirports(implausibleDuration, e);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('kt');
    // 600 NM in 60 minutes is about 600 kt: right on the edge, so it is allowed to be slightly under
    expect(
      runWithAirports(implausibleDuration, makeEntry({ to: 'KFAR', durations: { total: 62 } })),
    ).toEqual([]);
  });
  it('warns when slower than 40 kt over more than 50 NM', () => {
    const e = makeEntry({ to: 'KBBB', durations: { total: 120 } }); // ~60 NM in 2 h = 30 kt
    const f = runWithAirports(implausibleDuration, e);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('slower');
    expect(
      runWithAirports(implausibleDuration, makeEntry({ to: 'KBBB', durations: { total: 90 } })),
    ).toEqual([]);
  });
  it('does not apply the slow-speed check to short hops', () => {
    expect(
      runWithAirports(implausibleDuration, makeEntry({ to: 'KCCC', durations: { total: 120 } })),
    ).toEqual([]);
  });
  it('is silent without airport data, unresolved airports, same airport, or zero total', () => {
    const e = makeEntry({ to: 'KFAR', durations: { total: 30 } });
    expect(run(implausibleDuration, e)).toEqual([]);
    expect(runWithAirports(implausibleDuration, { ...e, to: 'ZZZZ' })).toEqual([]);
    expect(runWithAirports(implausibleDuration, { ...e, to: 'KAAA' })).toEqual([]);
    expect(runWithAirports(implausibleDuration, { ...e, to: undefined })).toEqual([]);
    expect(
      runWithAirports(implausibleDuration, { ...e, durations: { ...e.durations, total: 0 } }),
    ).toEqual([]);
  });
  it('is silent for simulator entries', () => {
    expect(
      run(implausibleDuration, makeEntry({ kind: 'simulator', durations: { total: 1000 } })),
    ).toEqual([]);
  });
});

describe('xc50-too-short', () => {
  const xc = { crossCountry: 30, crossCountry50: 30 };
  it('warns when the airports are under 50 NM apart', () => {
    const f = runWithAirports(xc50TooShort, makeEntry({ to: 'KCCC', durations: xc }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.message).toContain('30 NM');
  });
  it('is silent when far enough, with no xc50, or with unknown airports', () => {
    expect(runWithAirports(xc50TooShort, makeEntry({ to: 'KBBB', durations: xc }))).toEqual([]);
    expect(runWithAirports(xc50TooShort, makeEntry({ to: 'KCCC' }))).toEqual([]);
    expect(runWithAirports(xc50TooShort, makeEntry({ to: 'ZZZZ', durations: xc }))).toEqual([]);
    expect(run(xc50TooShort, makeEntry({ to: 'KCCC', durations: xc }))).toEqual([]);
  });
  it('is silent for a round trip (from == to) and for a missing `to`', () => {
    expect(runWithAirports(xc50TooShort, makeEntry({ to: 'KAAA', durations: xc }))).toEqual([]);
    expect(runWithAirports(xc50TooShort, makeEntry({ to: undefined, durations: xc }))).toEqual([]);
  });
  it('treats an IATA code and its ICAO ident as the same airport', () => {
    expect(
      runWithAirports(xc50TooShort, makeEntry({ from: 'KAAA', to: 'AAA', durations: xc })),
    ).toEqual([]);
  });
});

describe('unknown-airport', () => {
  it('notes each unknown ident once', () => {
    const f = runWithAirports(unknownAirport, makeEntry({ from: 'ZZZ1', to: 'ZZZ2' }));
    expect(f.map((x) => x.fields)).toEqual([['from'], ['to']]);
    expect(f[0]!.severity).toBe('note');
    expect(f[0]!.message).toContain('ZZZ1');
    expect(runWithAirports(unknownAirport, makeEntry({ from: 'ZZZ1', to: 'ZZZ1' }))).toHaveLength(
      1,
    );
  });
  it('is silent for known airports (any identifier) and absent ones', () => {
    expect(runWithAirports(unknownAirport, makeEntry({ from: 'aaa', to: 'KBBB' }))).toEqual([]);
    expect(runWithAirports(unknownAirport, makeEntry({ from: undefined, to: undefined }))).toEqual(
      [],
    );
  });
  it('is silent when no airport data is loaded', () => {
    expect(run(unknownAirport, makeEntry({ from: 'ZZZ1' }))).toEqual([]);
  });
});

describe('missing-airport', () => {
  it('notes a flight with no from', () => {
    const f = run(missingAirport, makeEntry({ from: undefined }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
  });
  it('is silent with a from (even without a to), and for simulators and ground', () => {
    expect(run(missingAirport, makeEntry({ to: undefined }))).toEqual([]);
    expect(run(missingAirport, makeEntry({ kind: 'simulator', from: undefined }))).toEqual([]);
    expect(run(missingAirport, makeEntry({ kind: 'ground', from: undefined }))).toEqual([]);
  });
});

describe('type lookup used by implausible-duration', () => {
  it('honours typeOverride', () => {
    const e = makeEntry({ typeOverride: 't2', durations: { total: 9 * 60 } });
    const book = { aircraftTypes: [makeType(), makeType({ id: 't2', engine: 'turbofan' })] };
    expect(run(implausibleDuration, e, book)).toEqual([]);
    expect(makeLogbook(book).aircraftTypes).toHaveLength(2);
  });
});

describe('implausible-duration for jets', () => {
  const jet = makeLogbook({
    aircraftTypes: [makeType({ id: 'JET', engine: 'turbofan' })],
    airframes: [makeAirframe({ id: 'a1', configurations: [{ value: 'JET' }] })],
  });
  const airports = (ident: string) =>
    ({
      KAAA: { ident: 'KAAA', lat: 34, lon: -118, tz: 'UTC' },
      KBBB: { ident: 'KBBB', lat: 32, lon: -106, tz: 'UTC' },
    })[ident];

  it('warns when a jet takes far longer than the distance explains', () => {
    const f = run(
      implausibleDuration,
      [makeEntry({ from: 'KAAA', to: 'KBBB', durations: { total: 354 } })],
      jet,
      { airports },
    );
    expect(f.map((x) => x.ruleId)).toEqual(['implausible-duration']);
  });

  it('is silent for a slow but ordinary jet block time', () => {
    // 600 NM in 3.0 h is 200 kt block speed: long taxi or holding, not a typo.
    expect(
      run(
        implausibleDuration,
        [makeEntry({ from: 'KAAA', to: 'KBBB', durations: { total: 180 } })],
        jet,
        { airports },
      ),
    ).toEqual([]);
  });

  it('is silent for a normal jet block time', () => {
    expect(
      run(
        implausibleDuration,
        [makeEntry({ from: 'KAAA', to: 'KBBB', durations: { total: 111 } })],
        jet,
        { airports },
      ),
    ).toEqual([]);
  });
});
