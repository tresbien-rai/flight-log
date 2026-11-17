import { describe, expect, it } from 'vitest';
import { makeEntry, run } from '../testing';
import { approachWithoutInstrument, holdsWithoutInstrument } from './instrument';

const approach = { type: 'ILS' as const, runway: '24R' };

describe('approach-without-instrument', () => {
  it('notes approaches with no instrument time', () => {
    const f = run(approachWithoutInstrument, makeEntry({ approaches: [approach, approach] }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
    expect(f[0]!.message).toBe('2 approaches logged but instrument time is 0.0.');
  });
  it('is silent with actual or simulated instrument time (boundary: one minute)', () => {
    expect(
      run(
        approachWithoutInstrument,
        makeEntry({ approaches: [approach], durations: { actualInstrument: 1 } }),
      ),
    ).toEqual([]);
    expect(
      run(
        approachWithoutInstrument,
        makeEntry({ approaches: [approach], durations: { simulatedInstrument: 1 } }),
      ),
    ).toEqual([]);
  });
  it('is silent without approaches and on simulator entries', () => {
    expect(run(approachWithoutInstrument, makeEntry())).toEqual([]);
    const sim = makeEntry({
      kind: 'simulator',
      approaches: [approach],
      durations: { total: 0, simulator: 60 },
    });
    expect(run(approachWithoutInstrument, sim)).toEqual([]);
  });
});

describe('holds-without-instrument', () => {
  it('notes holds with no instrument time', () => {
    const f = run(holdsWithoutInstrument, makeEntry({ holds: 1 }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
  });
  it('is silent with instrument time, no holds, or a simulator entry', () => {
    expect(
      run(holdsWithoutInstrument, makeEntry({ holds: 1, durations: { simulatedInstrument: 5 } })),
    ).toEqual([]);
    expect(run(holdsWithoutInstrument, makeEntry({ holds: 0 }))).toEqual([]);
    expect(
      run(
        holdsWithoutInstrument,
        makeEntry({ kind: 'simulator', holds: 2, durations: { total: 0, simulator: 60 } }),
      ),
    ).toEqual([]);
  });
});
