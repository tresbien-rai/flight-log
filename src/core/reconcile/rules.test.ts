import { describe, expect, it } from 'vitest';
import type { SourceAircraft, SourceRecord } from '../importers';
import { matchRecords } from './match';
import { toMergedLogbook } from './merge';
import { decisionKey, resolve } from './resolve';
import { proposeRules, ruleDecisions } from './rules';
import type { Decision } from './types';

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
    tail: 'N1',
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
  const { raw, line: _line, ...content } = base;
  void raw;
  void _line;
  base.raw = { row: JSON.stringify(content) };
  return base;
}

const aircraft: SourceAircraft[] = [
  { tail: 'N1', typeCode: 'C172', engine: 'piston' },
  { tail: 'N7', typeCode: 'CRJ7', engine: 'turbofan' },
  { tail: 'N2', typeCode: 'CRJ2', engine: 'turbofan' },
  { tail: 'SIM', deviceLevel: 'FTD' },
];
const sources = {
  a: { source: 'logten' as const, aircraft },
  b: { source: 'foreflight' as const, aircraft },
};

/** The same flight in both apps. */
function both(over: Partial<SourceRecord>): [SourceRecord, SourceRecord] {
  return [rec('logten', over), rec('foreflight', over)];
}
const leg = (date: string, tail: string, over: Partial<SourceRecord> = {}) =>
  both({
    date,
    tail,
    flightNumber: '3412',
    durations: { total: 90, sic: 90 },
    people: [{ name: 'Robin Captain', role: 'PIC' }],
    ...over,
  });

function run(
  pairs: [SourceRecord, SourceRecord][],
  onlyB: SourceRecord[] = [],
  d: Decision[] = [],
) {
  return resolve(
    matchRecords(
      pairs.map((p) => p[0]),
      [...pairs.map((p) => p[1]), ...onlyB],
    ),
    d,
  );
}

describe('rule status in resolve', () => {
  it('is stated when an app says it, open on an unmarked flight, none off a flight', () => {
    const sim = rec('foreflight', { kind: 'simulator', tail: 'SIM', date: '2025-01-01' });
    const r = run([both({ rule: '121' }), both({ date: '2025-06-23' })], [sim]);
    expect(r.pairs.map((p) => p.rule)).toEqual(['stated', 'open']);
    expect(r.orphans.map((o) => o.rule)).toEqual(['none']);
    expect(r.openRules).toBe(1);
  });

  it('does not ask for a rule that one app states while that difference is still open', () => {
    const match = {
      pairs: [
        { a: rec('logten', {}), b: rec('foreflight', { rule: '121' }), tier: 'exact' as const },
      ],
      onlyA: [],
      onlyB: [],
    };
    const r = resolve(match, []);
    expect(r.pairs[0]!.rule).toBe('stated');
    expect(r.openRules).toBe(0);
    expect(r.open.fields).toBe(1);
    expect(proposeRules(r, sources)).toEqual([]);
  });

  it('applies a rule decision to the merged record only, and counts it used', () => {
    const pair = both({});
    const first = run([pair]);
    const d = ruleDecisions([first.pairs[0]!.fa], '121', AT);
    expect(decisionKey(d[0]!)).toBe(`rule:${first.pairs[0]!.fa}`);
    const r = run([pair], [], d);
    expect(r.pairs[0]!).toMatchObject({ rule: 'decided', record: { rule: '121' } });
    expect(pair[0].rule).toBeUndefined();
    expect(r.openRules).toBe(0);
    expect(r.stale).toEqual([]);
  });

  it('leaves a rule decision unused, and stale, once an app states the rule', () => {
    const match = {
      pairs: [
        { a: rec('logten', {}), b: rec('foreflight', { rule: '121' }), tier: 'exact' as const },
      ],
      onlyA: [],
      onlyB: [],
    };
    const fa = resolve(match, []).pairs[0]!.fa;
    const r = resolve(match, [
      { kind: 'bulk', pattern: 'missing-a', choice: 'present', decidedAt: AT },
      ...ruleDecisions([fa], '91', AT),
    ]);
    expect(r.pairs[0]!).toMatchObject({ rule: 'stated', record: { rule: '121' } });
    expect(r.stale).toHaveLength(1);
  });

  it('covers one-app-only flights that are kept, without touching the source row', () => {
    const only = rec('foreflight', { date: '2024-02-02', tail: 'N2' });
    const first = run([], [only]);
    expect(first.orphans[0]!.rule).toBe('open');
    const fp = first.orphans[0]!.fingerprint;
    const decided = run([], [only], ruleDecisions([fp], '135', AT));
    expect(decided.orphans[0]!).toMatchObject({ rule: 'decided', record: { rule: '135' } });
    expect(only.rule).toBeUndefined();
    const dropped = run(
      [],
      [only],
      [{ kind: 'orphan', side: 'b', record: fp, action: 'drop', decidedAt: AT }],
    );
    expect(dropped.orphans[0]!.rule).toBe('none');
    expect(dropped.openRules).toBe(0);
  });

  it('reaches the merged logbook', () => {
    const pair = both({});
    const first = run([pair]);
    const decided = run([pair], [], ruleDecisions([first.pairs[0]!.fa], '135', AT));
    expect(toMergedLogbook(decided, sources).logbook.entries[0]!.rule).toBe('135');
    expect(toMergedLogbook(first, sources).logbook.entries[0]!.rule).toBe('91');
  });
});

