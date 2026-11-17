import { describe, expect, it } from 'vitest';
import type { SourceRecord } from '../importers';
import { diffPair, diffRecords } from './diff';
import type { FieldDiff } from './types';

function rec(over: Partial<SourceRecord> = {}): SourceRecord {
  return {
    source: 'logten',
    line: 2,
    raw: {},
    kind: 'flight',
    date: '2025-06-22',
    tail: 'N12345',
    from: 'KLAX',
    to: 'KMRY',
    clock: {},
    durations: {},
    counts: {},
    approaches: [],
    people: [],
    custom: {},
    ...over,
  };
}

/** Diff of one varied field, as the single resulting entry (or undefined). */
function one(a: Partial<SourceRecord>, b: Partial<SourceRecord>): FieldDiff | undefined {
  const d = diffRecords(rec(a), rec(b));
  expect(d.length).toBeLessThanOrEqual(1);
  return d[0];
}

/** Only the nightLandings diff (other derived landing fields may differ too). */
function night(a: Partial<SourceRecord>, b: Partial<SourceRecord>): FieldDiff | undefined {
  return diffRecords(rec(a), rec(b)).find((d) => d.field === 'counts.nightLandings');
}

const dur = (total?: number) => ({ durations: total === undefined ? {} : { total } });

describe('diffRecords: identity and strings', () => {
  it('returns an empty list for identical records', () => {
    expect(diffRecords(rec(), rec())).toEqual([]);
    expect(diffPair({ a: rec(), b: rec(), tier: 'exact' }).diffs).toEqual([]);
  });

  it('diffPair wraps diffRecords and keeps the pair', () => {
    const pair = { a: rec(), b: rec({ tail: 'N999' }), tier: 'tail-differs' as const };
    const r = diffPair(pair);
    expect(r.pair).toBe(pair);
    expect(r.diffs).toEqual(diffRecords(pair.a, pair.b));
  });

  it('classifies differing strings as real', () => {
    expect(one({}, { tail: 'N999' })).toEqual({
      field: 'tail',
      a: 'N12345',
      b: 'N999',
      class: 'real',
    });
    expect(one({}, { date: '2025-06-23' })?.class).toBe('real');
    expect(one({}, { kind: 'simulator' })?.class).toBe('real');
    expect(one({}, { from: 'KSFO' })?.class).toBe('real');
    expect(one({}, { to: 'KSFO' })?.class).toBe('real');
  });

  it('blank vs value is systematic with the side that lacks it', () => {
    expect(one({ tail: undefined }, {})).toMatchObject({
      field: 'tail',
      class: 'systematic',
      pattern: 'missing-a',
    });
    expect(one({}, { from: undefined })).toMatchObject({
      field: 'from',
      class: 'systematic',
      pattern: 'missing-b',
    });
  });

  it('blank vs empty string is equivalent', () => {
    expect(one({ tail: undefined }, { tail: '' })?.class).toBe('equivalent');
  });

  it('localFlight: blank vs false equivalent, blank vs true systematic, true vs false real', () => {
    expect(one({ localFlight: undefined }, { localFlight: false })?.class).toBe('equivalent');
    expect(one({ localFlight: undefined }, { localFlight: true })).toMatchObject({
      class: 'systematic',
      pattern: 'missing-a',
    });
    expect(one({ localFlight: true }, { localFlight: false })?.class).toBe('real');
  });

  it('route ignores whitespace and case', () => {
    expect(one({ route: 'KLAX  SADDE  KMRY' }, { route: 'klax saddE kmry' })?.class).toBe(
      'equivalent',
    );
    expect(one({ route: 'KLAX SADDE' }, { route: 'KLAX SADDE' })).toBeUndefined();
    expect(one({ route: 'KLAX SADDE' }, { route: 'KLAX OTHER' })?.class).toBe('real');
    expect(one({ route: 'KLAX' }, {})).toMatchObject({ pattern: 'missing-b' });
  });

  it('flightNumber ignores all whitespace and case', () => {
    expect(one({ flightNumber: 'AA 1234' }, { flightNumber: 'aa1234' })?.class).toBe('equivalent');
    expect(one({ flightNumber: 'AA 1234' }, { flightNumber: 'AA 1235' })?.class).toBe('real');
    expect(one({}, { flightNumber: 'AA1' })).toMatchObject({ pattern: 'missing-a' });
  });
});

