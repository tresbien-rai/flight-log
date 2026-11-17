import { describe, expect, it } from 'vitest';
import type { SourceRecord } from '../importers';
import { matchRecords } from './match';

let nextLine = 2;

/** Small synthetic record. Anything not given is blank. */
function rec(over: Partial<SourceRecord> & { out?: number; inn?: number; total?: number } = {}) {
  const { out, inn, total, ...rest } = over;
  const r: SourceRecord = {
    source: 'logten',
    line: nextLine++,
    raw: {},
    kind: 'flight',
    date: '2024-03-10',
    tail: 'N100AB',
    from: 'KAAA',
    to: 'KBBB',
    clock: {},
    durations: {},
    counts: {},
    approaches: [],
    people: [],
    custom: {},
    ...rest,
  };
  if (out !== undefined) r.clock = { ...r.clock, out };
  if (inn !== undefined) r.clock = { ...r.clock, in: inn };
  if (total !== undefined) r.durations = { ...r.durations, total };
  return r;
}

const L = (line: number, over: Parameters<typeof rec>[0] = {}) => rec({ ...over, line });

function tiersOf(a: SourceRecord[], b: SourceRecord[]): string[] {
  return matchRecords(a, b).pairs.map((p) => p.tier);
}

describe('exact', () => {
  it('pairs same date, tail, from and to', () => {
    const a = rec();
    const b = rec({ source: 'foreflight' });
    const r = matchRecords([a], [b]);
    expect(r.pairs).toEqual([{ a, b, tier: 'exact' }]);
    expect(r.onlyA).toEqual([]);
    expect(r.onlyB).toEqual([]);
  });

  it('does not pair different airports, tails or dates in this tier', () => {
    expect(tiersOf([rec()], [rec({ to: 'KCCC', total: 90 })])).not.toContain('exact');
    expect(tiersOf([rec()], [rec({ tail: 'N200AB' })])).not.toContain('exact');
    expect(tiersOf([rec()], [rec({ date: '2024-03-11' })])).not.toContain('exact');
  });

  it('treats a local flight (no destination) as its own destination', () => {
    const local = { to: undefined, localFlight: true };
    expect(tiersOf([rec(local)], [rec(local)])).toEqual(['exact']);
    expect(tiersOf([rec(local)], [rec({ to: undefined })])).not.toContain('exact');
    expect(tiersOf([rec(local)], [rec({ to: 'KAAA' })])).not.toContain('exact');
  });

  it('treats two blank values as equal', () => {
    const blankish = { tail: undefined, from: undefined, to: undefined };
    expect(tiersOf([rec(blankish)], [rec(blankish)])).toEqual(['exact']);
  });

  it('allows a kind mismatch when the tail is present, not otherwise', () => {
    expect(tiersOf([rec({ kind: 'ground' })], [rec()])).toEqual(['exact']);
    expect(tiersOf([rec({ kind: 'ground', tail: undefined })], [rec({ tail: undefined })])).toEqual(
      [],
    );
  });

  it('prefers a same-kind candidate over a kind-mismatched one on equal cost', () => {
    const a = rec();
    const bGround = rec({ kind: 'ground' });
    const bFlight = rec();
    const r = matchRecords([a], [bGround, bFlight]);
    expect(r.pairs[0]!.b).toBe(bFlight);
    expect(r.onlyB).toEqual([bGround]);
  });
});

