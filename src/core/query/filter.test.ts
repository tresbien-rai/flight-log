import { describe, expect, it } from 'vitest';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '../validation/testing';
import { filterEntries, isEmptyFilter } from './filter';
import { indexLogbook } from './index-logbook';

const logbook = makeLogbook({
  airframes: [
    makeAirframe({
      id: 'a1',
      registrations: [{ value: 'N172SK' }],
      configurations: [{ value: 't1' }],
    }),
    makeAirframe({
      id: 'a2',
      registrations: [{ value: 'N999XX' }],
      configurations: [{ value: 't2' }],
    }),
  ],
  aircraftTypes: [makeType({ id: 't1', model: '172S' }), makeType({ id: 't2', model: 'CRJ-700' })],
  people: [
    { id: 'p1', name: 'Ann Lee' },
    { id: 'p2', name: 'Bob Stone' },
  ],
});
const index = indexLogbook(logbook);

const e1 = makeEntry({ id: 'e1', date: '2025-01-10', rule: '91', kind: 'flight', seat: 'PIC' });
const e2 = makeEntry({
  id: 'e2',
  date: '2025-02-10',
  rule: '121',
  kind: 'flight',
  seat: 'SIC',
  airframeId: 'a2',
  flightNumber: 'XY123',
  from: 'KLAX',
  to: 'KSFO',
  route: 'SADDE6 KENNO',
  crew: [{ personId: 'p1', role: 'PIC' }],
  remarks: 'Bumpy ride, Diverted',
});
const e3 = makeEntry({
  id: 'e3',
  date: '2025-03-10',
  kind: 'simulator',
  airframeId: undefined,
  deviceId: 'd1',
  crew: [{ personId: 'p2', role: 'instructor' }],
});
const e4 = makeEntry({ id: 'e4', date: '' });
const deleted = makeEntry({ id: 'e5', deletedAt: '2025-01-01T00:00Z' });
const all = [e1, e2, e3, e4, deleted];
const ids = (list: { id: string }[]) => list.map((e) => e.id);
const run = (f: Parameters<typeof filterEntries>[1], flagged?: ReadonlySet<string>) =>
  ids(filterEntries(all, f, index, flagged));

describe('filterEntries', () => {
  it('keeps everything live for an empty filter, in input order', () => {
    expect(run({})).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(run({ rules: [], kinds: [], typeIds: [], seats: [], text: '   ' })).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
    ]);
  });

  it('excludes deleted entries even when otherwise matching', () => {
    expect(run({ rules: ['91'] })).not.toContain('e5');
    expect(run({ text: 'n1' })).not.toContain('e5');
  });

  it('filters by kind', () => {
    expect(run({ kinds: ['simulator'] })).toEqual(['e3']);
    expect(run({ kinds: ['simulator', 'ground'] })).toEqual(['e3']);
  });

  it('filters by rule', () => {
    expect(run({ rules: ['121'] })).toEqual(['e2']);
    expect(run({ rules: ['121', '91'] })).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('filters by seat; undefined seat never matches', () => {
    expect(run({ seats: ['PIC'] })).toEqual(['e1']);
    expect(run({ seats: ['PIC', 'SIC'] })).toEqual(['e1', 'e2']);
  });

  it('filters by resolved type id', () => {
    expect(run({ typeIds: ['t2'] })).toEqual(['e2']);
    expect(run({ typeIds: ['t1', 't2'] })).toEqual(['e1', 'e2', 'e4']);
    expect(run({ typeIds: ['nope'] })).toEqual([]);
  });

  it('applies inclusive date bounds and rejects empty dates', () => {
    expect(run({ dateFrom: '2025-02-10' })).toEqual(['e2', 'e3']);
    expect(run({ dateTo: '2025-02-10' })).toEqual(['e1', 'e2']);
    expect(run({ dateFrom: '2025-02-10', dateTo: '2025-02-10' })).toEqual(['e2']);
    expect(run({ dateFrom: '2026-01-01' })).toEqual([]);
  });

  it('onlyFlagged keeps flagged entries, and none without a flagged set', () => {
    expect(run({ onlyFlagged: true }, new Set(['e2', 'e5']))).toEqual(['e2']);
    expect(run({ onlyFlagged: true })).toEqual([]);
    expect(run({ onlyFlagged: false })).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  describe('text', () => {
    it('matches tail, airports, route, flight number, type id and model', () => {
      expect(run({ text: 'N999' })).toEqual(['e2']);
      expect(run({ text: 'klax' })).toEqual(['e2']);
      expect(run({ text: 'ksfo' })).toEqual(['e2']);
      expect(run({ text: 'kenno' })).toEqual(['e2']);
      expect(run({ text: 'xy123' })).toEqual(['e2']);
      expect(run({ text: 'crj-700' })).toEqual(['e2']);
      expect(run({ text: '172s' })).toEqual(['e1', 'e4']);
      expect(run({ text: 't2' })).toEqual(['e2']);
    });

    it('matches the device name for simulator entries', () => {
      expect(run({ text: 'sim' })).toEqual(['e3']);
    });

    it('matches crew names and remarks', () => {
      expect(run({ text: 'ann' })).toEqual(['e2']);
      expect(run({ text: 'STONE' })).toEqual(['e3']);
      expect(run({ text: 'bumpy' })).toEqual(['e2']);
      expect(run({ text: 'diverted' })).toEqual(['e2']);
    });

    it('requires every word (AND) and ignores case and extra whitespace', () => {
      expect(run({ text: '  ANN   bumpy ' })).toEqual(['e2']);
      expect(run({ text: 'ann stone' })).toEqual([]);
      expect(run({ text: 'klax zzz' })).toEqual([]);
    });
  });

  it('combines fields', () => {
    expect(run({ rules: ['121'], seats: ['SIC'], text: 'ann', dateFrom: '2025-02-01' })).toEqual([
      'e2',
    ]);
    expect(run({ rules: ['121'], seats: ['PIC'] })).toEqual([]);
  });

  it('is fast with a text filter over 5,000 entries', () => {
    const many = Array.from({ length: 5000 }, (_, i) =>
      makeEntry({
        id: `m${i}`,
        remarks: `leg ${i} with some remarks`,
        crew: [{ personId: 'p1', role: 'PIC' }],
      }),
    );
    const start = performance.now();
    const out = filterEntries(many, { text: 'LEG 4999 ann' }, index);
    expect(performance.now() - start).toBeLessThan(250);
    expect(ids(out)).toEqual(['m4999']);
  });
});

describe('isEmptyFilter', () => {
  it('is true for no constraints', () => {
    expect(isEmptyFilter({})).toBe(true);
    expect(
      isEmptyFilter({
        text: '  ',
        rules: [],
        kinds: [],
        typeIds: [],
        seats: [],
        onlyFlagged: false,
      }),
    ).toBe(true);
    expect(isEmptyFilter({ dateFrom: '', dateTo: '' })).toBe(true);
  });

  it.each([
    { text: 'x' },
    { dateFrom: '2025-01-01' },
    { dateTo: '2025-01-01' },
    { rules: ['91' as const] },
    { kinds: ['flight' as const] },
    { typeIds: ['t1'] },
    { seats: ['PIC' as const] },
    { onlyFlagged: true },
  ])('is false for %o', (f) => {
    expect(isEmptyFilter(f)).toBe(false);
  });
});