describe('diffRecords: clock', () => {
  it('reports HH:MM and classifies differences as real', () => {
    expect(one({ clock: { out: 61 } }, { clock: { out: 1439 } })).toEqual({
      field: 'clock.out',
      a: '01:01',
      b: '23:59',
      class: 'real',
    });
  });

  it('blank vs value is systematic; blank vs 00:00 is equivalent', () => {
    expect(one({ clock: { in: 600 } }, { clock: {} })).toEqual({
      field: 'clock.in',
      a: '10:00',
      b: undefined,
      class: 'systematic',
      pattern: 'missing-b',
    });
    expect(one({ clock: {} }, { clock: { off: 0 } })).toMatchObject({
      a: undefined,
      b: '00:00',
      class: 'equivalent',
    });
  });

  it('covers all six clock fields in order', () => {
    const c = { out: 1, off: 2, on: 3, in: 4, scheduledOut: 5, scheduledIn: 6 };
    const d = diffRecords(rec({ clock: c }), rec({ clock: {} }));
    expect(d.map((x) => x.field)).toEqual([
      'clock.out',
      'clock.off',
      'clock.on',
      'clock.in',
      'clock.scheduledOut',
      'clock.scheduledIn',
    ]);
  });
});

describe('diffRecords: durations', () => {
  it('reports minutes as numbers', () => {
    expect(one(dur(72), dur(72))).toBeUndefined();
  });

  it('rounding at 2 minutes (either direction)', () => {
    expect(one(dur(62), dur(60))).toEqual({
      field: 'durations.total',
      a: 62,
      b: 60,
      class: 'systematic',
      pattern: 'rounding',
    });
    expect(one(dur(60), dur(58))?.pattern).toBe('rounding');
  });

  it('rounding at exactly 3 minutes in both directions', () => {
    expect(one(dur(63), dur(60))?.pattern).toBe('rounding');
    expect(one(dur(57), dur(60))?.pattern).toBe('rounding');
    expect(one(dur(60), dur(63))?.pattern).toBe('rounding');
  });

  it('4 minutes apart is real', () => {
    expect(one(dur(64), dur(60))).toMatchObject({ class: 'real' });
    expect(one(dur(64), dur(60))?.pattern).toBeUndefined();
    expect(one(dur(56), dur(60))?.class).toBe('real');
  });

  it('is real when neither side is a multiple of 6', () => {
    expect(one(dur(61), dur(62))?.class).toBe('real');
    expect(one(dur(70), dur(71))?.class).toBe('real');
  });

  it('is real when both are tenths but differ', () => {
    expect(one(dur(60), dur(66))?.class).toBe('real');
  });

  it('blank vs 0 is equivalent, blank vs value is systematic', () => {
    expect(one(dur(undefined), dur(0))?.class).toBe('equivalent');
    expect(one(dur(0), dur(undefined))?.class).toBe('equivalent');
    expect(one(dur(undefined), dur(30))).toMatchObject({
      class: 'systematic',
      pattern: 'missing-a',
      a: undefined,
      b: 30,
    });
    expect(one(dur(30), dur(undefined))?.pattern).toBe('missing-b');
  });

  it('follows DURATION_FIELDS order', () => {
    const d = diffRecords(
      rec({ durations: { groundTraining: 600, pic: 1, total: 2 } }),
      rec({ durations: {} }),
    );
    expect(d.map((x) => x.field)).toEqual([
      'durations.total',
      'durations.pic',
      'durations.groundTraining',
    ]);
  });
});