describe('date-adjacent', () => {
  it('pairs dates one day apart when the out times are equal', () => {
    expect(tiersOf([rec({ out: 600 })], [rec({ out: 600, date: '2024-03-11' })])).toEqual([
      'date-adjacent',
    ]);
    expect(tiersOf([rec({ out: 600 })], [rec({ out: 600, date: '2024-03-09' })])).toEqual([
      'date-adjacent',
    ]);
  });

  it('crosses month and year ends', () => {
    expect(
      tiersOf([rec({ date: '2023-12-31', total: 60 })], [rec({ date: '2024-01-01', total: 60 })]),
    ).toEqual(['date-adjacent']);
    expect(
      tiersOf([rec({ date: '2024-02-29', total: 60 })], [rec({ date: '2024-03-01', total: 60 })]),
    ).toEqual(['date-adjacent']);
  });

  it('pairs on totals within 3 minutes when an out time is missing', () => {
    const b = (total: number) => rec({ date: '2024-03-11', total });
    expect(tiersOf([rec({ total: 60 })], [b(63)])).toEqual(['date-adjacent']);
    expect(tiersOf([rec({ total: 60 })], [b(64)])).toEqual([]);
    expect(tiersOf([rec({ out: 600, total: 60 })], [b(61)])).toEqual(['date-adjacent']);
  });

  it('requires equal out times when both have one, whatever the totals', () => {
    expect(
      tiersOf([rec({ out: 600, total: 60 })], [rec({ out: 601, total: 60, date: '2024-03-11' })]),
    ).toEqual([]);
  });

  it('requires the same tail and route', () => {
    const b = { date: '2024-03-11', total: 60 };
    expect(tiersOf([rec({ total: 60 })], [rec({ ...b, tail: 'N200AB' })])).toEqual([]);
    expect(tiersOf([rec({ total: 60 })], [rec({ ...b, to: 'KCCC' })])).toEqual([]);
  });

  it('does not pair dates two days apart', () => {
    expect(tiersOf([rec({ out: 600 })], [rec({ out: 600, date: '2024-03-12' })])).not.toContain(
      'date-adjacent',
    );
  });
});

describe('tail-differs', () => {
  it('pairs same date and route with different tails and equal out times', () => {
    expect(tiersOf([rec({ out: 600 })], [rec({ out: 600, tail: 'N200AB' })])).toEqual([
      'tail-differs',
    ]);
  });

  it('pairs when one tail is missing, using totals', () => {
    expect(tiersOf([rec({ total: 60 })], [rec({ tail: undefined, total: 62 })])).toEqual([
      'tail-differs',
    ]);
  });

  it('refuses when neither out time nor total agrees', () => {
    expect(tiersOf([rec({ total: 60 })], [rec({ tail: 'N200AB', total: 90 })])).toEqual([]);
    expect(
      tiersOf([rec({ out: 600, total: 60 })], [rec({ out: 650, tail: 'N200AB', total: 60 })]),
    ).toEqual([]);
  });

  it('does not pair a different route', () => {
    expect(tiersOf([rec({ out: 600 })], [rec({ out: 600, tail: 'N200AB', to: 'KCCC' })])).toEqual(
      [],
    );
  });
});

describe('route-differs', () => {
  it('pairs same date and tail with a different destination', () => {
    expect(tiersOf([rec({ out: 600 })], [rec({ out: 600, to: 'KCCC' })])).toEqual([
      'route-differs',
    ]);
  });

  it('pairs a blank or LOCAL destination against an airport', () => {
    expect(
      tiersOf([rec({ total: 60 })], [rec({ to: undefined, localFlight: true, total: 60 })]),
    ).toEqual(['route-differs']);
  });

  it('pairs a differing departure', () => {
    expect(tiersOf([rec({ total: 60 })], [rec({ from: 'KZZZ', total: 61 })])).toEqual([
      'route-differs',
    ]);
  });

  it('refuses when out times differ', () => {
    expect(tiersOf([rec({ out: 600 })], [rec({ out: 700, to: 'KCCC' })])).toEqual([]);
  });
});

describe('date-differs', () => {
  const base = { out: 600, inn: 700 };
  const b = (date: string, over = {}) => rec({ ...base, date, ...over });

  it('pairs equal out and in times a few days or weeks apart', () => {
    expect(tiersOf([rec(base)], [b('2024-03-12')])).toEqual(['date-differs']);
    expect(tiersOf([rec(base)], [b('2024-03-25')])).toEqual(['date-differs']);
    expect(tiersOf([rec(base)], [b('2024-02-20')])).toEqual(['date-differs']);
  });

  it('matches at 45 days but not at 46', () => {
    expect(tiersOf([rec({ ...base, date: '2024-03-01' })], [b('2024-04-15')])).toEqual([
      'date-differs',
    ]);
    expect(tiersOf([rec({ ...base, date: '2024-03-01' })], [b('2024-04-16')])).toEqual([]);
  });

  it('needs out and in on both sides', () => {
    expect(tiersOf([rec({ out: 600 })], [rec({ out: 600, date: '2024-03-20' })])).toEqual([]);
    expect(tiersOf([rec(base)], [rec({ out: 600, date: '2024-03-20' })])).toEqual([]);
    expect(tiersOf([rec(base)], [rec({ date: '2024-03-20' })])).toEqual([]);
  });

  it('needs both times equal, and the same tail and route', () => {
    expect(tiersOf([rec(base)], [b('2024-03-20', { inn: 701 })])).toEqual([]);
    expect(tiersOf([rec(base)], [b('2024-03-20', { tail: 'N200AB' })])).toEqual([]);
    expect(tiersOf([rec(base)], [b('2024-03-20', { to: 'KCCC' })])).toEqual([]);
  });
});

