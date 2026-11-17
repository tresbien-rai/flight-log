import { describe, expect, it } from 'vitest';
import { makeAirframe, makeEntry, makeType, run, runWithAirports } from '../testing';
import {
  duplicateEntry,
  hobbsDiscontinuity,
  inconsistentTypeAttributes,
  nearConfigurationChange,
  overlappingTimes,
  positionDiscontinuity,
} from './logbook';

const T = (hm: string, day = '22') => `2025-06-${day}T${hm}Z`;

describe('duplicate-entry', () => {
  it('warns on identical flights with the same out time, naming all entries', () => {
    const a = makeEntry({ id: 'a', out: T('10:00') });
    const b = makeEntry({ id: 'b', out: T('10:00') });
    const c = makeEntry({ id: 'c', out: T('10:00') });
    const f = run(duplicateEntry, [a, b, c]);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.entryIds).toEqual(['a', 'b', 'c']);
  });
  it('matches on total when neither has an out time', () => {
    const f = run(duplicateEntry, [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]);
    expect(f).toHaveLength(1);
    expect(f[0]!.fields).toContain('durations.total');
  });
  it('is silent when anything differs (date, airframe, airports, out, total)', () => {
    const a = makeEntry({ id: 'a', out: T('10:00') });
    for (const other of [
      makeEntry({ id: 'b', out: T('10:01') }),
      makeEntry({ id: 'b', out: T('10:00'), date: '2025-06-23' }),
      makeEntry({ id: 'b', out: T('10:00'), airframeId: 'a2' }),
      makeEntry({ id: 'b', out: T('10:00'), to: 'KCCC' }),
      makeEntry({ id: 'b', out: T('10:00'), from: 'KCCC' }),
    ]) {
      expect(run(duplicateEntry, [a, other])).toEqual([]);
    }
    expect(
      run(duplicateEntry, [
        makeEntry({ id: 'a' }),
        makeEntry({ id: 'b', durations: { total: 61 } }),
      ]),
    ).toEqual([]);
  });
  it('does not compare an entry with an out time against one without', () => {
    expect(
      run(duplicateEntry, [makeEntry({ id: 'a', out: T('10:00') }), makeEntry({ id: 'b' })]),
    ).toEqual([]);
  });
  it('ignores simulator and ground entries, and entries too bare to compare', () => {
    const sim = {
      kind: 'simulator' as const,
      airframeId: undefined,
      from: undefined,
      to: undefined,
    };
    expect(
      run(duplicateEntry, [makeEntry({ id: 'a', ...sim }), makeEntry({ id: 'b', ...sim })]),
    ).toEqual([]);
    const bare = { airframeId: undefined, from: undefined, to: undefined };
    expect(
      run(duplicateEntry, [makeEntry({ id: 'a', ...bare }), makeEntry({ id: 'b', ...bare })]),
    ).toEqual([]);
    const zero = { durations: { total: 0, pic: 0 } };
    expect(
      run(duplicateEntry, [makeEntry({ id: 'a', ...zero }), makeEntry({ id: 'b', ...zero })]),
    ).toEqual([]);
  });
});

describe('overlapping-times', () => {
  const leg = (id: string, out: string, inn: string) => makeEntry({ id, out: T(out), in: T(inn) });
  it('errors on overlap of more than a minute, once per pair', () => {
    const f = run(overlappingTimes, [leg('a', '10:00', '12:00'), leg('b', '11:00', '13:00')]);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
    expect(f[0]!.entryIds).toEqual(['a', 'b']);
    expect(f[0]!.message).toContain('60 minutes');
  });
  it('allows back-to-back legs and an overlap of exactly one minute (boundary)', () => {
    expect(run(overlappingTimes, [leg('a', '10:00', '11:00'), leg('b', '11:00', '12:00')])).toEqual(
      [],
    );
    expect(run(overlappingTimes, [leg('a', '10:00', '11:01'), leg('b', '11:00', '12:00')])).toEqual(
      [],
    );
    expect(
      run(overlappingTimes, [leg('a', '10:00', '11:02'), leg('b', '11:00', '12:00')]),
    ).toHaveLength(1);
  });
  it('reports a leg that spans several others, pair by pair', () => {
    const f = run(overlappingTimes, [
      leg('big', '08:00', '20:00'),
      leg('b', '09:00', '10:00'),
      leg('c', '11:00', '12:00'),
    ]);
    expect(f.map((x) => x.entryIds)).toEqual([
      ['big', 'b'],
      ['big', 'c'],
    ]);
  });
  it('works across dates and regardless of input order', () => {
    const a = makeEntry({
      id: 'a',
      date: '2025-06-22',
      out: '2025-06-22T23:00Z',
      in: '2025-06-23T01:00Z',
    });
    const b = makeEntry({
      id: 'b',
      date: '2025-06-23',
      out: '2025-06-23T00:00Z',
      in: '2025-06-23T02:00Z',
    });
    expect(run(overlappingTimes, [b, a])).toHaveLength(1);
  });
  it('is silent for entries missing out or in', () => {
    const noIn = makeEntry({ id: 'a', out: T('10:00') });
    expect(run(overlappingTimes, [noIn, leg('b', '10:30', '11:30')])).toEqual([]);
    expect(run(overlappingTimes, [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })])).toEqual([]);
  });
});