describe('diffRecords: counts', () => {
  it('direct counts: blank vs 0 equivalent, blank vs value real, differing real', () => {
    for (const f of ['dayTakeoffs', 'nightTakeoffs', 'holds', 'goArounds'] as const) {
      expect(one({ counts: {} }, { counts: { [f]: 0 } })).toMatchObject({
        field: `counts.${f}`,
        class: 'equivalent',
      });
      const missing = one({ counts: {} }, { counts: { [f]: 2 } });
      expect(missing).toMatchObject({ class: 'real', a: undefined, b: 2 });
      expect(missing?.pattern).toBeUndefined();
      expect(one({ counts: { [f]: 1 } }, { counts: { [f]: 2 } })?.class).toBe('real');
      expect(one({ counts: { [f]: 1 } }, { counts: { [f]: 1 } })).toBeUndefined();
    }
  });

  describe('allLandings', () => {
    it('uses allLandings when present, else day + night', () => {
      expect(
        one({ counts: { allLandings: 3 } }, { counts: { dayLandings: 2, nightLandings: 1 } }),
      ).toBeUndefined();
      expect(
        one({ counts: { allLandings: 3 } }, { counts: { dayLandings: 2, nightLandings: 2 } }),
      ).toMatchObject({ field: 'counts.allLandings', a: 3, b: 4, class: 'real' });
    });
    it('a single present part is enough', () => {
      expect(one({ counts: { allLandings: 2 } }, { counts: { dayLandings: 2 } })).toBeUndefined();
    });
    it('skips when a side cannot supply it', () => {
      expect(one({ counts: { allLandings: 3 } }, { counts: {} })).toBeUndefined();
      expect(
        one({ counts: { allLandings: 3 } }, { counts: { fullStopLandings: 1 } }),
      ).toBeUndefined();
    });
    it('0 vs 0 and zero totals are equal', () => {
      expect(one({ counts: { allLandings: 0 } }, { counts: { dayLandings: 0 } })).toBeUndefined();
    });
  });

  describe('fullStopLandings', () => {
    it('uses fullStopLandings, else day + night full stops', () => {
      expect(
        one(
          { counts: { fullStopLandings: 3 } },
          { counts: { dayFullStopLandings: 1, nightFullStopLandings: 2 } },
        ),
      ).toBeUndefined();
      expect(
        one(
          { counts: { fullStopLandings: 3 } },
          { counts: { dayFullStopLandings: 1, nightFullStopLandings: 1 } },
        ),
      ).toMatchObject({ field: 'counts.fullStopLandings', class: 'real' });
    });
    it('skips when either side cannot supply it', () => {
      expect(
        one({ counts: { fullStopLandings: 3 } }, { counts: { dayLandings: 3 } }),
      ).toBeUndefined();
      expect(one({ counts: {} }, { counts: {} })).toBeUndefined();
    });
  });

  describe('nightLandings', () => {
    it('both nightLandings: compared', () => {
      expect(
        night({ counts: { nightLandings: 1 } }, { counts: { nightLandings: 2 } }),
      ).toMatchObject({
        field: 'counts.nightLandings',
        class: 'real',
      });
      expect(
        night({ counts: { nightLandings: 1 } }, { counts: { nightLandings: 1 } }),
      ).toBeUndefined();
    });
    it('both nightFullStopLandings: compared', () => {
      expect(
        night({ counts: { nightFullStopLandings: 0 } }, { counts: { nightFullStopLandings: 1 } })
          ?.class,
      ).toBe('real');
    });
    it('prefers nightLandings over full-stop when both sides have both', () => {
      const d = diffRecords(
        rec({ counts: { nightLandings: 2, nightFullStopLandings: 1 } }),
        rec({ counts: { nightLandings: 2, nightFullStopLandings: 2 } }),
      );
      expect(d.filter((x) => x.field === 'counts.nightLandings')).toEqual([]);
    });
    it('mixed: compared when the nightLandings side has no touch-and-goes', () => {
      expect(
        night({ counts: { nightLandings: 2 } }, { counts: { nightFullStopLandings: 1 } }),
      ).toMatchObject({ field: 'counts.nightLandings', a: 2, b: 1, class: 'real' });
      expect(
        night(
          { counts: { nightLandings: 2, touchAndGoes: 0 } },
          { counts: { nightFullStopLandings: 2 } },
        ),
      ).toBeUndefined();
      // And the other way round.
      expect(
        night({ counts: { nightFullStopLandings: 1 } }, { counts: { nightLandings: 2 } }),
      ).toMatchObject({ a: 1, b: 2 });
    });
    it('mixed: skipped when the nightLandings side has touch-and-goes', () => {
      expect(
        night(
          { counts: { nightLandings: 2, touchAndGoes: 1 } },
          { counts: { nightFullStopLandings: 1 } },
        ),
      ).toBeUndefined();
      expect(
        night(
          { counts: { nightFullStopLandings: 1 } },
          { counts: { nightLandings: 2, touchAndGoes: 3 } },
        ),
      ).toBeUndefined();
    });
    it('skipped when no like-for-like number exists', () => {
      expect(night({ counts: { nightLandings: 2 } }, { counts: {} })).toBeUndefined();
      expect(night({ counts: {} }, { counts: { nightFullStopLandings: 2 } })).toBeUndefined();
    });
    it('blank vs 0 cannot occur after skip; 0 vs 1 is real', () => {
      expect(night({ counts: { nightLandings: 0 } }, { counts: { nightLandings: 1 } })?.class).toBe(
        'real',
      );
    });
  });

  it('orders counts: takeoffs, holds, go-arounds, then landings', () => {
    const d = diffRecords(
      rec({
        counts: {
          goArounds: 1,
          holds: 1,
          nightTakeoffs: 1,
          dayTakeoffs: 1,
          allLandings: 1,
          fullStopLandings: 1,
          nightLandings: 1,
        },
      }),
      rec({
        counts: {
          goArounds: 2,
          holds: 2,
          nightTakeoffs: 2,
          dayTakeoffs: 2,
          allLandings: 2,
          fullStopLandings: 2,
          nightLandings: 2,
        },
      }),
    );
    expect(d.map((x) => x.field)).toEqual([
      'counts.dayTakeoffs',
      'counts.nightTakeoffs',
      'counts.holds',
      'counts.goArounds',
      'counts.allLandings',
      'counts.fullStopLandings',
      'counts.nightLandings',
    ]);
  });
});

