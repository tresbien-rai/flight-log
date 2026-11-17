import { describe, expect, it } from 'vitest';
import { makeEntry, run } from '../testing';
import {
  componentExceedsTotal,
  dualGivenWithoutPic,
  instrumentExceedsTotal,
  picSicOverlap,
  xc50ExceedsXc,
  zeroTotal,
} from './components';

describe('component-exceeds-total', () => {
  it('reports one error per offending field, with the values', () => {
    const e = makeEntry({ durations: { total: 114, night: 654, sic: 200 } });
    const found = run(componentExceedsTotal, e);
    expect(found).toHaveLength(2);
    expect(found.every((f) => f.severity === 'error')).toBe(true);
    const night = found.find((f) => f.fields.includes('durations.night'))!;
    expect(night.entryIds).toEqual(['e1']);
    expect(night.message).toBe('Night time (10.9) exceeds total time (1.9).');
  });
  it('allows equal to total (boundary)', () => {
    expect(
      run(componentExceedsTotal, makeEntry({ durations: { night: 60, dualGiven: 60 } })),
    ).toEqual([]);
  });
  it('flags one minute over', () => {
    expect(run(componentExceedsTotal, makeEntry({ durations: { night: 61 } }))).toHaveLength(1);
  });
  it('allows PIC plus dual received to exceed total', () => {
    const e = makeEntry({ durations: { pic: 60, dualReceived: 60 } });
    expect(run(componentExceedsTotal, e)).toEqual([]);
  });
  it('compares simulator entries against simulator time and skips the rest', () => {
    const ok = makeEntry({
      kind: 'simulator',
      durations: { total: 0, pic: 0, simulator: 90, simulatedInstrument: 90, dualReceived: 90 },
    });
    expect(run(componentExceedsTotal, ok)).toEqual([]);
    const bad = makeEntry({
      kind: 'simulator',
      durations: { total: 0, pic: 0, simulator: 60, simulatedInstrument: 90 },
    });
    const found = run(componentExceedsTotal, bad);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe('Simulated instrument time (1.5) exceeds simulator time (1.0).');
  });
  it('ignores ground entries', () => {
    const e = makeEntry({ kind: 'ground', durations: { total: 0, night: 30, groundTraining: 60 } });
    expect(run(componentExceedsTotal, e)).toEqual([]);
  });
});

describe('pic-sic-overlap', () => {
  it('warns when PIC + SIC exceed total', () => {
    const f = run(picSicOverlap, makeEntry({ durations: { pic: 40, sic: 30 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.message).toContain('PIC (0.7) plus SIC (0.5)');
  });
  it('is silent when they sum to exactly total, or only one is logged', () => {
    expect(run(picSicOverlap, makeEntry({ durations: { pic: 30, sic: 30 } }))).toEqual([]);
    expect(run(picSicOverlap, makeEntry({ durations: { pic: 60, sic: 0 } }))).toEqual([]);
  });
  it('does not mind PIC + dual received over total', () => {
    expect(run(picSicOverlap, makeEntry({ durations: { pic: 60, dualReceived: 60 } }))).toEqual([]);
  });
});

describe('instrument-exceeds-total', () => {
  it('errors when the sum exceeds total but neither does alone', () => {
    const f = run(
      instrumentExceedsTotal,
      makeEntry({ durations: { actualInstrument: 40, simulatedInstrument: 30 } }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
  });
  it('allows a sum equal to total (boundary)', () => {
    const e = makeEntry({ durations: { actualInstrument: 40, simulatedInstrument: 20 } });
    expect(run(instrumentExceedsTotal, e)).toEqual([]);
  });
  it('stays quiet when one alone exceeds total (reported elsewhere)', () => {
    const e = makeEntry({ durations: { actualInstrument: 90, simulatedInstrument: 10 } });
    expect(run(instrumentExceedsTotal, e)).toEqual([]);
  });
  it('ignores simulator entries', () => {
    const e = makeEntry({
      kind: 'simulator',
      durations: { total: 0, simulator: 120, actualInstrument: 30, simulatedInstrument: 30 },
    });
    expect(run(instrumentExceedsTotal, e)).toEqual([]);
  });
});

describe('dual-given-without-pic', () => {
  it('warns when dual given exceeds PIC', () => {
    const f = run(dualGivenWithoutPic, makeEntry({ durations: { pic: 0, dualGiven: 60 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
  });
  it('is silent for an instructor logging PIC = dual given, and at the boundary', () => {
    expect(run(dualGivenWithoutPic, makeEntry({ durations: { pic: 60, dualGiven: 60 } }))).toEqual(
      [],
    );
    expect(run(dualGivenWithoutPic, makeEntry())).toEqual([]);
  });
});

describe('xc50-exceeds-xc', () => {
  it('warns when xc50 exceeds xc', () => {
    const f = run(
      xc50ExceedsXc,
      makeEntry({ durations: { crossCountry: 30, crossCountry50: 45 } }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
  });
  it('is silent when equal, smaller, or xc is not recorded', () => {
    expect(
      run(xc50ExceedsXc, makeEntry({ durations: { crossCountry: 30, crossCountry50: 30 } })),
    ).toEqual([]);
    expect(run(xc50ExceedsXc, makeEntry({ durations: { crossCountry: 30 } }))).toEqual([]);
    expect(run(xc50ExceedsXc, makeEntry({ durations: { crossCountry50: 30 } }))).toEqual([]);
  });
});

describe('zero-total', () => {
  it('warns on a flight with no time', () => {
    const f = run(zeroTotal, makeEntry({ durations: { total: 0, pic: 0 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
  });
  it('is silent for one minute, and for simulator and ground entries', () => {
    expect(run(zeroTotal, makeEntry({ durations: { total: 1 } }))).toEqual([]);
    expect(
      run(zeroTotal, makeEntry({ kind: 'simulator', durations: { total: 0, simulator: 60 } })),
    ).toEqual([]);
    expect(run(zeroTotal, makeEntry({ kind: 'ground', durations: { total: 0 } }))).toEqual([]);
  });
});