describe('position-discontinuity', () => {
  const leg = (
    id: string,
    from: string,
    to: string,
    out: string,
    inn: string,
    date = '2025-06-22',
  ) => makeEntry({ id, rule: '121', from, to, out: T(out), in: T(inn), date });
  it('notes when the next leg departs from somewhere else, naming both', () => {
    const f = run(positionDiscontinuity, [
      leg('a', 'KAAA', 'KBBB', '10:00', '11:00'),
      leg('b', 'KCCC', 'KAAA', '12:00', '13:00'),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
    expect(f[0]!.entryIds).toEqual(['a', 'b']);
  });
  it('is silent when legs join up, including IATA vs ICAO of one airport', () => {
    expect(
      run(positionDiscontinuity, [
        leg('a', 'KBBB', 'KAAA', '10:00', '11:00'),
        leg('b', 'KAAA', 'KBBB', '12:00', '13:00'),
      ]),
    ).toEqual([]);
    expect(
      runWithAirports(positionDiscontinuity, [
        leg('a', 'KBBB', 'KAAA', '10:00', '11:00'),
        leg('b', 'AAA', 'KBBB', '12:00', '13:00'),
      ]),
    ).toEqual([]);
  });
  it('is silent across different dates, non-121 rules, and missing times or airports', () => {
    expect(
      run(positionDiscontinuity, [
        leg('a', 'KAAA', 'KBBB', '10:00', '11:00', '2025-06-21'),
        leg('b', 'KCCC', 'KAAA', '12:00', '13:00'),
      ]),
    ).toEqual([]);
    expect(
      run(positionDiscontinuity, [
        { ...leg('a', 'KAAA', 'KBBB', '10:00', '11:00'), rule: '91' },
        leg('b', 'KCCC', 'KAAA', '12:00', '13:00'),
      ]),
    ).toEqual([]);
    expect(
      run(positionDiscontinuity, [
        { ...leg('a', 'KAAA', 'KBBB', '10:00', '11:00'), in: undefined },
        leg('b', 'KCCC', 'KAAA', '12:00', '13:00'),
      ]),
    ).toEqual([]);
    expect(
      run(positionDiscontinuity, [
        { ...leg('a', 'KAAA', 'KBBB', '10:00', '11:00'), to: undefined },
        leg('b', 'KCCC', 'KAAA', '12:00', '13:00'),
      ]),
    ).toEqual([]);
  });
  it('sorts legs by out time within the day', () => {
    const f = run(positionDiscontinuity, [
      leg('b', 'KBBB', 'KAAA', '12:00', '13:00'),
      leg('a', 'KAAA', 'KBBB', '10:00', '11:00'),
    ]);
    expect(f).toEqual([]);
  });
});

describe('near-configuration-change', () => {
  const book = {
    airframes: [
      makeAirframe({
        configurations: [
          { value: 't1', to: '2025-06-10' },
          { value: 't2', from: '2025-06-11' },
        ],
        registrations: [{ value: 'N1' }],
      }),
    ],
    aircraftTypes: [makeType(), makeType({ id: 't2' })],
  };
  it('notes entries within three days either side of a change', () => {
    for (const date of ['2025-06-07', '2025-06-10', '2025-06-11', '2025-06-14']) {
      const f = run(nearConfigurationChange, makeEntry({ date }), book);
      expect(f, date).toHaveLength(1);
      expect(f[0]!.severity).toBe('note');
    }
  });
  it('is silent four days away, and for unaffected airframes', () => {
    expect(run(nearConfigurationChange, makeEntry({ date: '2025-06-06' }), book)).toEqual([]);
    expect(run(nearConfigurationChange, makeEntry({ date: '2025-06-15' }), book)).toEqual([]);
    expect(
      run(nearConfigurationChange, makeEntry({ date: '2025-06-10', airframeId: 'a2' }), book),
    ).toEqual([]);
  });
  it('also covers registration changes', () => {
    const regs = {
      airframes: [
        makeAirframe({
          registrations: [
            { value: 'N1', to: '2025-01-31' },
            { value: 'N2', from: '2025-02-01' },
          ],
        }),
      ],
    };
    const f = run(nearConfigurationChange, makeEntry({ date: '2025-02-02' }), regs);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('registration');
  });
  it('reports each entry at most once', () => {
    const both = {
      airframes: [
        makeAirframe({
          configurations: [
            { value: 't1', to: '2025-06-10' },
            { value: 't2', from: '2025-06-11' },
          ],
          registrations: [
            { value: 'N1', to: '2025-06-10' },
            { value: 'N2', from: '2025-06-11' },
          ],
        }),
      ],
    };
    expect(run(nearConfigurationChange, makeEntry({ date: '2025-06-10' }), both)).toHaveLength(1);
  });
  it('is silent when a period merely ends with nothing after it, or periods are open-ended', () => {
    const end = {
      airframes: [makeAirframe({ configurations: [{ value: 't1', to: '2025-06-10' }] })],
    };
    expect(run(nearConfigurationChange, makeEntry({ date: '2025-06-10' }), end)).toEqual([]);
    expect(run(nearConfigurationChange, makeEntry())).toEqual([]);
  });
});

describe('hobbs-discontinuity', () => {
  const leg = (id: string, date: string, hobbsOut?: number, hobbsIn?: number, airframeId = 'a1') =>
    makeEntry({ id, date, hobbsOut, hobbsIn, airframeId });
  it('notes when the later hobbs-out differs from the earlier hobbs-in', () => {
    const f = run(hobbsDiscontinuity, [
      leg('a', '2025-06-01', 100, 110),
      leg('b', '2025-06-02', 112, 120),
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
    expect(f[0]!.entryIds).toEqual(['a', 'b']);
  });
  it('is silent when readings join up', () => {
    expect(
      run(hobbsDiscontinuity, [leg('a', '2025-06-01', 100, 110), leg('b', '2025-06-02', 110, 120)]),
    ).toEqual([]);
  });
  it('only compares consecutive entries of the same airframe', () => {
    const f = run(hobbsDiscontinuity, [
      leg('a', '2025-06-01', 100, 110),
      leg('x', '2025-06-02', 500, 510, 'a2'),
      leg('b', '2025-06-03', 110, 120),
    ]);
    expect(f).toEqual([]);
  });
  it('is silent when a reading is missing, or an unreadable entry sits between', () => {
    expect(
      run(hobbsDiscontinuity, [leg('a', '2025-06-01', 100, 110), leg('b', '2025-06-02')]),
    ).toEqual([]);
    expect(
      run(hobbsDiscontinuity, [leg('a', '2025-06-01', 100), leg('b', '2025-06-02', 150, 160)]),
    ).toEqual([]);
    expect(
      run(hobbsDiscontinuity, [
        leg('a', '2025-06-01', 100, 110),
        leg('m', '2025-06-02'),
        leg('b', '2025-06-03', 150, 160),
      ]),
    ).toEqual([]);
  });
});

describe('inconsistent-type-attributes', () => {
  const a = makeType({ id: 'C172-A', icaoDesignator: 'C172' });
  it('notes unrelated types with the same designator that disagree', () => {
    const b = makeType({ id: 'C172-B', icaoDesignator: 'c172', engine: 'turbofan' });
    const f = run(inconsistentTypeAttributes, [], { aircraftTypes: [a, b] });
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
    expect(f[0]!.entryIds).toEqual([]);
    expect(f[0]!.fields).toEqual([]);
    expect(f[0]!.message).toContain('C172-A');
    expect(f[0]!.message).toContain('C172-B');
    expect(f[0]!.message).toContain('engine');
  });
  it('also catches class disagreement', () => {
    const b = makeType({ id: 'C172-B', icaoDesignator: 'C172', class: 'AMEL' });
    expect(run(inconsistentTypeAttributes, [], { aircraftTypes: [a, b] })[0]!.message).toContain(
      'class',
    );
  });
  it('is silent when they agree, differ in designator, or one is a variant of the other', () => {
    expect(
      run(inconsistentTypeAttributes, [], {
        aircraftTypes: [a, makeType({ id: 'B', icaoDesignator: 'C172' })],
      }),
    ).toEqual([]);
    expect(
      run(inconsistentTypeAttributes, [], {
        aircraftTypes: [a, makeType({ id: 'B', icaoDesignator: 'C182', engine: 'turbofan' })],
      }),
    ).toEqual([]);
    const v = makeType({
      id: 'V',
      icaoDesignator: 'C172',
      engine: 'turbofan',
      variantOf: 'C172-A',
    });
    expect(run(inconsistentTypeAttributes, [], { aircraftTypes: [a, v] })).toEqual([]);
    expect(run(inconsistentTypeAttributes, [], { aircraftTypes: [v, a] })).toEqual([]);
  });
  it('follows variant chains and tolerates cycles', () => {
    const b = makeType({ id: 'B', icaoDesignator: 'C172', variantOf: 'C172-A' });
    const c = makeType({ id: 'C', icaoDesignator: 'C172', engine: 'turbofan', variantOf: 'B' });
    expect(run(inconsistentTypeAttributes, [], { aircraftTypes: [a, b, c] })).toEqual([]);
    const x = makeType({ id: 'X', icaoDesignator: 'ZZ', engine: 'electric', variantOf: 'Y' });
    const y = makeType({ id: 'Y', icaoDesignator: 'ZZ', variantOf: 'X', engine: 'turbofan' });
    const z = makeType({ id: 'Z', icaoDesignator: 'ZZ', engine: 'turbojet' });
    expect(run(inconsistentTypeAttributes, [], { aircraftTypes: [x, y, z] })).toHaveLength(2);
  });
  it('is silent for types with no designator', () => {
    expect(
      run(inconsistentTypeAttributes, [], {
        aircraftTypes: [makeType({ id: 'p' }), makeType({ id: 'q', engine: 'turbofan' })],
      }),
    ).toEqual([]);
  });
});
