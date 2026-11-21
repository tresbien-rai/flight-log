import { describe, expect, it } from 'vitest';
import type { SourceRecord } from '../importers';
import { matchRecords } from './match';
import {
  amendPairDecision,
  decisionField,
  decisionKey,
  diffSignature,
  fingerprintRecords,
  resolve,
} from './resolve';
import type { BulkDecision, Decision, OrphanDecision, PairDecision, Resolution } from './types';

const AT = '2026-01-01T00:00Z';
let line = 2;

function rec(source: 'logten' | 'foreflight', over: Partial<SourceRecord> = {}): SourceRecord {
  const n = line++;
  const base: SourceRecord = {
    source,
    line: n,
    raw: {},
    kind: 'flight',
    date: '2025-06-22',
    tail: 'N12345',
    from: 'KLAX',
    to: 'KMRY',
    clock: {},
    durations: { total: 90 },
    counts: {},
    approaches: [],
    people: [],
    custom: {},
    ...over,
  };
  // The raw row stands in for the file's cells: anything that changes the record changes it.
  if (over.raw === undefined) {
    const { raw, line: _line, ...content } = base;
    void raw;
    void _line;
    base.raw = { row: JSON.stringify(content) };
  }
  return base;
}
const A = (over: Partial<SourceRecord> = {}) => rec('logten', over);
const B = (over: Partial<SourceRecord> = {}) => rec('foreflight', over);

function run(a: SourceRecord[], b: SourceRecord[], decisions: Decision[] = []): Resolution {
  return resolve(matchRecords(a, b), decisions);
}

const bulk = (
  pattern: BulkDecision['pattern'],
  choice: BulkDecision['choice'],
  field?: string,
): BulkDecision => ({ kind: 'bulk', pattern, choice, decidedAt: AT, ...(field ? { field } : {}) });

/** A pair decision for the only pair of `r`, choosing `fields`. */
function decide(r: Resolution, fields: Parameters<typeof amendPairDecision>[1]['fields']) {
  return amendPairDecision(r.pairs[0]!, { fields }, AT);
}

describe('fingerprintRecords', () => {
  it('is the same for the same cells whatever the line, and differs when a cell differs', () => {
    const x = A({ raw: { Date: '2025-06-22', Total: '1.5' }, line: 5 });
    const y = A({ raw: { Total: '1.5', Date: '2025-06-22' }, line: 99 });
    const z = A({ raw: { Date: '2025-06-22', Total: '1.6' } });
    expect(fingerprintRecords([x]).get(x)).toBe(fingerprintRecords([y]).get(y));
    expect(fingerprintRecords([x]).get(x)).not.toBe(fingerprintRecords([z]).get(z));
  });

  it('differs between sources and between cell boundaries', () => {
    const x = A({ raw: { k: 'ab', l: 'c' } });
    const y = A({ raw: { k: 'a', l: 'bc' } });
    const other = B({ raw: { k: 'ab', l: 'c' } });
    const fp = fingerprintRecords([x, y, other]);
    expect(new Set(fp.values()).size).toBe(3);
  });

  it('numbers identical rows in line order, regardless of input order', () => {
    const first = A({ raw: { k: 'v' }, line: 10 });
    const second = A({ raw: { k: 'v' }, line: 20 });
    const fp = fingerprintRecords([second, first]);
    expect(fp.get(second)).toBe(`${fp.get(first)}#2`);
  });
});

describe('decision helpers', () => {
  it('keys decisions by what they are about', () => {
    const pair: PairDecision = { kind: 'pair', a: 'x', b: 'y', fields: {}, decidedAt: AT };
    const orphan: OrphanDecision = {
      kind: 'orphan',
      side: 'b',
      record: 'y',
      action: 'keep',
      decidedAt: AT,
    };
    expect(decisionKey(pair)).toBe('pair:x|y');
    expect(decisionKey(orphan)).toBe('orphan:b:y');
    expect(decisionKey(bulk('rounding', 'more-precise'))).toBe('bulk:rounding:*');
    expect(decisionKey(bulk('rounding', 'a', 'durations.total'))).toBe(
      'bulk:rounding:durations.total',
    );
  });

  it('groups the landing counts into one decision field', () => {
    expect(decisionField('counts.allLandings')).toBe('landings');
    expect(decisionField('counts.nightLandings')).toBe('landings');
    expect(decisionField('counts.dayTakeoffs')).toBe('counts.dayTakeoffs');
    expect(decisionField('durations.night')).toBe('durations.night');
  });
});

