import { describe, expect, it } from 'vitest';
import { makeEntry, run } from '../testing';
import {
  airlineIncomplete,
  dualReceivedWithoutInstructor,
  seatTimeMismatch,
  soloInconsistent,
} from './crew';

describe('solo-inconsistent', () => {
  it('errors when solo exceeds PIC', () => {
    const f = run(soloInconsistent, makeEntry({ durations: { pic: 30, solo: 60 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
    expect(f[0]!.message).toContain('solo (1.0) exceeds PIC (0.5)');
  });
  it('errors when dual received is also logged', () => {
    const f = run(soloInconsistent, makeEntry({ durations: { solo: 60, dualReceived: 10 } }));
    expect(f).toHaveLength(1);
  });
  it('ignores a PIC in the crew, who is the pilot naming themself', () => {
    expect(
      run(soloInconsistent, [
        makeEntry({
          durations: { solo: 60, pic: 60, total: 60 },
          crew: [{ personId: 'p', role: 'PIC' }],
        }),
      ]),
    ).toEqual([]);
  });

  it.each(['SIC', 'instructor', 'student', 'examiner'] as const)(
    'errors when a %s is in the crew',
    (role) => {
      const e = makeEntry({ durations: { solo: 60 }, crew: [{ personId: 'p1', role }] });
      expect(run(soloInconsistent, e)).toHaveLength(1);
    },
  );
  it('is silent for passengers and observers, and for a plain solo flight', () => {
    expect(run(soloInconsistent, makeEntry({ durations: { solo: 60 } }))).toEqual([]);
    const e = makeEntry({
      durations: { solo: 60 },
      crew: [
        { personId: 'p1', role: 'passenger' },
        { personId: 'p2', role: 'observer' },
      ],
    });
    expect(run(soloInconsistent, e)).toEqual([]);
  });
  it('is silent when solo equals PIC (boundary) or is zero', () => {
    expect(run(soloInconsistent, makeEntry({ durations: { pic: 60, solo: 60 } }))).toEqual([]);
    expect(
      run(soloInconsistent, makeEntry({ crew: [{ personId: 'p', role: 'instructor' }] })),
    ).toEqual([]);
  });
});

describe('dual-received-without-instructor', () => {
  it('notes dual received with no instructor', () => {
    const f = run(dualReceivedWithoutInstructor, makeEntry({ durations: { dualReceived: 60 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
  });
  it('is silent with an instructor or examiner, or with no dual', () => {
    for (const role of ['instructor', 'examiner'] as const) {
      const e = makeEntry({ durations: { dualReceived: 60 }, crew: [{ personId: 'p', role }] });
      expect(run(dualReceivedWithoutInstructor, e)).toEqual([]);
    }
    expect(run(dualReceivedWithoutInstructor, makeEntry())).toEqual([]);
  });
  it('is not satisfied by other roles', () => {
    const e = makeEntry({
      durations: { dualReceived: 60 },
      crew: [{ personId: 'p', role: 'passenger' }],
    });
    expect(run(dualReceivedWithoutInstructor, e)).toHaveLength(1);
  });
});

describe('airline-incomplete', () => {
  it('lists everything missing on a 121 leg', () => {
    const f = run(airlineIncomplete, makeEntry({ rule: '121' }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
    expect(f[0]!.fields).toEqual(['flightNumber', 'crew', 'seat']);
    expect(f[0]!.message).toBe('This Part 121 leg is missing its flight number, crew, seat.');
  });
  it('names only what is missing', () => {
    const e = makeEntry({
      rule: '121',
      flightNumber: 'XX123',
      seat: 'SIC',
      crew: [{ personId: 'p', role: 'PIC' }],
    });
    expect(run(airlineIncomplete, e)).toEqual([]);
    const f = run(airlineIncomplete, { ...e, seat: undefined });
    expect(f[0]!.fields).toEqual(['seat']);
  });
  it('is silent for non-121 rules', () => {
    expect(run(airlineIncomplete, makeEntry({ rule: '91' }))).toEqual([]);
  });
});

describe('seat-time-mismatch', () => {
  it('warns for an SIC seat with PIC time only', () => {
    const f = run(seatTimeMismatch, makeEntry({ seat: 'SIC', durations: { pic: 60, sic: 0 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
  });
  it('warns for a PIC seat with SIC time only', () => {
    const f = run(seatTimeMismatch, makeEntry({ seat: 'PIC', durations: { pic: 0, sic: 60 } }));
    expect(f).toHaveLength(1);
  });
  it('is silent when consistent, when both are logged, or when no seat is recorded', () => {
    expect(run(seatTimeMismatch, makeEntry({ seat: 'PIC' }))).toEqual([]);
    expect(
      run(seatTimeMismatch, makeEntry({ seat: 'SIC', durations: { pic: 0, sic: 60 } })),
    ).toEqual([]);
    expect(
      run(seatTimeMismatch, makeEntry({ seat: 'SIC', durations: { pic: 30, sic: 30 } })),
    ).toEqual([]);
    expect(run(seatTimeMismatch, makeEntry({ durations: { pic: 0, sic: 60 } }))).toEqual([]);
  });
});