describe('diffRecords: approaches', () => {
  const ils = { type: 'ILS', runway: '24R', airport: 'KLAX' } as const;
  const rnav = { type: 'RNAV-GPS', runway: '28L', airport: 'KMRY' } as const;

  it('same multiset in any order, ignoring unkeyed attributes, is no diff', () => {
    expect(
      one(
        { approaches: [ils, rnav] },
        {
          approaches: [
            { ...rnav, missed: true, note: 'x' },
            { ...ils, circleToLand: true },
          ],
        },
      ),
    ).toBeUndefined();
  });

  it('is a multiset, not a set', () => {
    expect(one({ approaches: [ils, ils] }, { approaches: [ils] })?.class).toBe('real');
    expect(one({ approaches: [ils, ils] }, { approaches: [ils, rnav] })?.class).toBe('real');
  });

  it('reports a compact sorted string, undefined when empty', () => {
    expect(one({ approaches: [rnav, ils] }, { approaches: [] })).toEqual({
      field: 'approaches',
      a: 'ILS 24R KLAX, RNAV-GPS 28L KMRY',
      b: undefined,
      class: 'real',
    });
  });

  it('omits blank parts in the string', () => {
    expect(one({ approaches: [{ type: 'VOR' }] }, { approaches: [] })?.a).toBe('VOR');
    expect(one({ approaches: [{ type: 'VOR', airport: 'KSBA' }] }, { approaches: [] })?.a).toBe(
      'VOR KSBA',
    );
  });

  it('a blank runway on one side is equivalent', () => {
    expect(
      one({ approaches: [{ type: 'ILS', airport: 'KLAX' }] }, { approaches: [ils] }),
    ).toMatchObject({ class: 'equivalent' });
    expect(
      one({ approaches: [ils, rnav] }, { approaches: [ils, { ...rnav, runway: undefined }] })
        ?.class,
    ).toBe('equivalent');
  });

  it('different runways (both present) are real', () => {
    expect(one({ approaches: [ils] }, { approaches: [{ ...ils, runway: '24L' }] })?.class).toBe(
      'real',
    );
  });

  it('blank runway does not hide a different airport, type or count', () => {
    expect(
      one(
        { approaches: [{ ...ils, runway: undefined }] },
        { approaches: [{ ...ils, airport: 'KSFO' }] },
      )?.class,
    ).toBe('real');
    expect(
      one(
        { approaches: [{ ...ils, runway: undefined }] },
        { approaches: [{ ...ils, type: 'LOC' }] },
      )?.class,
    ).toBe('real');
    expect(
      one({ approaches: [{ ...ils, runway: undefined }] }, { approaches: [ils, ils] })?.class,
    ).toBe('real');
  });

  it('mixed blank and set runways on both sides are real', () => {
    const blank = { ...ils, runway: undefined };
    expect(
      one(
        { approaches: [blank, { ...ils, runway: '06' }] },
        { approaches: [{ ...ils, runway: '07' }, ils] },
      )?.class,
    ).toBe('real');
  });
});

