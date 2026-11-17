import { describe, expect, it } from 'vitest';
import type { SourceAircraft, SourceRecord } from '../importers';
import { matchRecords } from './match';
import { mergeAircraft, mergedImport, toMergedLogbook } from './merge';
import { resolve } from './resolve';
import type { Decision } from './types';

const AT = '2026-01-01T00:00Z';
let line = 2;

function rec(source: 'logten' | 'foreflight', over: Partial<SourceRecord> = {}): SourceRecord {
  const n = line++;
  return {
    source,
    line: n,
    raw: { n: String(n) },
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
}

const craft = (tail: string, over: Partial<SourceAircraft> = {}): SourceAircraft => ({
  tail,
  ...over,
});

describe('mergeAircraft', () => {
  it('keeps side a’s description and fills its blanks from side b', () => {
    const merged = mergeAircraft(
      [craft('N1', { typeCode: 'C-172S', engine: undefined, year: 2004 })],
      [craft('N1', { typeCode: 'C172', engine: 'piston', class: 'ASEL', year: 1999 })],
      new Set(['N1']),
    );
    expect(merged).toEqual([
      { tail: 'N1', typeCode: 'C-172S', engine: 'piston', class: 'ASEL', year: 2004 },
    ]);
  });

  it('includes aircraft only one side knows, a’s first, and only those that are flown', () => {
    const merged = mergeAircraft(
      [craft('N1'), craft('N2')],
      [craft('FTD1', { deviceLevel: 'FTD' }), craft('N3'), craft('N1')],
      new Set(['N1', 'FTD1', 'N3']),
    );
    expect(merged.map((c) => c.tail)).toEqual(['N1', 'FTD1', 'N3']);
  });

  it('ignores repeated tails within a side', () => {
    const merged = mergeAircraft(
      [craft('N1', { typeCode: 'A' }), craft('N1', { typeCode: 'B' })],
      [craft('N1', { year: 1 }), craft('N1', { year: 2, typeCode: 'C' })],
      new Set(['N1']),
    );
    expect(merged).toEqual([{ tail: 'N1', typeCode: 'A', year: 1 }]);
  });
});

describe('merged logbook', () => {
  const a = [
    rec('logten', {
      durations: { total: 77, pic: 77 },
      people: [{ name: 'Example; Pat', role: 'SIC' }],
    }),
    rec('logten', { date: '2025-07-01', tail: 'N706SK', durations: { total: 120 } }),
  ];
  const b = [
    rec('foreflight', {
      durations: { total: 78, pic: 78 },
      people: [{ name: 'Pat Example', role: 'SIC' }],
    }),
    rec('foreflight', { date: '2025-07-01', tail: 'N768SK', durations: { total: 120 } }),
    rec('foreflight', {
      kind: 'simulator',
      date: '2025-08-01',
      tail: 'FTD1',
      from: undefined,
      to: undefined,
      durations: { simulator: 60 },
    }),
    rec('foreflight', {
      kind: 'simulator',
      date: '2025-08-02',
      tail: 'FTD1',
      from: undefined,
      to: undefined,
      durations: { simulator: 45 },
    }),
  ];
  const sources = {
    a: {
      source: 'logten' as const,
      aircraft: [craft('N12345', { typeCode: 'C-172S' }), craft('N706SK', { typeCode: 'CRJ-700' })],
    },
    b: {
      source: 'foreflight' as const,
      aircraft: [
        craft('N12345', { typeCode: 'C172' }),
        craft('N768SK', { typeCode: 'CRJ7' }),
        craft('FTD1', { deviceLevel: 'FTD' as const }),
      ],
    },
  };
  const match = matchRecords(a, b);
  const first = resolve(match, []);

  it('is complete before anything is decided: side a’s values, every orphan kept', () => {
    const { logbook } = toMergedLogbook(first, sources);
    expect(logbook.entries).toHaveLength(4);
    expect(logbook.entries.map((e) => e.id)).toEqual([
      first.pairs[0]!.entryId,
      first.pairs[1]!.entryId,
      first.orphans[0]!.entryId,
      first.orphans[1]!.entryId,
    ]);
    expect(new Set(logbook.entries.map((e) => e.id)).size).toBe(4);
    expect(logbook.entries.every((e) => e.source.batchId === 'merge')).toBe(true);
    expect(logbook.entries[0]!.durations.total).toBe(77);
    expect(logbook.entries[1]!.airframeId).toBe('af:N706SK');
    expect(logbook.entries[2]!).toMatchObject({ kind: 'simulator', deviceId: 'dev:FTD1' });
    expect(logbook.airframes.map((f) => f.id)).toEqual(['af:N12345', 'af:N706SK']);
    expect(logbook.aircraftTypes.map((t) => t.id)).toEqual(['C-172S', 'CRJ-700']);
    expect(logbook.people).toHaveLength(1);
  });

  it('follows the decisions: chosen tail, dropped orphan', () => {
    const decisions: Decision[] = [
      {
        kind: 'pair',
        a: first.pairs[1]!.fa,
        b: first.pairs[1]!.fb,
        match: 'confirmed',
        fields: {
          tail: {
            choice: 'b',
            seen: JSON.stringify([['tail', 'N706SK', 'N768SK']]),
          },
        },
        decidedAt: AT,
      },
      {
        kind: 'orphan',
        side: 'b',
        record: first.orphans[0]!.fingerprint,
        action: 'drop',
        decidedAt: AT,
      },
      {
        kind: 'orphan',
        side: 'b',
        record: first.orphans[1]!.fingerprint,
        action: 'keep',
        decidedAt: AT,
      },
      { kind: 'bulk', pattern: 'rounding', choice: 'more-precise', decidedAt: AT },
    ];
    const resolution = resolve(match, decisions);
    expect(resolution.open).toEqual({ matches: 0, fields: 0, orphans: 0 });
    const { result } = mergedImport(resolution, sources);
    expect(result.records).toHaveLength(3);
    expect(result.aircraft.map((c) => c.tail)).toEqual(['N12345', 'N768SK', 'FTD1']);

    const { logbook } = toMergedLogbook(resolution, sources);
    expect(logbook.entries.map((e) => e.airframeId ?? e.deviceId)).toEqual([
      'af:N12345',
      'af:N768SK',
      'dev:FTD1',
    ]);
    expect(logbook.entries[2]!.durations.simulator).toBe(45);
    // The wrong tail leaves no airframe behind.
    expect(logbook.airframes.map((f) => f.id)).toEqual(['af:N12345', 'af:N768SK']);
  });
});
