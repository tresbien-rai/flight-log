import { describe, expect, it } from 'vitest';
import type { AirportLookup } from '../airports/types';
import type { SourceCounts, SourceRecord } from '../importers';
import { matchRecords } from './match';
import { resolve } from './resolve';
import { expectedNight, suggestTakeoffsLandings, tolCounts } from './suggest';
import type { BulkDecision } from './types';

const airports: AirportLookup = (ident) =>
  ({
    KLAX: { ident: 'KLAX', lat: 33.9425, lon: -118.4081, tz: 'America/Los_Angeles' },
    KSFO: { ident: 'KSFO', lat: 37.619, lon: -122.375, tz: 'America/Los_Angeles' },
  })[ident];

let line = 2;
function rec(
  source: 'logten' | 'foreflight',
  counts: SourceCounts,
  over: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    source,
    line: line++,
    raw: { n: String(line) },
    kind: 'flight',
    date: '2025-06-21',
    tail: 'N1',
    from: 'KLAX',
    to: 'KSFO',
    clock: {},
    durations: { total: 70 },
    counts,
    approaches: [],
    people: [],
    custom: {},
    ...over,
  };
}
// LogTen counts day and night landings of every kind; ForeFlight full stops plus a total.
const lt = (to: [number, number], ldg: [number, number], over: Partial<SourceRecord> = {}) =>
  rec(
    'logten',
    { dayTakeoffs: to[0], nightTakeoffs: to[1], dayLandings: ldg[0], nightLandings: ldg[1] },
    over,
  );
const ff = (to: [number, number], ldg: [number, number], over: Partial<SourceRecord> = {}) =>
  rec(
    'foreflight',
    {
      dayTakeoffs: to[0],
      nightTakeoffs: to[1],
      dayFullStopLandings: ldg[0],
      nightFullStopLandings: ldg[1],
      allLandings: ldg[0] + ldg[1],
    },
    over,
  );

// Sunset on 21 June 2025 is about 03:08Z (Los Angeles) and 03:35Z (San Francisco) on the 22nd.
const DAY = { clock: { off: 18 * 60, on: 19 * 60 + 10 } };
const NIGHT = { date: '2025-06-22', clock: { off: 5 * 60, on: 6 * 60 + 10 } };
const LANDS_AT_NIGHT = { date: '2025-06-21', clock: { off: 23 * 60 + 50, on: 5 * 60 + 10 } };

describe('tolCounts', () => {
  it('reads both apps on one footing', () => {
    expect(tolCounts(lt([2, 0], [4, 1]))).toEqual({
      dayTakeoffs: 2,
      nightTakeoffs: 0,
      dayLandings: 4,
      nightLandings: 1,
      landings: 5,
    });
    const f = rec('foreflight', {
      dayTakeoffs: 3,
      dayFullStopLandings: 1,
      nightFullStopLandings: 1,
      allLandings: 4,
    });
    expect(tolCounts(f)).toEqual({
      dayTakeoffs: 3,
      nightTakeoffs: 0,
      dayLandings: 3,
      nightLandings: 1,
      landings: 4,
      touchAndGoes: 2,
    });
    expect(tolCounts(rec('logten', {})).landings).toBe(0);
  });
});

describe('expectedNight', () => {
  it('judges takeoff at the departure airport and landing at the arrival airport', () => {
    expect(expectedNight(lt([1, 0], [1, 0], DAY), airports)).toEqual({
      takeoff: false,
      landing: false,
    });
    expect(expectedNight(lt([1, 0], [1, 0], NIGHT), airports)).toEqual({
      takeoff: true,
      landing: true,
    });
    // Off before midnight UTC, on after it: the landing is the next UTC day.
    expect(expectedNight(lt([1, 0], [1, 0], LANDS_AT_NIGHT), airports)).toEqual({
      takeoff: false,
      landing: true,
    });
  });

  it('needs times and known airports', () => {
    expect(expectedNight(lt([1, 0], [1, 0]), airports)).toBeUndefined();
    expect(expectedNight(lt([1, 0], [1, 0], { ...DAY, to: 'ZZZZ' }), airports)).toBeUndefined();
    // A local flight lands where it took off.
    expect(expectedNight(lt([1, 0], [1, 0], { ...DAY, to: undefined }), airports)).toEqual({
      takeoff: false,
      landing: false,
    });
  });
});