describe('proposeRules', () => {
  const pairs = [
    leg('2023-01-05', 'N7'),
    leg('2022-12-02', 'N7'),
    leg('2023-02-01', 'N2', { people: [] }),
    both({ date: '2019-05-01', durations: { total: 60, pic: 60, dualGiven: 60 } }),
    both({ date: '2018-05-01' }),
    // Marked already: never proposed.
    leg('2024-01-01', 'N7', { rule: '121' }),
    // A jet with no airline evidence: not assumed to be an airline leg.
    both({ date: '2021-03-03', tail: 'N7' }),
    // A jet leg as captain: no SIC time, but a first officer is named.
    leg('2023-03-03', 'N7', {
      durations: { total: 90, pic: 90 },
      people: [{ name: 'Fran First', role: 'SIC' }],
    }),
    // Flight number and SIC time in a piston: not an airline leg.
    leg('2020-01-01', 'N1'),
    both({ date: '2017-01-01', tail: 'N999' }),
  ];
  const sim = rec('foreflight', { kind: 'simulator', tail: 'SIM', date: '2025-01-01' });
  const resolution = run(pairs, [sim]);
  const proposals = proposeRules(resolution, sources);

  it('groups unmarked flights by evidence, airline legs first, in date order', () => {
    expect(proposals.map((p) => [p.id, p.basis, p.entries.length, p.from, p.to])).toEqual([
      ['121:CRJ7', 'airline', 3, '2022-12-02', '2023-03-03'],
      ['121:CRJ2', 'airline', 1, '2023-02-01', '2023-02-01'],
      ['91:no aircraft', 'general', 1, '2017-01-01', '2017-01-01'],
      ['91:piston', 'general', 3, '2018-05-01', '2020-01-01'],
      ['91:turbine', 'general', 1, '2021-03-03', '2021-03-03'],
    ]);
    expect(proposals[0]!.evidence).toEqual({ flightNumber: 3, sicTime: 2, crewNamed: 3 });
    expect(proposals[1]!.evidence).toEqual({ flightNumber: 1, sicTime: 1, crewNamed: 0 });
  });

  it('covers every open flight exactly once', () => {
    const all = proposals.flatMap((p) => p.entries);
    expect(all).toHaveLength(resolution.openRules);
    expect(new Set(all).size).toBe(all.length);
    expect(proposals.flatMap((p) => p.entryIds)).toHaveLength(all.length);
  });

  it('proposes nothing once every group is confirmed, and a different rule may be chosen', () => {
    const decisions = proposals.flatMap((p) =>
      ruleDecisions(p.entries, p.id === '91:turbine' ? 'other' : p.rule, AT),
    );
    const after = run(pairs, [sim], decisions);
    expect(after.openRules).toBe(0);
    expect(proposeRules(after, sources)).toEqual([]);
    const rules = after.pairs.map((p) => p.record.rule);
    expect(rules.filter((r) => r === '121')).toHaveLength(5);
    expect(rules.filter((r) => r === 'other')).toHaveLength(1);
    expect(after.stale).toEqual([]);
  });
});