describe('diffRecords: rule and pilotFlying', () => {
  it('rule', () => {
    expect(one({ rule: undefined }, { rule: '121' })).toMatchObject({
      field: 'rule',
      class: 'systematic',
      pattern: 'missing-a',
    });
    expect(one({ rule: '91' }, {})).toMatchObject({ pattern: 'missing-b' });
    expect(one({ rule: '91' }, { rule: '121' })).toMatchObject({
      class: 'real',
      a: '91',
      b: '121',
    });
    expect(one({ rule: '91' }, { rule: '91' })).toBeUndefined();
  });

  it('pilotFlying: blank vs false is systematic, not equivalent', () => {
    expect(one({}, { pilotFlying: false })).toMatchObject({
      field: 'pilotFlying',
      class: 'systematic',
      pattern: 'missing-a',
    });
    expect(one({ pilotFlying: true }, {})).toMatchObject({
      class: 'systematic',
      pattern: 'missing-b',
    });
    expect(one({ pilotFlying: true }, { pilotFlying: false })?.class).toBe('real');
    expect(one({ pilotFlying: true }, { pilotFlying: true })).toBeUndefined();
  });
});

describe('diffRecords: people', () => {
  const person = (name: string, role: 'PIC' | 'SIC' | 'passenger' = 'SIC') => ({ name, role });

  it('treats name orders and spacing as the same person', () => {
    const variants = [
      'Example; Pat',
      'Example, Pat',
      'Pat Example',
      'pat  example',
      'Pat Example.',
    ];
    for (const v of variants) {
      expect(one({ people: [person('Example; Pat')] }, { people: [person(v)] })).toBeUndefined();
    }
  });

  it('strips periods in initials', () => {
    expect(
      one({ people: [person('Example, P. J.')] }, { people: [person('PJ Example')] }),
    ).toBeDefined();
    expect(
      one({ people: [person('Example, P. J.')] }, { people: [person('p j example')] }),
    ).toBeUndefined();
  });

  it('is order independent', () => {
    expect(
      one(
        { people: [person('Example; Pat'), person('Sample; Sam', 'PIC')] },
        { people: [person('Sam Sample', 'PIC'), person('Pat Example')] },
      ),
    ).toBeUndefined();
  });

  it('a strict subset is systematic missing on the side with fewer people', () => {
    const two = [person('Example; Pat'), person('Sample; Sam', 'PIC')];
    expect(one({ people: [person('Example; Pat')] }, { people: two })).toEqual({
      field: 'people',
      a: 1,
      b: 2,
      class: 'systematic',
      pattern: 'missing-a',
    });
    expect(one({ people: two }, { people: [] })).toMatchObject({
      a: 2,
      b: 0,
      class: 'systematic',
      pattern: 'missing-b',
    });
  });

  it('a role difference for the same name is real', () => {
    expect(
      one({ people: [person('Example; Pat', 'PIC')] }, { people: [person('Pat Example', 'SIC')] }),
    ).toMatchObject({ field: 'people', class: 'real', a: 1, b: 1 });
  });

  it('different people on each side are real', () => {
    expect(
      one({ people: [person('Example; Pat')] }, { people: [person('Sample; Sam')] })?.class,
    ).toBe('real');
  });

  it('never puts a name anywhere in the diffs', () => {
    const names = ['Zyxwv; Quincy', 'Quincy Zyxwv', 'Plugh, Xyzzy', 'Fnord; Gronk'];
    const diffs = diffRecords(
      rec({ people: [person(names[0]!), person(names[3]!, 'PIC')] }),
      rec({ people: [person(names[2]!)] }),
    );
    const text = JSON.stringify(diffs).toLowerCase();
    expect(diffs.some((d) => d.field === 'people')).toBe(true);
    for (const n of ['zyxwv', 'quincy', 'plugh', 'xyzzy', 'fnord', 'gronk']) {
      expect(text).not.toContain(n);
    }
  });
});

