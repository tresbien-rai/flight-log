import { describe, expect, it } from 'vitest';
import { instantAfter, localDateOf, minutesBetween, resolveUtcClock } from './zone';

const LA = 'America/Los_Angeles';

describe('localDateOf', () => {
  it('returns the local calendar date', () => {
    expect(localDateOf('2025-06-22T00:30Z', LA)).toBe('2025-06-21');
    expect(localDateOf('2025-06-22T07:00Z', LA)).toBe('2025-06-22');
    expect(localDateOf('2025-06-21T20:00Z', 'Asia/Tokyo')).toBe('2025-06-22');
    expect(localDateOf('2025-06-21T20:00Z', 'UTC')).toBe('2025-06-21');
  });

  it('throws RangeError for an invalid zone', () => {
    expect(() => localDateOf('2025-06-22T00:30Z', 'Not/AZone')).toThrow(RangeError);
  });

  it('is stable when called repeatedly (cached formatter)', () => {
    expect(localDateOf('2025-01-01T00:00Z', LA)).toBe('2024-12-31');
    expect(localDateOf('2025-01-01T00:00Z', LA)).toBe('2024-12-31');
  });
});

describe('resolveUtcClock', () => {
  it('puts a Los Angeles evening departure on the next UTC date', () => {
    expect(resolveUtcClock('2025-06-21', 30, LA)).toBe('2025-06-22T00:30Z');
  });

  it('keeps a morning departure on the same UTC date', () => {
    expect(resolveUtcClock('2025-06-21', 16 * 60, LA)).toBe('2025-06-21T16:00Z');
  });

  it('handles a zone east of UTC in summer', () => {
    // 00:30 BST on 06-21 is 23:30Z on 06-20.
    expect(resolveUtcClock('2025-06-21', 23 * 60 + 30, 'Europe/London')).toBe('2025-06-20T23:30Z');
    expect(resolveUtcClock('2025-06-21', 12 * 60, 'Europe/London')).toBe('2025-06-21T12:00Z');
  });

  it('puts early Tokyo morning on the previous UTC date', () => {
    // 06:00 JST on 06-21 is 21:00Z on 06-20.
    expect(resolveUtcClock('2025-06-21', 21 * 60, 'Asia/Tokyo')).toBe('2025-06-20T21:00Z');
  });

  it('is correct either side of a DST change', () => {
    // US spring forward 2025-03-09 at 10:00Z: 09:30Z is PST (01:30 local), 10:30Z is PDT (03:30).
    expect(resolveUtcClock('2025-03-09', 9 * 60 + 30, LA)).toBe('2025-03-09T09:30Z');
    expect(resolveUtcClock('2025-03-09', 10 * 60 + 30, LA)).toBe('2025-03-09T10:30Z');
    // Evening before and after: 2025-03-08 20:00 PST = 04:00Z on 03-09.
    expect(resolveUtcClock('2025-03-08', 4 * 60, LA)).toBe('2025-03-09T04:00Z');
    // 2025-03-09 20:00 PDT = 03:00Z on 03-10.
    expect(resolveUtcClock('2025-03-09', 3 * 60, LA)).toBe('2025-03-10T03:00Z');
    // Fall back 2025-11-02: 2025-11-01 20:00 PDT = 03:00Z on 11-02.
    expect(resolveUtcClock('2025-11-01', 3 * 60, LA)).toBe('2025-11-02T03:00Z');
    // 2025-11-02 20:00 PST = 04:00Z on 11-03.
    expect(resolveUtcClock('2025-11-02', 4 * 60, LA)).toBe('2025-11-03T04:00Z');
  });

  it('uses the local date as the UTC date when tz is undefined', () => {
    expect(resolveUtcClock('2025-06-21', 30, undefined)).toBe('2025-06-21T00:30Z');
    expect(resolveUtcClock('2025-06-21', 1439, undefined)).toBe('2025-06-21T23:59Z');
  });
});

describe('instantAfter', () => {
  it('stays on the same UTC day when the clock is not earlier', () => {
    expect(instantAfter('2025-06-22T00:30Z', 60)).toBe('2025-06-22T01:00Z');
    expect(instantAfter('2025-06-22T00:30Z', 30)).toBe('2025-06-22T00:30Z');
  });

  it('rolls to the next day when the clock is earlier', () => {
    expect(instantAfter('2025-06-22T23:30Z', 20)).toBe('2025-06-23T00:20Z');
    expect(instantAfter('2025-12-31T23:59Z', 0)).toBe('2026-01-01T00:00Z');
  });

  it('chains out, off, on, in across midnight', () => {
    const out = resolveUtcClock('2025-06-21', 23 * 60 + 40, LA); // 16:40 PDT
    const off = instantAfter(out, 23 * 60 + 55);
    const on = instantAfter(off, 70);
    const inn = instantAfter(on, 78);
    expect([out, off, on, inn]).toEqual([
      '2025-06-21T23:40Z',
      '2025-06-21T23:55Z',
      '2025-06-22T01:10Z',
      '2025-06-22T01:18Z',
    ]);
  });
});

describe('minutesBetween', () => {
  it('measures whole minutes', () => {
    expect(minutesBetween('2025-06-21T23:40Z', '2025-06-22T01:18Z')).toBe(98);
    expect(minutesBetween('2025-06-22T01:18Z', '2025-06-21T23:40Z')).toBe(-98);
    expect(minutesBetween('2025-06-22T00:00Z', '2025-06-22T00:00Z')).toBe(0);
  });
});
