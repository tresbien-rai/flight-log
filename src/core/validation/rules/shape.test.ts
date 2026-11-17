import { describe, expect, it } from 'vitest';
import { makeEntry, run } from '../testing';
import { simulatorShape } from './shape';

const none = { dayFullStop: 0, nightFullStop: 0, dayTouchAndGo: 0, nightTouchAndGo: 0 };
const sim = {
  kind: 'simulator' as const,
  from: undefined,
  to: undefined,
  airframeId: undefined,
  dayTakeoffs: 0,
  landings: none,
  durations: { total: 0, pic: 0, simulator: 90 },
};

describe('simulator-shape', () => {
  it('is silent for a well-formed simulator session with approaches, holds and instrument time', () => {
    const e = makeEntry({
      ...sim,
      approaches: [{ type: 'ILS' }],
      holds: 2,
      durations: { ...sim.durations, simulatedInstrument: 90 },
    });
    expect(run(simulatorShape, e)).toEqual([]);
  });
  it('warns when a simulator has flight total', () => {
    const f = run(simulatorShape, makeEntry({ ...sim, durations: { ...sim.durations, total: 1 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.fields).toEqual(['durations.total']);
  });
  it('warns when a simulator has takeoffs or landings', () => {
    expect(run(simulatorShape, makeEntry({ ...sim, dayTakeoffs: 1 }))).toHaveLength(1);
    expect(run(simulatorShape, makeEntry({ ...sim, nightTakeoffs: 1 }))).toHaveLength(1);
    expect(
      run(simulatorShape, makeEntry({ ...sim, landings: { ...none, nightTouchAndGo: 1 } })),
    ).toHaveLength(1);
  });
  it('reports one finding when a simulator has both problems', () => {
    const f = run(
      simulatorShape,
      makeEntry({ ...sim, dayTakeoffs: 1, durations: { ...sim.durations, total: 30 } }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.fields).toContain('dayTakeoffs');
    expect(f[0]!.fields).toContain('durations.total');
  });
  it('accepts a ground entry with only ground training', () => {
    const e = makeEntry({
      kind: 'ground',
      ...{ dayTakeoffs: 0, landings: none },
      durations: { total: 0, pic: 0, groundTraining: 60 },
    });
    expect(run(simulatorShape, e)).toEqual([]);
  });
  it('warns when a ground entry carries any other duration', () => {
    const e = makeEntry({
      kind: 'ground',
      dayTakeoffs: 0,
      landings: none,
      durations: { total: 0, pic: 0, groundTraining: 60, night: 5 },
    });
    const f = run(simulatorShape, e);
    expect(f).toHaveLength(1);
    expect(f[0]!.fields).toEqual(['durations.night']);
  });
  it('is silent for flights', () => {
    expect(run(simulatorShape, makeEntry())).toEqual([]);
  });
});