describe('diffRecords: custom', () => {
  const c = (custom: SourceRecord['custom']) => ({ custom });

  it('orders by the sorted union of keys', () => {
    const d = diffRecords(rec(c({ zeta: 1, alpha: 1 })), rec(c({ mid: 1 })));
    expect(d.map((x) => x.field)).toEqual(['custom.alpha', 'custom.mid', 'custom.zeta']);
  });

  it('blank vs 0, false or empty is equivalent', () => {
    expect(one(c({}), c({ k: 0 }))?.class).toBe('equivalent');
    expect(one(c({ k: false }), c({}))?.class).toBe('equivalent');
    expect(one(c({}), c({ k: '' }))?.class).toBe('equivalent');
  });

  it('blank vs a value is systematic', () => {
    expect(one(c({}), c({ k: 5 }))).toMatchObject({
      field: 'custom.k',
      class: 'systematic',
      pattern: 'missing-a',
    });
    expect(one(c({ k: true }), c({}))).toMatchObject({ pattern: 'missing-b' });
    expect(one(c({ k: 'x' }), c({}))).toMatchObject({ pattern: 'missing-b' });
  });

  it('numbers use the rounding rule only within 3 and with a multiple of 6', () => {
    expect(one(c({ k: 63 }), c({ k: 60 }))).toMatchObject({
      class: 'systematic',
      pattern: 'rounding',
    });
    expect(one(c({ k: 64 }), c({ k: 60 }))?.class).toBe('real');
    expect(one(c({ k: 61 }), c({ k: 62 }))?.class).toBe('real');
    expect(one(c({ k: 2 }), c({ k: 3 }))?.class).toBe('real');
  });

  it('booleans and strings are exact', () => {
    expect(one(c({ k: true }), c({ k: false }))?.class).toBe('real');
    expect(one(c({ k: 'a' }), c({ k: 'A' }))?.class).toBe('real');
    expect(one(c({ k: 'a' }), c({ k: 'a' }))).toBeUndefined();
    expect(one(c({ k: 6 }), c({ k: '6' }))?.class).toBe('real');
  });
});

describe('diffRecords: remarks', () => {
  it('reports lengths, never text', () => {
    const d = one({ remarks: 'secret alpha' }, { remarks: 'secret beta!' });
    expect(d).toEqual({ field: 'remarks', a: 12, b: 12, class: 'real' });
    expect(JSON.stringify(d)).not.toContain('secret');
  });

  it('whitespace-only differences are equivalent', () => {
    expect(one({ remarks: 'a  b\n c' }, { remarks: ' a b c ' })).toMatchObject({
      class: 'equivalent',
      a: 7,
      b: 7,
    });
    expect(one({ remarks: 'same' }, { remarks: 'same' })).toBeUndefined();
    expect(one({ remarks: undefined }, { remarks: '  ' })?.class).toBe('equivalent');
  });

  it('blank vs text is systematic', () => {
    expect(one({}, { remarks: 'note' })).toEqual({
      field: 'remarks',
      a: undefined,
      b: 4,
      class: 'systematic',
      pattern: 'missing-a',
    });
    expect(one({ remarks: 'note' }, {})).toMatchObject({ pattern: 'missing-b' });
  });

  it('never leaks text in any diff of a full record', () => {
    const d = diffRecords(
      rec({ remarks: 'topsecretremark', route: 'KLAX' }),
      rec({ remarks: 'othersecretremark', route: 'KSFO' }),
    );
    expect(JSON.stringify(d)).not.toContain('secretremark');
  });
});

describe('diffRecords: ordering', () => {
  it('emits fields in the documented order', () => {
    const a = rec({
      kind: 'flight',
      date: '2025-01-01',
      tail: 'N1',
      from: 'KAAA',
      to: 'KBBB',
      localFlight: true,
      route: 'X',
      flightNumber: 'AA1',
      clock: { out: 1 },
      durations: { total: 70 },
      counts: { dayTakeoffs: 1 },
      approaches: [{ type: 'ILS' }],
      rule: '91',
      pilotFlying: true,
      people: [{ name: 'A B', role: 'PIC' }],
      custom: { k: 1 },
      remarks: 'r',
    });
    const b = rec({
      kind: 'simulator',
      date: '2025-01-02',
      tail: 'N2',
      from: 'KCCC',
      to: 'KDDD',
      localFlight: false,
      route: 'Y',
      flightNumber: 'AA2',
      clock: { out: 2 },
      durations: { total: 80 },
      counts: { dayTakeoffs: 2 },
      approaches: [{ type: 'LOC' }],
      rule: '121',
      pilotFlying: false,
      people: [{ name: 'C D', role: 'PIC' }],
      custom: { k: 2 },
      remarks: 's',
    });
    expect(diffRecords(a, b).map((x) => x.field)).toEqual([
      'kind',
      'date',
      'tail',
      'from',
      'to',
      'localFlight',
      'route',
      'flightNumber',
      'clock.out',
      'durations.total',
      'counts.dayTakeoffs',
      'approaches',
      'rule',
      'pilotFlying',
      'people',
      'custom.k',
      'remarks',
    ]);
  });
});