describe('suggestTakeoffsLandings', () => {
  it('on a pilot-flying leg with times, takes the side that matches day and night', () => {
    const pf = { pilotFlying: true };
    expect(
      suggestTakeoffsLandings(
        lt([1, 0], [0, 1], { ...pf, ...LANDS_AT_NIGHT }),
        ff([1, 0], [1, 0], LANDS_AT_NIGHT),
        airports,
      ),
    ).toEqual({ side: 'a', reason: 'pilot-flying-night' });
    expect(
      suggestTakeoffsLandings(
        lt([0, 1], [0, 1], { ...pf, ...DAY }),
        ff([1, 0], [1, 0], DAY),
        airports,
      ),
    ).toEqual({ side: 'b', reason: 'pilot-flying-day' });
    // Without the airport table it falls back to the counts alone: both balance, so no view.
    expect(
      suggestTakeoffsLandings(lt([0, 1], [0, 1], { ...pf, ...DAY }), ff([1, 0], [1, 0], DAY)),
    ).toBeUndefined();
  });

  it('on a pilot-monitoring leg, takes the side with none', () => {
    expect(
      suggestTakeoffsLandings(lt([0, 0], [0, 0], { pilotFlying: false }), ff([1, 0], [1, 0])),
    ).toEqual({
      side: 'a',
      reason: 'pilot-monitoring',
    });
  });

  it('otherwise takes the only side whose takeoffs and landings add up', () => {
    expect(suggestTakeoffsLandings(lt([2, 0], [5, 0]), ff([5, 0], [5, 0]))).toEqual({
      side: 'b',
      reason: 'balanced',
    });
    expect(suggestTakeoffsLandings(lt([2, 0], [5, 0]), ff([3, 0], [5, 0]))).toBeUndefined();
  });

  it('on a pilot-flying leg without times, takes the only side with any', () => {
    expect(
      suggestTakeoffsLandings(lt([0, 0], [0, 0], { pilotFlying: true }), ff([1, 0], [1, 0])),
    ).toEqual({
      side: 'b',
      reason: 'pilot-flying',
    });
    expect(suggestTakeoffsLandings(lt([2, 0], [2, 0]), ff([1, 0], [1, 0]))).toBeUndefined();
  });
});

describe('in resolve', () => {
  const a = lt([2, 0], [5, 0]);
  const b = ff([5, 0], [5, 0]);
  const match = matchRecords([a], [b]);
  const rule: BulkDecision = {
    kind: 'bulk',
    pattern: 'real',
    field: 'takeoffsLandings',
    choice: 'suggested',
    decidedAt: '2026-01-01T00:00Z',
  };

  it('attaches the suggestion to the takeoffs-and-landings field', () => {
    const f = resolve(match, []).pairs[0]!.fields.find((x) => x.field === 'takeoffsLandings')!;
    expect(f.suggested).toEqual({ side: 'b', reason: 'balanced' });
    expect(f.by).toBe('undecided');
  });

  it('settles it with a "take the suggested one" rule, and leaves undecidable ones open', () => {
    const r = resolve(match, [rule]);
    expect(r.pairs[0]!.fields[0]).toMatchObject({ by: 'bulk', choice: 'b' });
    expect(r.pairs[0]!.record.counts).toMatchObject({ dayTakeoffs: 5, allLandings: 5 });

    const unsure = resolve(matchRecords([lt([2, 0], [5, 0])], [ff([3, 0], [5, 0])]), [rule]);
    expect(unsure.pairs[0]!.fields[0]!.by).toBe('undecided');
    expect(unsure.open.fields).toBe(1);
  });

  it('uses the airport table when given one', () => {
    const x = lt([0, 1], [0, 1], { pilotFlying: true, ...DAY });
    const y = ff([1, 0], [1, 0], DAY);
    const m = matchRecords([x], [y]);
    expect(resolve(m, []).pairs[0]!.fields[0]!.suggested).toBeUndefined();
    expect(resolve(m, [], { airports }).pairs[0]!.fields[0]!.suggested).toEqual({
      side: 'b',
      reason: 'pilot-flying-day',
    });
  });
});
