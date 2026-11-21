import foreflightText from '../../../fixtures/pair/foreflight.csv?raw';
import logtenText from '../../../fixtures/pair/logten.txt?raw';
import { describe, expect, it } from 'vitest';
import { COLUMN_PRESETS, importForeFlight, importLogTen } from '@core/importers';
import { matchRecords, proposeRules, resolve, ruleDecisions, type Decision } from '@core/reconcile';
import {
  auditItems,
  auditTotals,
  decidedRules,
  proposalReason,
  proposalTitle,
  displayTyped,
  displayValue,
  fieldLabel,
  findBulk,
  isOpen,
  parseTyped,
  routeText,
  ruleStats,
  typedKind,
} from './audit';

const a = importLogTen(logtenText, {
  columns: COLUMN_PRESETS.logten,
});
const b = importForeFlight(foreflightText, {
  columns: COLUMN_PRESETS.foreflight,
});
const match = matchRecords(a.records, b.records);
const AT = '2026-01-01T00:00Z';
const rounding: Decision = {
  kind: 'bulk',
  pattern: 'rounding',
  choice: 'more-precise',
  decidedAt: AT,
};

describe('labels and values', () => {
  it('names fields for people', () => {
    expect(fieldLabel('durations.night')).toBe('Night');
    expect(fieldLabel('landings')).toBe('Landings');
    expect(fieldLabel('custom.somethingNew')).toBe('somethingNew');
  });

  it('shows each kind of value', () => {
    const night = a.records[1]!;
    expect(displayValue(night, 'durations.night')).toBe('0.80');
    expect(displayValue(night, 'durations.solo')).toBe('—');
    expect(displayValue(night, 'tail')).toBe('N101AB');
    expect(displayValue(night, 'rule')).toBe('—');
    expect(displayValue(night, 'landings')).toBe('day 1');
    expect(displayValue(night, 'approaches')).toBe('—');
    expect(displayValue(night, 'people')).toBe('—');
    expect(displayValue(night, 'kind')).toBe('Flight');
    expect(displayValue(night, 'pilotFlying')).toBe('—');
    expect(displayValue(a.records[2]!, 'clock.out')).toBe('13:40Z');
    expect(displayValue(night, 'remarks')).toBe('Night differs.');
    expect(
      displayValue(
        {
          ...night,
          rule: '121',
          pilotFlying: true,
          approaches: [{ type: 'ILS', runway: '24R', airport: 'KBBB' }, { type: 'VISUAL' }],
          people: [{ name: 'Pat Example', role: 'PIC' }],
          custom: { passengerCount: 50, dualGivenPPL: 90, flag: true },
        },
        'approaches',
      ),
    ).toBe('ILS 24R KBBB, VISUAL');
    const rich = {
      ...night,
      rule: '121' as const,
      pilotFlying: true,
      people: [{ name: 'Pat Example', role: 'PIC' as const }],
      custom: { passengerCount: 50, dualGivenPPL: 90, flag: true },
    };
    expect(displayValue(rich, 'rule')).toBe('Part 121');
    expect(displayValue(rich, 'pilotFlying')).toBe('Yes');
    expect(displayValue(rich, 'people')).toBe('Example, Pat (PIC)');
    expect(displayValue(rich, 'people', 'given-first')).toBe('Pat Example (PIC)');
    expect(displayValue(rich, 'custom.passengerCount')).toBe('50');
    expect(displayValue(rich, 'custom.dualGivenPPL')).toBe('1.50');
    expect(displayValue(rich, 'custom.flag')).toBe('Yes');
  });

  it('describes a route', () => {
    expect(routeText(a.records[0]!)).toBe('KAAA → KBBB');
    expect(routeText({ ...a.records[0]!, localFlight: true, to: undefined })).toBe('KAAA local');
    expect(routeText(b.records[4]!)).toBe('Simulator session');
  });
});

describe('typed values', () => {
  it('knows what may be typed for a field', () => {
    expect(typedKind('durations.night')).toBe('hours');
    expect(typedKind('clock.out')).toBe('clock');
    expect(typedKind('counts.holds')).toBe('count');
    expect(typedKind('custom.passengerCount')).toBe('count');
    expect(typedKind('custom.dualGivenIRA')).toBe('hours');
    expect(typedKind('custom.flag')).toBeUndefined();
    expect(typedKind('tail')).toBe('text');
    expect(typedKind('date')).toBe('date');
    for (const field of ['landings', 'approaches', 'people', 'rule', 'kind', 'pilotFlying']) {
      expect(typedKind(field)).toBeUndefined();
    }
  });

  it.each([
    ['durations.night', '1.5', 90],
    ['durations.night', '1:30', 90],
    ['durations.night', '0', 0],
    ['clock.out', '14:05', 845],
    ['clock.out', '1405z', 845],
    ['clock.out', '0:00', 0],
    ['counts.holds', '2', 2],
    ['date', '2024-02-29', '2024-02-29'],
    ['tail', ' N1 ', 'N1'],
    ['remarks', '', ''],
  ] as const)('parses %s "%s"', (field, text, expected) => {
    expect(parseTyped(field, text)).toBe(expected);
  });

  it.each([
    ['durations.night', ''],
    ['durations.night', 'abc'],
    ['durations.night', '-1'],
    ['clock.out', '24:00'],
    ['clock.out', '12:60'],
    ['clock.out', '5'],
    ['counts.holds', '1.5'],
    ['date', '2023-02-29'],
    ['date', '3/1/2024'],
    ['tail', '  '],
    ['landings', '3'],
  ] as const)('rejects %s "%s"', (field, text) => {
    expect(parseTyped(field, text)).toBeUndefined();
  });

  it('shows a typed value in the field’s own form', () => {
    expect(displayTyped('durations.night', 90)).toBe('1.50');
    expect(displayTyped('clock.out', 845)).toBe('14:05Z');
    expect(displayTyped('counts.holds', 2)).toBe('2');
    expect(displayTyped('remarks', '')).toBe('—');
    expect(displayTyped('pilotFlying', false)).toBe('No');
  });
});