describe('resolve: nothing decided', () => {
  it('leaves identical pairs with nothing open', () => {
    const r = run([A()], [B()]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.match).toBe('exact');
    expect(r.pairs[0]!.fields).toEqual([]);
    expect(r.open).toEqual({ matches: 0, fields: 0, orphans: 0 });
    expect(r.stale).toEqual([]);
  });

  it('reports a real difference as open and provisionally shows side a', () => {
    const r = run(
      [A({ durations: { total: 90, night: 30 } })],
      [B({ durations: { total: 90, night: 12 } })],
    );
    const p = r.pairs[0]!;
    expect(p.fields).toHaveLength(1);
    expect(p.fields[0]).toMatchObject({ field: 'durations.night', class: 'real', by: 'undecided' });
    expect(p.fields[0]!.choice).toBeUndefined();
    expect(p.record.durations.night).toBe(30);
    expect(r.open.fields).toBe(1);
  });

  it('does not settle systematic differences without a rule', () => {
    const r = run([A({ durations: { total: 77 } })], [B({ durations: { total: 78 } })]);
    expect(r.pairs[0]!.fields[0]).toMatchObject({ pattern: 'rounding', by: 'undecided' });
    expect(r.open.fields).toBe(1);
  });

  it('settles equivalent differences itself, keeping the side that says more', () => {
    const r = run(
      [A({ counts: {}, approaches: [{ type: 'ILS', airport: 'KMRY' }] })],
      [B({ counts: { holds: 0 }, approaches: [{ type: 'ILS', runway: '10R', airport: 'KMRY' }] })],
    );
    const p = r.pairs[0]!;
    expect(p.fields.map((f) => f.by)).toEqual(['equivalent', 'equivalent']);
    expect(p.record.counts.holds).toBe(0);
    expect(p.record.approaches[0]!.runway).toBe('10R');
    expect(r.open.fields).toBe(0);
  });

  it('keeps the fuller crew list when the two apps list the same people', () => {
    const more = [
      { name: 'Example; Pat', role: 'PIC' as const },
      { name: 'Example; Pat', role: 'instructor' as const },
    ];
    const fewer = [{ name: 'Pat Example', role: 'instructor' as const }];
    const r = run([A({ people: fewer })], [B({ people: more })]);
    expect(r.pairs[0]!.fields[0]).toMatchObject({ field: 'people', by: 'equivalent' });
    expect(r.pairs[0]!.record.people).toEqual(more);
    expect(run([A({ people: more })], [B({ people: fewer })]).pairs[0]!.record.people).toEqual(
      more,
    );
    expect(r.open.fields).toBe(0);
  });

  it('never changes the input records', () => {
    const a = A({ durations: { total: 77 }, people: [{ name: 'Example; Pat', role: 'SIC' }] });
    const b = B({ durations: { total: 78 }, tail: 'N999' });
    const before = JSON.stringify([a, b]);
    const r = run([a], [b], [bulk('rounding', 'b')]);
    expect(r.pairs[0]!.record).not.toBe(a);
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('keeps side a’s identity on the merged record', () => {
    const a = A();
    const r = run([a], [B()]);
    expect(r.pairs[0]!.record).toMatchObject({ source: 'logten', line: a.line, raw: a.raw });
    expect(r.pairs[0]!.entryId).toBe(`main:${r.pairs[0]!.fa}`);
  });
});

describe('resolve: bulk rules', () => {
  const a = () => A({ durations: { total: 77, night: 77 } });
  const b = () => B({ durations: { total: 78, night: 78 } });

  it('keeps the more precise value for rounding', () => {
    const r = run([a()], [b()], [bulk('rounding', 'more-precise')]);
    expect(r.pairs[0]!.record.durations).toEqual({ total: 77, night: 77 });
    expect(r.pairs[0]!.fields.every((f) => f.by === 'bulk' && f.choice === 'a')).toBe(true);
    expect(r.open.fields).toBe(0);

    const swapped = run(
      [A({ durations: { total: 78 } })],
      [B({ durations: { total: 77 } })],
      [bulk('rounding', 'more-precise')],
    );
    expect(swapped.pairs[0]!.record.durations.total).toBe(77);
    expect(swapped.pairs[0]!.fields[0]!.choice).toBe('b');
  });

  it('lets a field’s rule win over the pattern’s rule', () => {
    const r = run([a()], [b()], [bulk('rounding', 'a'), bulk('rounding', 'b', 'durations.night')]);
    expect(r.pairs[0]!.record.durations).toEqual({ total: 77, night: 78 });
  });

  it('limits a field rule to its field', () => {
    const r = run([a()], [b()], [bulk('rounding', 'b', 'durations.night')]);
    expect(r.pairs[0]!.record.durations).toEqual({ total: 77, night: 78 });
    expect(r.open.fields).toBe(1);
  });

  it('takes the side that has a value for missing-a and missing-b', () => {
    const r = run(
      [A({ flightNumber: '3412', clock: {} })],
      [B({ clock: { out: 900 } })],
      [bulk('missing-a', 'present'), bulk('missing-b', 'present')],
    );
    const p = r.pairs[0]!;
    expect(p.record.flightNumber).toBe('3412');
    expect(p.record.clock.out).toBe(900);
    expect(r.open.fields).toBe(0);
  });

  it('can keep the blank side', () => {
    const r = run([A()], [B({ rule: '121' })], [bulk('missing-a', 'a')]);
    expect(r.pairs[0]!.record.rule).toBeUndefined();
    expect(r.open.fields).toBe(0);
  });

  it('ignores a rule that makes no sense for its pattern', () => {
    const r = run(
      [A()],
      [B({ rule: '121' })],
      [bulk('missing-a', 'more-precise'), bulk('rounding', 'present')],
    );
    expect(r.open.fields).toBe(1);
  });

  it('does not apply to real differences', () => {
    const r = run(
      [A()],
      [B({ tail: 'N999' })],
      [bulk('rounding', 'a'), bulk('missing-a', 'present')],
    );
    expect(r.open.fields).toBe(1);
  });

  it('settles real differences only through a rule that names the field', () => {
    const x = () => A({ remarks: 'one', people: [{ name: 'Pat Example', role: 'SIC' }] });
    const y = () => B({ remarks: 'two', people: [{ name: 'Sam Sample', role: 'SIC' }] });
    const r = run([x()], [y()], [bulk('real', 'both', 'remarks'), bulk('real', 'b', 'people')]);
    expect(r.pairs[0]!.record.remarks).toBe('one\ntwo');
    expect(r.pairs[0]!.record.people).toEqual([{ name: 'Sam Sample', role: 'SIC' }]);
    expect(r.pairs[0]!.fields.map((f) => f.by)).toEqual(['bulk', 'bulk']);

    expect(run([x()], [y()], [bulk('real', 'a')]).open.fields).toBe(2);
    expect(run([A()], [B({ tail: 'N999' })], [bulk('real', 'both', 'tail')]).open.fields).toBe(1);
  });

  it('is never reported stale', () => {
    expect(run([A()], [B()], [bulk('rounding', 'a')]).stale).toEqual([]);
  });
});

describe('resolve: pair decisions', () => {
  const a = () =>
    A({
      durations: { total: 90, night: 30 },
      clock: { out: 900 },
      remarks: 'Pattern work',
      people: [{ name: 'Example; Pat', role: 'PIC' }],
    });
  const b = () =>
    B({
      durations: { total: 90, night: 12 },
      clock: { out: 908 },
      remarks: 'Night currency',
      people: [
        { name: 'Pat Example', role: 'PIC' },
        { name: 'Sample, Sam', role: 'observer' },
      ],
    });

  it('applies a side, a typed value and both', () => {
    const first = run([a()], [b()]);
    expect(first.open.fields).toBe(4);
    const d = decide(first, {
      'durations.night': 'b',
      'clock.out': { value: 905 },
      people: 'both',
      remarks: 'both',
    });
    const r = run([first.pairs[0]!.a], [first.pairs[0]!.b], [d]);
    const p = r.pairs[0]!;
    expect(p.record.durations.night).toBe(12);
    expect(p.record.clock.out).toBe(905);
    expect(p.record.people).toEqual([
      { name: 'Example; Pat', role: 'PIC' },
      { name: 'Sample, Sam', role: 'observer' },
    ]);
    expect(p.record.remarks).toBe('Pattern work\nNight currency');
    expect(p.fields.every((f) => f.by === 'pair')).toBe(true);
    expect(p.decision).toBe(d);
    expect(r.open.fields).toBe(0);
    expect(r.stale).toEqual([]);
  });

  it('wins over a bulk rule, and can override an equivalent difference', () => {
    const x = A({ durations: { total: 77 }, route: 'KLAX KMRY' });
    const y = B({ durations: { total: 78 }, route: 'klax  kmry' });
    const first = run([x], [y]);
    const d = decide(first, { 'durations.total': 'b', route: 'b' });
    const r = run([x], [y], [bulk('rounding', 'more-precise'), d]);
    expect(r.pairs[0]!.record.durations.total).toBe(78);
    expect(r.pairs[0]!.record.route).toBe('klax  kmry');
  });

  it('takes every landing count from the chosen side', () => {
    const x = A({
      counts: {
        dayLandings: 3,
        nightLandings: 1,
        fullStopLandings: 2,
        touchAndGoes: 2,
        dayTakeoffs: 3,
      },
    });
    const y = B({ counts: { dayFullStopLandings: 1, nightFullStopLandings: 0, allLandings: 3 } });
    const first = run([x], [y]);
    const landings = first.pairs[0]!.fields.find((f) => f.field === 'landings')!;
    expect(landings.diffs.length).toBeGreaterThan(1);
    expect(landings.class).toBe('real');
    const r = run([x], [y], [decide(first, { landings: 'b' })]);
    expect(r.pairs[0]!.record.counts).toEqual({
      dayFullStopLandings: 1,
      nightFullStopLandings: 0,
      allLandings: 3,
      dayTakeoffs: 3,
    });
  });

  it('takes approaches as a whole list and clears a field the chosen side lacks', () => {
    const x = A({ approaches: [{ type: 'ILS', runway: '10R' }], flightNumber: '3412' });
    const y = B({ approaches: [] });
    const first = run([x], [y]);
    const r = run([x], [y], [decide(first, { approaches: 'b', flightNumber: 'b' })]);
    expect(r.pairs[0]!.record.approaches).toEqual([]);
    expect(r.pairs[0]!.record.flightNumber).toBeUndefined();
    expect('flightNumber' in r.pairs[0]!.record).toBe(false);
  });

  it.each([
    ['tail', { value: ' n768sk ' }, (r: SourceRecord) => r.tail, 'N768SK'],
    ['date', { value: '2025-06-23' }, (r: SourceRecord) => r.date, '2025-06-23'],
    ['rule', { value: '121' }, (r: SourceRecord) => r.rule, '121'],
    ['pilotFlying', { value: true }, (r: SourceRecord) => r.pilotFlying, true],
    ['counts.dayTakeoffs', { value: 2 }, (r: SourceRecord) => r.counts.dayTakeoffs, 2],
    ['custom.passengerCount', { value: 50 }, (r: SourceRecord) => r.custom.passengerCount, 50],
    ['remarks', { value: '' }, (r: SourceRecord) => r.remarks, undefined],
  ] as const)('accepts a typed %s', (field, choice, read, expected) => {
    const x = A({
      rule: '91',
      pilotFlying: false,
      counts: { dayTakeoffs: 1 },
      custom: { passengerCount: 40 },
      remarks: 'one',
    });
    const y = B({
      tail: 'N999',
      date: '2025-06-23',
      rule: '135',
      pilotFlying: true,
      counts: { dayTakeoffs: 3 },
      custom: { passengerCount: 60 },
      remarks: 'two',
      clock: {},
    });
    const first = resolve({ pairs: [{ a: x, b: y, tier: 'exact' }], onlyA: [], onlyB: [] }, []);
    const d = decide(first, { [field]: choice });
    const r = resolve({ pairs: [{ a: x, b: y, tier: 'exact' }], onlyA: [], onlyB: [] }, [d]);
    expect(read(r.pairs[0]!.record)).toBe(expected);
    expect(r.pairs[0]!.fields.find((f) => f.field === field)!.by).toBe('pair');
  });

  it.each([
    ['clock.out', { value: 1440 }],
    ['clock.out', { value: '09:00' }],
    ['durations.night', { value: -1 }],
    ['durations.night', { value: 1.5 }],
    ['date', { value: '22 June' }],
    ['rule', { value: '61' }],
    ['tail', { value: '  ' }],
    ['pilotFlying', { value: 'yes' }],
    ['landings', { value: 3 }],
    ['approaches', { value: 'ILS' }],
    ['people', { value: 'Pat' }],
    ['kind', { value: 'ground' }],
    ['durations.night', 'both'],
  ] as const)('leaves %s open when the choice %j is not valid for it', (field, choice) => {
    const x = A({
      durations: { total: 90, night: 30 },
      clock: { out: 900 },
      rule: '91',
      pilotFlying: false,
      counts: { dayLandings: 1 },
      approaches: [{ type: 'ILS' }],
      people: [{ name: 'Pat Example', role: 'PIC' }],
    });
    const y = B({
      kind: 'simulator',
      tail: 'N999',
      date: '2025-06-23',
      durations: { total: 90, night: 12 },
      clock: { out: 908 },
      rule: '135',
      pilotFlying: true,
      counts: { dayLandings: 2 },
      approaches: [{ type: 'VOR' }],
      people: [{ name: 'Sam Sample', role: 'PIC' }],
    });
    const m = { pairs: [{ a: x, b: y, tier: 'exact' as const }], onlyA: [], onlyB: [] };
    const first = resolve(m, []);
    const r = resolve(m, [decide(first, { [field]: choice })]);
    expect(r.pairs[0]!.fields.find((f) => f.field === field)!.by).toBe('undecided');
    expect(r.open.fields).toBe(first.open.fields);
  });

  it('uses the latest of two decisions for the same pair', () => {
    const x = A({ durations: { total: 90, night: 30 } });
    const y = B({ durations: { total: 90, night: 12 } });
    const first = run([x], [y]);
    const r = run(
      [x],
      [y],
      [decide(first, { 'durations.night': 'a' }), decide(first, { 'durations.night': 'b' })],
    );
    expect(r.pairs[0]!.record.durations.night).toBe(12);
  });
});

describe('resolve: replaying decisions on a newer export', () => {
  const night = (n: number, extra: Partial<SourceRecord> = {}) => ({
    durations: { total: 90, night: n },
    ...extra,
  });

  it('replays when both rows are unchanged, whatever their line numbers', () => {
    const first = run([A(night(30))], [B(night(12))]);
    const d = decide(first, { 'durations.night': 'b' });
    const r = run(
      [A({ date: '2024-01-01' }), A(night(30))],
      [B({ date: '2024-01-01' }), B(night(12))],
      [d],
    );
    expect(r.pairs[1]!.record.durations.night).toBe(12);
    expect(r.open.fields).toBe(0);
    expect(r.stale).toEqual([]);
  });

  it('keeps decisions about untouched fields when one row was edited', () => {
    const first = run([A(night(30))], [B(night(12, { tail: 'N999' }))]);
    expect(first.pairs[0]!.tier).toBe('tail-differs');
    const d = amendPairDecision(
      first.pairs[0]!,
      { match: 'confirmed', fields: { 'durations.night': 'b', tail: 'a' } },
      AT,
    );
    // The pilot fixes the tail in app b; night still disagrees in the same way.
    const r = run([A(night(30))], [B(night(12))], [d]);
    const p = r.pairs[0]!;
    expect(p.fields).toHaveLength(1);
    expect(p.fields[0]).toMatchObject({ field: 'durations.night', by: 'pair', choice: 'b' });
    expect(p.decision).toBe(d);
    expect(r.stale).toEqual([]);
  });

  it('asks again about a field whose values changed', () => {
    const first = run([A(night(30))], [B(night(12))]);
    const d = decide(first, { 'durations.night': 'b' });
    const r = run([A(night(30))], [B(night(18))], [d]);
    expect(r.pairs[0]!.fields[0]!.by).toBe('undecided');
    expect(r.pairs[0]!.record.durations.night).toBe(30);
    expect(r.pairs[0]!.decision).toBeUndefined();
    expect(r.stale).toEqual([d]);
  });

  it('does not borrow a decision whose own partner row still exists', () => {
    const a1 = A(night(30));
    const b1 = B(night(12));
    const first = run([a1], [b1]);
    const d = decide(first, { 'durations.night': 'b' });
    // Same a row now sits beside a different b row, while b1 is still in the file.
    const b2 = B(night(12, { remarks: 'x' }));
    const r = resolve({ pairs: [{ a: a1, b: b2, tier: 'exact' }], onlyA: [], onlyB: [b1] }, [d]);
    expect(r.pairs[0]!.fields.find((f) => f.field === 'durations.night')!.by).toBe('undecided');
  });

  it('reports decisions about rows that are gone as stale', () => {
    const first = run([A(night(30))], [B(night(12))]);
    const d = decide(first, { 'durations.night': 'b' });
    const r = run([A({ date: '2020-01-01' })], [B({ date: '2020-01-01' })], [d]);
    expect(r.stale).toEqual([d]);
  });

  it('re-keys an inherited decision when it is amended', () => {
    const first = run([A(night(30))], [B(night(12, { tail: 'N999' }))]);
    const d = amendPairDecision(
      first.pairs[0]!,
      { match: 'confirmed', fields: { 'durations.night': 'b', tail: 'a' } },
      AT,
    );
    const second = run([A(night(30, { remarks: 'x' }))], [B(night(12, { tail: 'N999' }))], [d]);
    const p = second.pairs[0]!;
    expect(p.decision).toBe(d);
    const amended = amendPairDecision(p, { fields: { remarks: 'a', tail: undefined } }, AT);
    expect(amended).toMatchObject({ a: p.fa, b: p.fb, match: 'confirmed' });
    expect(Object.keys(amended.fields).sort()).toEqual(['durations.night', 'remarks']);
    expect(amended.fields.remarks!.seen).toBe(
      diffSignature(p.fields.find((f) => f.field === 'remarks')!.diffs),
    );
    expect(amendPairDecision(p, { match: null }, AT).match).toBeUndefined();
  });
});

describe('resolve: pairing', () => {
  it('asks for confirmation of anything below an exact match', () => {
    const x = A();
    const y = B({ tail: 'N999' });
    const first = run([x], [y]);
    expect(first.pairs[0]!).toMatchObject({ tier: 'tail-differs', match: 'unconfirmed' });
    expect(first.open.matches).toBe(1);

    const d = amendPairDecision(first.pairs[0]!, { match: 'confirmed' }, AT);
    const r = run([x], [y], [d]);
    expect(r.pairs[0]!.match).toBe('confirmed');
    expect(r.open.matches).toBe(0);
    expect(r.stale).toEqual([]);
  });

  it('splits a rejected pair into two orphans', () => {
    const x = A();
    const y = B({ tail: 'N999' });
    const first = run([x], [y]);
    const d = amendPairDecision(first.pairs[0]!, { match: 'rejected' }, AT);
    const r = run([x], [y], [d]);
    expect(r.pairs).toEqual([]);
    expect(r.orphans.map((o) => [o.side, o.record, o.action])).toEqual([
      ['a', x, 'undecided'],
      ['b', y, 'undecided'],
    ]);
    expect(r.open).toEqual({ matches: 0, fields: 0, orphans: 2 });
    expect(r.stale).toEqual([]);
  });

  it('pairs two orphans by hand', () => {
    const x = A({ date: '2025-01-01', tail: 'N1', from: 'KAAA', to: 'KBBB' });
    const y = B({ date: '2025-03-09', tail: 'N2', from: 'KCCC', to: 'KDDD' });
    const first = run([x], [y]);
    expect(first.pairs).toEqual([]);
    const d: PairDecision = {
      kind: 'pair',
      a: first.orphans[0]!.fingerprint,
      b: first.orphans[1]!.fingerprint,
      match: 'manual',
      fields: {},
      decidedAt: AT,
    };
    const r = run([x], [y], [d]);
    expect(r.orphans).toEqual([]);
    expect(r.pairs[0]!).toMatchObject({ a: x, b: y, tier: 'manual', match: 'manual' });
    expect(r.open.matches).toBe(0);
    expect(r.open.fields).toBeGreaterThan(0);
    expect(r.stale).toEqual([]);
  });

  it('frees the previous partner when a hand-made pair takes a matched row', () => {
    const x1 = A({ date: '2025-01-01' });
    const x2 = A({ date: '2025-02-02', tail: 'N2' });
    const y1 = B({ date: '2025-01-01' });
    const first = run([x1, x2], [y1]);
    expect(first.pairs.map((p) => p.a)).toEqual([x1]);
    const fx2 = first.orphans[0]!.fingerprint;
    const d: PairDecision = {
      kind: 'pair',
      a: fx2,
      b: first.pairs[0]!.fb,
      match: 'manual',
      fields: {},
      decidedAt: AT,
    };
    const r = run([x1, x2], [y1], [d]);
    expect(r.pairs.map((p) => [p.a, p.b])).toEqual([[x2, y1]]);
    expect(r.orphans.map((o) => o.record)).toEqual([x1]);
  });

  it('treats a hand-made pair the matcher also finds as confirmed', () => {
    const x = A();
    const y = B({ tail: 'N999' });
    const first = run([x], [y]);
    const d = amendPairDecision(first.pairs[0]!, { match: 'manual' }, AT);
    const r = run([x], [y], [d]);
    expect(r.pairs[0]!).toMatchObject({ tier: 'tail-differs', match: 'confirmed' });
  });
});

describe('resolve: orphans', () => {
  const sim = () => B({ kind: 'simulator', tail: 'FTD1', from: undefined, to: undefined });

  it('lists unmatched rows as open, side a first, in file order', () => {
    const y2 = sim();
    const y1 = B({ kind: 'simulator', tail: 'FTD2', date: '2020-01-01', line: 1 });
    const x = A({ kind: 'ground', tail: undefined, date: '2019-01-01' });
    const r = run([x], [y2, y1]);
    expect(r.orphans.map((o) => [o.side, o.record])).toEqual([
      ['a', x],
      ['b', y1],
      ['b', y2],
    ]);
    expect(r.orphans.every((o) => o.action === 'undecided')).toBe(true);
    expect(r.open.orphans).toBe(3);
    expect(r.orphans[1]!.entryId).toBe(`main:${r.orphans[1]!.fingerprint}`);
  });

  it('applies keep and drop, and reports a decision about a row that is now matched as stale', () => {
    const y = sim();
    const first = run([], [y]);
    const fp = first.orphans[0]!.fingerprint;
    const keep: OrphanDecision = {
      kind: 'orphan',
      side: 'b',
      record: fp,
      action: 'keep',
      decidedAt: AT,
    };
    const drop: OrphanDecision = { ...keep, action: 'drop' };
    expect(run([], [y], [keep]).orphans[0]!.action).toBe('keep');
    expect(run([], [y], [keep]).open.orphans).toBe(0);
    expect(run([], [y], [keep, drop]).orphans[0]!.action).toBe('drop');

    const wrongSide: OrphanDecision = { ...keep, side: 'a' };
    const r = run([], [y], [wrongSide]);
    expect(r.orphans[0]!.action).toBe('undecided');
    expect(r.stale).toEqual([wrongSide]);
  });
});
