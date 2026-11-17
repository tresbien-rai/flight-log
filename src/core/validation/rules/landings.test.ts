import { describe, expect, it } from 'vitest';
import { makeEntry, run } from '../testing';
import {
  nightLandingWithoutNight,
  nightTakeoffWithoutNight,
  pilotFlyingWithoutLanding,
  takeoffLandingMismatch,
  tooManyLandings,
} from './landings';

const none = { dayFullStop: 0, nightFullStop: 0, dayTouchAndGo: 0, nightTouchAndGo: 0 };

describe('night-landing-without-night', () => {
  it('warns for night full stops or touch-and-gos with no night time', () => {
    const a = run(nightLandingWithoutNight, makeEntry({ landings: { nightFullStop: 1 } }));
    expect(a).toHaveLength(1);
    expect(a[0]!.severity).toBe('warning');
    expect(
      run(nightLandingWithoutNight, makeEntry({ landings: { nightTouchAndGo: 2 } })),
    ).toHaveLength(1);
  });
  it('is silent with night time (boundary: one minute) or day landings', () => {
    expect(
      run(
        nightLandingWithoutNight,
        makeEntry({ landings: { nightFullStop: 1 }, durations: { night: 1 } }),
      ),
    ).toEqual([]);
    expect(run(nightLandingWithoutNight, makeEntry())).toEqual([]);
  });
});

describe('night-takeoff-without-night', () => {
  it('warns for night takeoffs with no night time', () => {
    const f = run(nightTakeoffWithoutNight, makeEntry({ nightTakeoffs: 1 }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
  });
  it('is silent with night time or no night takeoffs', () => {
    expect(
      run(nightTakeoffWithoutNight, makeEntry({ nightTakeoffs: 1, durations: { night: 5 } })),
    ).toEqual([]);
    expect(run(nightTakeoffWithoutNight, makeEntry())).toEqual([]);
  });
});

describe('takeoff-landing-mismatch', () => {
  it('errors on takeoffs without landings when both airports are known', () => {
    const f = run(
      takeoffLandingMismatch,
      makeEntry({ dayTakeoffs: 1, landings: { dayFullStop: 0 } }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
  });
  it('errors on landings without takeoffs', () => {
    const f = run(takeoffLandingMismatch, makeEntry({ dayTakeoffs: 0 }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
  });
  it('stays silent on a one-sided count when an airport is missing', () => {
    expect(
      run(takeoffLandingMismatch, makeEntry({ to: undefined, landings: { dayFullStop: 0 } })),
    ).toEqual([]);
    expect(run(takeoffLandingMismatch, makeEntry({ from: undefined, dayTakeoffs: 0 }))).toEqual([]);
  });
  it('is silent for the pilot monitoring (no takeoffs or landings)', () => {
    expect(
      run(
        takeoffLandingMismatch,
        makeEntry({ rule: '121', dayTakeoffs: 0, landings: { dayFullStop: 0 } }),
      ),
    ).toEqual([]);
  });
  it('warns when counts differ by more than one, and allows a difference of one', () => {
    const f = run(
      takeoffLandingMismatch,
      makeEntry({ dayTakeoffs: 5, landings: { dayFullStop: 2 } }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(
      run(takeoffLandingMismatch, makeEntry({ dayTakeoffs: 3, landings: { dayFullStop: 2 } })),
    ).toEqual([]);
  });
  it('sums day and night takeoffs and all landing kinds', () => {
    const e = makeEntry({
      dayTakeoffs: 2,
      nightTakeoffs: 2,
      landings: { dayFullStop: 1, nightFullStop: 1, dayTouchAndGo: 1, nightTouchAndGo: 1 },
    });
    expect(run(takeoffLandingMismatch, e)).toEqual([]);
  });
});

describe('too-many-landings', () => {
  it('warns above one landing every four minutes', () => {
    const f = run(
      tooManyLandings,
      makeEntry({ durations: { total: 60 }, landings: { dayFullStop: 0, dayTouchAndGo: 16 } }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.message).toContain('16 landings in 1.0');
  });
  it('allows exactly total/4 (boundary) and up to 3 on short flights', () => {
    expect(
      run(
        tooManyLandings,
        makeEntry({ durations: { total: 60 }, landings: { dayFullStop: 0, dayTouchAndGo: 15 } }),
      ),
    ).toEqual([]);
    expect(
      run(
        tooManyLandings,
        makeEntry({ durations: { total: 5 }, landings: { dayFullStop: 0, dayTouchAndGo: 3 } }),
      ),
    ).toEqual([]);
    expect(
      run(
        tooManyLandings,
        makeEntry({ durations: { total: 5 }, landings: { dayFullStop: 0, dayTouchAndGo: 4 } }),
      ),
    ).toHaveLength(1);
  });
  it('errors when takeoffs or landings exceed 60', () => {
    const a = run(tooManyLandings, makeEntry({ dayTakeoffs: 61, landings: none }));
    expect(a[0]!.severity).toBe('error');
    const b = run(
      tooManyLandings,
      makeEntry({ durations: { total: 600 }, landings: { dayFullStop: 0, dayTouchAndGo: 61 } }),
    );
    expect(b).toHaveLength(1);
    expect(b[0]!.severity).toBe('error');
    expect(
      run(
        tooManyLandings,
        makeEntry({
          dayTakeoffs: 60,
          durations: { total: 600 },
          landings: { dayFullStop: 0, dayTouchAndGo: 60 },
        }),
      ),
    ).toEqual([]);
  });
  it('is silent with no landings or zero total (nothing to compare)', () => {
    expect(run(tooManyLandings, makeEntry({ landings: none }))).toEqual([]);
    expect(
      run(tooManyLandings, makeEntry({ durations: { total: 0 }, landings: { dayFullStop: 9 } })),
    ).toEqual([]);
  });
});

describe('pilot-flying-without-landing', () => {
  const leg = { rule: '121' as const, pilotFlying: true, dayTakeoffs: 0, landings: none };
  it('notes a 121 pilot-flying leg with none', () => {
    const f = run(pilotFlyingWithoutLanding, makeEntry(leg));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('note');
  });
  it('is silent for pilot monitoring, unknown pilot flying, other rules, or any takeoff or landing', () => {
    expect(run(pilotFlyingWithoutLanding, makeEntry({ ...leg, pilotFlying: false }))).toEqual([]);
    expect(run(pilotFlyingWithoutLanding, makeEntry({ ...leg, pilotFlying: undefined }))).toEqual(
      [],
    );
    expect(run(pilotFlyingWithoutLanding, makeEntry({ ...leg, rule: '91' }))).toEqual([]);
    expect(run(pilotFlyingWithoutLanding, makeEntry({ ...leg, dayTakeoffs: 1 }))).toEqual([]);
    expect(
      run(pilotFlyingWithoutLanding, makeEntry({ ...leg, landings: { dayFullStop: 1 } })),
    ).toEqual([]);
  });
});