describe('list, rules and totals', () => {
  it('lists what needs a look, in date order, and leaves out flights that agree', () => {
    const items = auditItems(resolve(match, []));
    expect(items.map((i) => [i.date, i.openFields, i.openItself])).toEqual([
      ['2024-03-01', ['durations.total', 'durations.pic'], false],
      ['2024-03-02', ['durations.night'], false],
      ['2024-03-04', ['tail', 'durations.total', 'durations.sic'], true],
      ['2024-03-10', [], true],
      ['2024-03-12', [], true],
    ]);
    expect(items.every(isOpen)).toBe(true);
    expect(items.every((i) => !i.touched)).toBe(true);
  });

  it('keeps a flight settled only by a rule in the list, but not as open or touched', () => {
    const items = auditItems(resolve(match, [rounding]));
    const first = items[0]!;
    expect(first.openFields).toEqual([]);
    expect(isOpen(first)).toBe(false);
    expect(first.touched).toBe(false);
  });

  it('counts what each rule would settle and does settle', () => {
    const before = ruleStats(resolve(match, []));
    expect(before.get('bulk:rounding:*')).toEqual({ open: 4, settled: 0 });
    expect(before.get('bulk:rounding:durations.total')).toEqual({ open: 2, settled: 0 });
    expect(before.get('bulk:real:tail')).toEqual({ open: 1, settled: 0 });
    const after = ruleStats(resolve(match, [rounding]));
    expect(after.get('bulk:rounding:*')).toEqual({ open: 0, settled: 4 });
  });

  it('finds a stored rule by pattern and field', () => {
    const fieldRule: Decision = {
      kind: 'bulk',
      pattern: 'real',
      field: 'route',
      choice: 'a',
      decidedAt: AT,
    };
    expect(findBulk([rounding, fieldRule], 'rounding')).toBe(rounding);
    expect(findBulk([rounding, fieldRule], 'real', 'route')).toBe(fieldRule);
    expect(findBulk([rounding, fieldRule], 'real', 'people')).toBeUndefined();
    expect(findBulk([fieldRule], 'rounding')).toBeUndefined();
  });

  it('totals each source and the merged logbook', () => {
    const rows = auditTotals(a.records, b.records, resolve(match, []));
    const row = (label: string) => rows.find((r) => r.label === label)!;
    expect(row('Flights')).toMatchObject({ a: '4', b: '4', merged: '4' });
    // 1.28 + 1.50 + 2.02 + 1.00 against 1.3 + 1.5 + 2.0 + 1.0; undecided fields show LogTen's.
    expect(row('Total time')).toMatchObject({ a: '5.8', b: '5.8', merged: '5.8' });
    expect(row('Night')).toMatchObject({ a: '0.8', b: '0.3', merged: '0.8' });
    expect(row('Simulator')).toMatchObject({ a: '0.0', b: '1.5', merged: '1.5' });
    expect(row('Landings')).toMatchObject({ a: '3', b: '3', merged: '3' });

    const dropSim = resolve(match, []).orphans.find((o) => o.side === 'b')!;
    const dropped = auditTotals(
      a.records,
      b.records,
      resolve(match, [
        { kind: 'orphan', side: 'b', record: dropSim.fingerprint, action: 'drop', decidedAt: AT },
      ]),
    );
    expect(dropped.find((r) => r.label === 'Simulator')!.merged).toBe('0.0');
  });
});

describe('operating rule', () => {
  const resolution = resolve(match, []);
  const proposals = proposeRules(resolution, { a, b });

  it('describes a proposal and its evidence', () => {
    expect(proposals.map(proposalTitle)).toEqual([
      '3 piston-engine flights, 1 Mar 2024 – 5 Mar 2024',
      '1 turbine flight, 4 Mar 2024',
    ]);
    expect(proposalReason(proposals[0]!)).toBe('Nothing marks these as airline flying.');
    expect(proposalReason(proposals[1]!)).toMatch(/^Turbine aircraft, but no flight number/);
    expect(
      proposalReason({
        ...proposals[1]!,
        basis: 'airline',
        entries: ['x', 'y'],
        evidence: { flightNumber: 2, sicTime: 1, crewNamed: 2 },
      }),
    ).toBe(
      'Turbine aircraft; all have a flight number, 1 have SIC time, all have a captain or first officer named.',
    );
  });

  it('lists a group’s flights even when nothing differs, and counts what the pilot marked', () => {
    const ids = new Set(proposals[0]!.entryIds);
    const items = auditItems(resolution, ids);
    expect(items.map((i) => [i.date, i.rule])).toEqual([
      ['2024-03-01', 'open'],
      ['2024-03-02', 'open'],
      ['2024-03-05', 'open'],
    ]);
    const decided = resolve(match, ruleDecisions([items[0]!.anchor, items[2]!.anchor], '135', AT));
    expect([...decidedRules(decided)]).toEqual([['135', [items[0]!.anchor, items[2]!.anchor]]]);
    expect(decidedRules(resolution).size).toBe(0);
  });
});