describe('session', () => {
  const sim = (over: Partial<SourceRecord> = {}) =>
    rec({ kind: 'simulator', tail: undefined, from: undefined, to: undefined, ...over });

  it('pairs simulator rows on the same date', () => {
    expect(tiersOf([sim()], [sim()])).toEqual(['session']);
  });

  it('pairs ground rows, and never across kinds', () => {
    expect(tiersOf([sim({ kind: 'ground' })], [sim({ kind: 'ground' })])).toEqual(['session']);
    expect(tiersOf([sim()], [sim({ kind: 'ground' })])).toEqual([]);
  });

  it('requires equal tails only when both are present', () => {
    expect(tiersOf([sim({ tail: 'SIM1' })], [sim({ tail: 'DEV9' })])).toEqual([]);
    expect(tiersOf([sim({ tail: 'SIM1' })], [sim()])).toEqual(['session']);
  });

  it('requires the same date', () => {
    expect(tiersOf([sim()], [sim({ date: '2024-03-11' })])).toEqual([]);
  });

  it('picks the closest session length and leaves the right orphan', () => {
    const a1 = sim({ durations: { simulator: 60 } });
    const a2 = sim({ durations: { simulator: 120 } });
    const b2 = sim({ durations: { groundTraining: 118 } });
    const r = matchRecords([a1, a2], [b2]);
    expect(r.pairs.map((p) => [p.a, p.b])).toEqual([[a2, b2]]);
    expect(r.onlyA).toEqual([a1]);
  });
});

describe('kinds in tiers 2 to 5', () => {
  it('never pairs a simulator row with a flight row there', () => {
    const flight = rec({ out: 600, inn: 700, total: 60 });
    const variants = [
      { date: '2024-03-11' },
      { tail: 'N200AB' },
      { to: 'KCCC' },
      { date: '2024-03-20' },
    ];
    for (const v of variants) {
      const sim = rec({ out: 600, inn: 700, total: 60, kind: 'simulator', ...v });
      expect(tiersOf([flight], [sim])).toEqual([]);
      expect(tiersOf([sim], [flight])).toEqual([]);
    }
  });
});

describe('precedence', () => {
  it('does not let a looser tier steal an exact match', () => {
    // a2 is the day after; a looser tier could pair it with b1 if a1 were processed later.
    const a1 = rec({ out: 600 });
    const a2 = rec({ out: 600, date: '2024-03-09' });
    const b1 = rec({ out: 600 });
    const r = matchRecords([a2, a1], [b1]);
    expect(r.pairs).toEqual([{ a: a1, b: b1, tier: 'exact' }]);
    expect(r.onlyA).toEqual([a2]);
  });

  it('gives a record left over by one tier to the next', () => {
    const a = [rec({ out: 600 }), rec({ out: 800, tail: 'N200AB', date: '2024-03-11' })];
    const b = [rec({ out: 600 }), rec({ out: 800, tail: 'N300AB', date: '2024-03-11' })];
    expect(tiersOf(a, b)).toEqual(['exact', 'tail-differs']);
  });

  it('an earlier tier wins even against a cheaper later-tier candidate', () => {
    const a = rec({ total: 60 });
    const bExact = rec({ total: 80 });
    const bAdjacent = rec({ total: 60, date: '2024-03-11' });
    const r = matchRecords([a], [bAdjacent, bExact]);
    expect(r.pairs[0]).toEqual({ a, b: bExact, tier: 'exact' });
  });
});

