import { describe, expect, it } from 'vitest';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '../validation/testing';
import { indexLogbook } from './index-logbook';

const types = [
  makeType({ id: 'CRJ-700', model: 'CRJ-700' }),
  makeType({ id: 'CRJ-550', model: 'CRJ-550' }),
  makeType({ id: 'C172', model: '172' }),
];
const converted = makeAirframe({
  id: 'a1',
  registrations: [
    { value: 'N100', to: '2025-01-31' },
    { value: 'N200', from: '2025-02-01' },
  ],
  configurations: [
    { value: 'CRJ-700', to: '2025-03-09' },
    { value: 'CRJ-550', from: '2025-03-10' },
  ],
});

describe('indexLogbook', () => {
  const logbook = makeLogbook({
    airframes: [
      converted,
      makeAirframe({
        id: 'a2',
        registrations: [{ value: 'N9', from: '2030-01-01' }],
        configurations: [{ value: 'C172' }],
      }),
    ],
    aircraftTypes: types,
    devices: [
      { id: 'd1', name: 'CRJ FFS', level: 'FFS', represents: 'CRJ-550' },
      { id: 'd2', name: 'Generic', level: 'BATD' },
    ],
    people: [{ id: 'p1', name: 'Ann Lee' }],
  });
  const index = indexLogbook(logbook);

  it('resolves the type by date across a configuration change', () => {
    expect(index.typeOf(makeEntry({ date: '2025-03-09' }))?.id).toBe('CRJ-700');
    expect(index.typeOf(makeEntry({ date: '2025-03-10' }))?.id).toBe('CRJ-550');
  });

  it('prefers typeOverride, and gives undefined for an unknown override', () => {
    expect(index.typeOf(makeEntry({ typeOverride: 'C172' }))?.id).toBe('C172');
    expect(index.typeOf(makeEntry({ typeOverride: 'nope' }))).toBeUndefined();
  });

  it('falls back to the device represents type', () => {
    expect(index.typeOf(makeEntry({ airframeId: undefined, deviceId: 'd1' }))?.id).toBe('CRJ-550');
    expect(index.typeOf(makeEntry({ airframeId: undefined, deviceId: 'd2' }))).toBeUndefined();
    expect(index.typeOf(makeEntry({ airframeId: undefined, deviceId: 'zz' }))).toBeUndefined();
  });

  it('falls back to the device when no configuration covers the date', () => {
    const lb = indexLogbook(
      makeLogbook({
        airframes: [makeAirframe({ configurations: [{ value: 't1', from: '2030-01-01' }] })],
        devices: [{ id: 'd1', name: 'Sim', level: 'FFS', represents: 't1' }],
      }),
    );
    expect(lb.typeOf(makeEntry({ date: '2025-01-01' }))).toBeUndefined();
    expect(lb.typeOf(makeEntry({ date: '2025-01-01', deviceId: 'd1' }))?.id).toBe('t1');
  });

  it('is undefined for unknown airframes and entries with neither', () => {
    expect(index.typeOf(makeEntry({ airframeId: 'zz' }))).toBeUndefined();
    expect(index.typeOf(makeEntry({ airframeId: undefined }))).toBeUndefined();
  });

  it('resolves the tail across a re-registration', () => {
    expect(index.tailOf(makeEntry({ date: '2025-01-31' }))).toBe('N100');
    expect(index.tailOf(makeEntry({ date: '2025-02-01' }))).toBe('N200');
  });

  it('falls back to the first registration when none covers the date', () => {
    expect(index.tailOf(makeEntry({ airframeId: 'a2', date: '2025-01-01' }))).toBe('N9');
    expect(
      indexLogbook(makeLogbook({ airframes: [makeAirframe({ registrations: [] })] })).tailOf(
        makeEntry(),
      ),
    ).toBeUndefined();
  });

  it('uses the device name for device entries', () => {
    expect(index.tailOf(makeEntry({ airframeId: undefined, deviceId: 'd1' }))).toBe('CRJ FFS');
    expect(index.tailOf(makeEntry({ airframeId: undefined }))).toBeUndefined();
  });

  it('looks up airframes, devices and people', () => {
    expect(index.airframeOf(makeEntry())?.id).toBe('a1');
    expect(index.airframeOf(makeEntry({ airframeId: undefined }))).toBeUndefined();
    expect(index.deviceOf(makeEntry({ deviceId: 'd2' }))?.name).toBe('Generic');
    expect(index.deviceOf(makeEntry())).toBeUndefined();
    expect(index.person('p1')?.name).toBe('Ann Lee');
    expect(index.person('p2')).toBeUndefined();
  });

  it('lists types in use, sorted by id, ignoring deleted entries', () => {
    const idx = indexLogbook({
      ...logbook,
      entries: [
        makeEntry({ id: 'x1', date: '2025-03-10' }),
        makeEntry({ id: 'x2', date: '2025-03-01' }),
        makeEntry({ id: 'x3', airframeId: 'a2' }),
        makeEntry({ id: 'x4', typeOverride: 'C172', deletedAt: '2025-01-01T00:00Z' }),
        makeEntry({ id: 'x5', airframeId: 'zz' }),
      ],
    });
    expect(idx.typesInUse.map((t) => t.id)).toEqual(['C172', 'CRJ-550', 'CRJ-700']);
    const onlyDeleted = indexLogbook({
      ...logbook,
      entries: [makeEntry({ deletedAt: '2025-01-01T00:00Z' })],
    });
    expect(onlyDeleted.typesInUse).toEqual([]);
  });

  it('computes the date range over live, dated entries', () => {
    const idx = indexLogbook({
      ...logbook,
      entries: [
        makeEntry({ id: 'a', date: '2025-05-01' }),
        makeEntry({ id: 'b', date: '2024-01-02' }),
        makeEntry({ id: 'c', date: '2026-01-01', deletedAt: '2026-01-02T00:00Z' }),
        makeEntry({ id: 'd', date: '' }),
        makeEntry({ id: 'e', date: '2025-09-09' }),
      ],
    });
    expect(idx.dateRange).toEqual({ first: '2024-01-02', last: '2025-09-09' });
  });

  it('has no date range when there are no dated entries', () => {
    expect(indexLogbook(makeLogbook()).dateRange).toBeUndefined();
    expect(
      indexLogbook(makeLogbook({ entries: [makeEntry({ date: '' })] })).dateRange,
    ).toBeUndefined();
  });
});
