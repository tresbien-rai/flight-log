import { describe, expect, it } from 'vitest';
import { makeAirframe, makeEntry, run } from '../testing';
import { aircraftNotInService, missingAircraft } from './aircraft';

describe('missing-aircraft', () => {
  it('warns on a flight with no airframe', () => {
    const f = run(missingAircraft, makeEntry({ airframeId: undefined }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.fields).toEqual(['airframeId']);
  });
  it('warns on a flight whose airframe is not in the logbook', () => {
    const f = run(missingAircraft, makeEntry({ airframeId: 'ghost' }));
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('ghost');
  });
  it('is silent for a known airframe', () => {
    expect(run(missingAircraft, makeEntry())).toEqual([]);
  });
  it('checks devices for simulator entries', () => {
    const sim = {
      kind: 'simulator' as const,
      from: undefined,
      to: undefined,
      airframeId: undefined,
      durations: { total: 0, simulator: 60 },
    };
    expect(run(missingAircraft, makeEntry({ ...sim, deviceId: 'd1' }))).toEqual([]);
    expect(run(missingAircraft, makeEntry(sim))).toHaveLength(1);
    const f = run(missingAircraft, makeEntry({ ...sim, deviceId: 'nope' }));
    expect(f).toHaveLength(1);
    expect(f[0]!.fields).toEqual(['deviceId']);
  });
  it('is silent for ground entries', () => {
    expect(run(missingAircraft, makeEntry({ kind: 'ground', airframeId: undefined }))).toEqual([]);
  });
});

describe('aircraft-not-in-service', () => {
  it('warns when no configuration covers the date, naming the date', () => {
    const book = {
      airframes: [makeAirframe({ configurations: [{ value: 't1', from: '2026-01-01' }] })],
    };
    const f = run(aircraftNotInService, makeEntry({ date: '2025-06-22' }), book);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.message).toContain('2025-06-22');
  });
  it('warns when registrations exist but none covers the date', () => {
    const book = {
      airframes: [makeAirframe({ registrations: [{ value: 'N1', to: '2025-01-01' }] })],
    };
    const f = run(aircraftNotInService, makeEntry(), book);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('registration');
  });
  it('has inclusive bounds (boundary)', () => {
    const book = {
      airframes: [
        makeAirframe({ configurations: [{ value: 't1', from: '2025-06-22', to: '2025-06-22' }] }),
      ],
    };
    expect(run(aircraftNotInService, makeEntry({ date: '2025-06-22' }), book)).toEqual([]);
    expect(run(aircraftNotInService, makeEntry({ date: '2025-06-23' }), book)).toHaveLength(1);
    expect(run(aircraftNotInService, makeEntry({ date: '2025-06-21' }), book)).toHaveLength(1);
  });
  it('is silent when the airframe has no periods recorded, or does not exist', () => {
    const empty = { airframes: [makeAirframe({ configurations: [], registrations: [] })] };
    expect(run(aircraftNotInService, makeEntry(), empty)).toEqual([]);
    expect(run(aircraftNotInService, makeEntry({ airframeId: 'ghost' }))).toEqual([]);
    expect(run(aircraftNotInService, makeEntry({ airframeId: undefined }))).toEqual([]);
  });
  it('does not require a configuration when the entry overrides the type', () => {
    const book = {
      airframes: [makeAirframe({ configurations: [{ value: 't1', from: '2026-01-01' }] })],
    };
    expect(run(aircraftNotInService, makeEntry({ typeOverride: 't1' }), book)).toEqual([]);
  });
});