describe('duplicates on one day', () => {
  it('pairs 3 against 3 by cost, not by position', () => {
    const a = [30, 60, 90].map((total, i) => L(10 + i, { out: 600 + i * 100, total }));
    const b = [90, 30, 60].map((total, i) =>
      L(10 + i, { out: [800, 600, 700][i]!, total, source: 'foreflight' }),
    );
    const r = matchRecords(a, b);
    expect(r.pairs.map((p) => [p.a.line, p.b.line])).toEqual([
      [10, 11],
      [11, 12],
      [12, 10],
    ]);
    expect(r.pairs.every((p) => p.tier === 'exact')).toBe(true);
  });

  it('pairs 3 against 2 and orphans the worst fit', () => {
    const a = [30, 60, 90].map((total, i) => L(10 + i, { total }));
    const b = [L(20, { total: 31 }), L(21, { total: 88 })];
    const r = matchRecords(a, b);
    expect(r.pairs.map((p) => [p.a.line, p.b.line])).toEqual([
      [10, 20],
      [12, 21],
    ]);
    expect(r.onlyA.map((x) => x.line)).toEqual([11]);
    expect(r.onlyB).toEqual([]);
  });

  it('pairs 2 against 3 and orphans the worst fit on side b', () => {
    const a = [L(10, { total: 30 }), L(11, { total: 90 })];
    const b = [L(20, { total: 31 }), L(21, { total: 60 }), L(22, { total: 91 })];
    const r = matchRecords(a, b);
    expect(r.onlyB.map((x) => x.line)).toEqual([21]);
  });

  it('uses out-time distance in the cost when both have one', () => {
    const a = [L(10, { out: 600, total: 60 }), L(11, { out: 700, total: 60 })];
    const b = [L(20, { out: 705, total: 60 }), L(21, { out: 602, total: 60 })];
    const r = matchRecords(a, b);
    expect(r.pairs.map((p) => [p.a.line, p.b.line])).toEqual([
      [10, 21],
      [11, 20],
    ]);
  });
});

describe('file ordering on full ties', () => {
  const day = (firstLine: number, n: number) =>
    Array.from({ length: n }, (_, i) => L(firstLine + i, { date: '2024-03-10' }));
  const early = (line: number) => L(line, { date: '2024-03-01', tail: 'N7' });
  const late = (line: number) => L(line, { date: '2024-04-01', tail: 'N8' });
  const middle = (r: ReturnType<typeof matchRecords>) =>
    r.pairs.filter((p) => p.a.date === '2024-03-10').map((p) => [p.a.line, p.b.line]);

  it('pairs ascending with ascending when both files are oldest-first', () => {
    const a = [early(2), ...day(3, 3), late(6)];
    const b = [early(2), ...day(3, 3), late(6)];
    expect(middle(matchRecords(a, b))).toEqual([
      [3, 3],
      [4, 4],
      [5, 5],
    ]);
  });

  it('pairs ascending a with descending b when b is newest-first', () => {
    const a = [early(2), ...day(3, 3), late(6)];
    const b = [late(2), ...day(3, 3), early(6)];
    expect(middle(matchRecords(a, b))).toEqual([
      [3, 5],
      [4, 4],
      [5, 3],
    ]);
  });

  it('pairs descending a with ascending b the same way', () => {
    const a = [late(2), ...day(3, 2), early(5)];
    const b = [early(2), ...day(3, 2), late(5)];
    expect(middle(matchRecords(a, b))).toEqual([
      [3, 4],
      [4, 3],
    ]);
  });

  it('lets cost override the ordering rule', () => {
    const a = [early(2), L(3, { total: 30 }), L(4, { total: 60 }), late(5)];
    const b = [late(2), L(3, { total: 30 }), L(4, { total: 60 }), early(5)];
    expect(middle(matchRecords(a, b))).toEqual([
      [3, 3],
      [4, 4],
    ]);
  });
});

describe('output shape', () => {
  it('orders pairs by a, and orphans in original order', () => {
    const a = [
      rec({ date: '2024-01-01', tail: 'N1' }),
      rec({ date: '2024-01-02', tail: 'N2' }),
      rec({ date: '2024-01-03', tail: 'N3' }),
      rec({ date: '2024-01-04', tail: 'N4' }),
    ];
    const b = [
      rec({ date: '2024-01-04', tail: 'N4' }),
      rec({ date: '2024-02-01', tail: 'N8' }),
      rec({ date: '2024-01-01', tail: 'N1' }),
      rec({ date: '2024-02-02', tail: 'N9' }),
    ];
    const r = matchRecords(a, b);
    expect(r.pairs.map((p) => p.a)).toEqual([a[0], a[3]]);
    expect(r.onlyA).toEqual([a[1], a[2]]);
    expect(r.onlyB).toEqual([b[1], b[3]]);
  });

  it('puts every record in exactly one place', () => {
    const a = [rec(), rec(), rec({ kind: 'simulator' }), rec({ date: '2023-01-01' })];
    const b = [rec(), rec({ kind: 'simulator' }), rec({ date: '2022-01-01' })];
    const r = matchRecords(a, b);
    expect(r.pairs.length + r.onlyA.length).toBe(a.length);
    expect(r.pairs.length + r.onlyB.length).toBe(b.length);
    const usedB = [...r.pairs.map((p) => p.b), ...r.onlyB];
    expect(new Set(usedB).size).toBe(b.length);
  });

  it('handles empty sides', () => {
    expect(matchRecords([], [])).toEqual({ pairs: [], onlyA: [], onlyB: [] });
    const x = rec();
    expect(matchRecords([x], [])).toEqual({ pairs: [], onlyA: [x], onlyB: [] });
    expect(matchRecords([], [x])).toEqual({ pairs: [], onlyA: [], onlyB: [x] });
  });

  it('does not modify its inputs', () => {
    const a = Object.freeze([rec(), rec({ date: '2024-05-01' })]);
    const b = Object.freeze([rec({ date: '2024-05-01' }), rec()]);
    expect(() => matchRecords(a, b)).not.toThrow();
  });

  it('gives deep-equal output on repeated runs', () => {
    const a = Array.from({ length: 60 }, (_, i) =>
      rec({ date: `2024-03-${String((i % 5) + 1).padStart(2, '0')}`, total: i % 7 }),
    );
    const b = Array.from({ length: 55 }, (_, i) =>
      rec({ date: `2024-03-${String((i % 5) + 1).padStart(2, '0')}`, total: i % 6 }),
    );
    expect(matchRecords(a, b)).toEqual(matchRecords(a, b));
  });
});

describe('performance', () => {
  it('matches 2,000 by 2,000 records in under a second', () => {
    const n = 2000;
    const mk = (i: number, dayShift: number) => {
      const d = new Date(Date.UTC(2015, 0, 1) + (Math.floor(i / 2) + dayShift) * 86_400_000);
      return rec({
        date: d.toISOString().slice(0, 10),
        tail: `N${i % 40}`,
        from: i % 3 ? 'KAAA' : 'KBBB',
        to: i % 5 ? 'KCCC' : undefined,
        localFlight: i % 5 === 0,
        out: (i * 37) % 1440,
        inn: (i * 37 + 60) % 1440,
        total: 60,
      });
    };
    const a = Array.from({ length: n }, (_, i) => mk(i, 0));
    // A tenth of b is a day late, a tenth has a different tail.
    const b = Array.from({ length: n }, (_, i) =>
      i % 10 === 0 ? mk(i, 1) : i % 10 === 1 ? { ...mk(i, 0), tail: 'N999' } : mk(i, 0),
    );
    const t0 = Date.now();
    const r = matchRecords(a, b);
    const ms = Date.now() - t0;
    expect(r.pairs.length).toBeGreaterThan(1800);
    expect(ms).toBeLessThan(1000);
  });

  it('survives a worst case of every record sharing one day', () => {
    const a = Array.from({ length: 400 }, (_, i) => rec({ total: i }));
    const b = Array.from({ length: 400 }, (_, i) => rec({ total: i }));
    expect(matchRecords(a, b).pairs).toHaveLength(400);
  });
});
