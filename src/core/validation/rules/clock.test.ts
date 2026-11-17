import { describe, expect, it } from 'vitest';
import { makeEntry, run } from '../testing';
import {
  airborneExceedsBlock,
  blockTypedMismatch,
  clockOrder,
  dateVsOut,
  totalVsBlock,
  totalVsHobbs,
} from './clock';

const T = (hm: string) => `2025-06-22T${hm}Z`;

describe('clock-order', () => {
  it('errors on the first violation and names both times', () => {
    const f = run(
      clockOrder,
      makeEntry({ out: T('10:00'), off: T('10:10'), on: T('09:50'), in: T('11:00') }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
    expect(f[0]!.fields).toEqual(['off', 'on']);
    expect(f[0]!.message).toBe('The on time (09:50Z) is earlier than the off time (10:10Z).');
  });
  it('compares only the instants present', () => {
    expect(run(clockOrder, makeEntry({ out: T('10:00'), in: T('09:00') }))).toHaveLength(1);
    expect(run(clockOrder, makeEntry({ out: T('10:00'), in: T('11:00') }))).toEqual([]);
  });
  it('compares as instants across a date change', () => {
    const e = makeEntry({ out: '2025-06-22T23:30Z', in: '2025-06-23T00:20Z' });
    expect(run(clockOrder, e)).toEqual([]);
  });
  it('allows equal times (boundary)', () => {
    const e = makeEntry({ out: T('10:00'), off: T('10:00'), on: T('10:00'), in: T('10:00') });
    expect(run(clockOrder, e)).toEqual([]);
  });
  it('is silent with no times', () => {
    expect(run(clockOrder, makeEntry())).toEqual([]);
  });
});

describe('total-vs-block', () => {
  const base = { totalSource: 'block' as const, out: T('10:00'), in: T('11:30') };
  it('errors when total differs from in - out', () => {
    const f = run(totalVsBlock, makeEntry({ ...base, durations: { total: 95 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
    expect(f[0]!.message).toContain('Total time (1.6)');
    expect(f[0]!.message).toContain('block time (1.5)');
  });
  it('is silent on an exact match', () => {
    expect(run(totalVsBlock, makeEntry({ ...base, durations: { total: 90 } }))).toEqual([]);
  });
  it('is silent when a time is missing or the source is not block', () => {
    expect(run(totalVsBlock, makeEntry({ ...base, in: undefined }))).toEqual([]);
    expect(run(totalVsBlock, makeEntry({ ...base, totalSource: 'typed' }))).toEqual([]);
  });
  it('leaves reversed times to clock-order', () => {
    expect(run(totalVsBlock, makeEntry({ ...base, out: T('12:00') }))).toEqual([]);
  });
});

describe('total-vs-hobbs', () => {
  const base = { totalSource: 'hobbs' as const, hobbsOut: 12345, hobbsIn: 12355 };
  it('errors when total is not 6 minutes per tenth', () => {
    const f = run(totalVsHobbs, makeEntry({ ...base, durations: { total: 66 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
  });
  it('is silent on an exact match', () => {
    expect(run(totalVsHobbs, makeEntry({ ...base, durations: { total: 60 } }))).toEqual([]);
  });
  it('errors when hobbs in is below hobbs out', () => {
    const f = run(totalVsHobbs, makeEntry({ ...base, hobbsIn: 12340 }));
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('lower than');
  });
  it('is silent with a missing reading or another source', () => {
    expect(run(totalVsHobbs, makeEntry({ ...base, hobbsIn: undefined }))).toEqual([]);
    expect(run(totalVsHobbs, makeEntry({ ...base, hobbsOut: undefined }))).toEqual([]);
    expect(
      run(totalVsHobbs, makeEntry({ ...base, totalSource: 'typed', durations: { total: 5 } })),
    ).toEqual([]);
  });
});

describe('block-typed-mismatch', () => {
  const base = { out: T('10:00'), in: T('11:30') };
  it('warns beyond the 3 minute tolerance, with both values', () => {
    const f = run(blockTypedMismatch, makeEntry({ ...base, durations: { total: 114 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.message).toBe(
      'Typed total (1.9) differs from block time (1.5) between 10:00Z and 11:30Z.',
    );
  });
  it('allows exactly 3 minutes either way (boundary) and warns at 4', () => {
    expect(run(blockTypedMismatch, makeEntry({ ...base, durations: { total: 93 } }))).toEqual([]);
    expect(run(blockTypedMismatch, makeEntry({ ...base, durations: { total: 87 } }))).toEqual([]);
    expect(run(blockTypedMismatch, makeEntry({ ...base, durations: { total: 94 } }))).toHaveLength(
      1,
    );
    expect(run(blockTypedMismatch, makeEntry({ ...base, durations: { total: 86 } }))).toHaveLength(
      1,
    );
  });
  it('is silent without out/in or for non-typed totals', () => {
    expect(run(blockTypedMismatch, makeEntry({ durations: { total: 600 } }))).toEqual([]);
    expect(
      run(blockTypedMismatch, makeEntry({ out: base.out, durations: { total: 600 } })),
    ).toEqual([]);
    expect(
      run(
        blockTypedMismatch,
        makeEntry({ ...base, totalSource: 'block', durations: { total: 114 } }),
      ),
    ).toEqual([]);
  });
});

describe('airborne-exceeds-block', () => {
  const base = { off: T('10:00'), on: T('11:30') };
  it('errors when airborne time exceeds total by more than 3 minutes', () => {
    const f = run(airborneExceedsBlock, makeEntry({ ...base, durations: { total: 80 } }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('error');
  });
  it('allows exactly total + 3 (boundary)', () => {
    expect(run(airborneExceedsBlock, makeEntry({ ...base, durations: { total: 87 } }))).toEqual([]);
    expect(
      run(airborneExceedsBlock, makeEntry({ ...base, durations: { total: 86 } })),
    ).toHaveLength(1);
  });
  it('is silent when off or on is missing', () => {
    expect(
      run(airborneExceedsBlock, makeEntry({ off: base.off, durations: { total: 1 } })),
    ).toEqual([]);
    expect(run(airborneExceedsBlock, makeEntry({ on: base.on, durations: { total: 1 } }))).toEqual(
      [],
    );
  });
});

describe('date-vs-out', () => {
  it('warns when the UTC date is two days from the entry date', () => {
    const f = run(dateVsOut, makeEntry({ date: '2025-06-22', out: '2025-06-24T10:00Z' }));
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.message).toContain('2025-06-24');
    expect(
      run(dateVsOut, makeEntry({ date: '2025-06-22', out: '2025-06-20T10:00Z' })),
    ).toHaveLength(1);
  });
  it('allows one day either way (boundary), including across a month end', () => {
    expect(run(dateVsOut, makeEntry({ date: '2025-06-22', out: '2025-06-23T01:00Z' }))).toEqual([]);
    expect(run(dateVsOut, makeEntry({ date: '2025-06-22', out: '2025-06-21T23:00Z' }))).toEqual([]);
    expect(run(dateVsOut, makeEntry({ date: '2025-06-30', out: '2025-07-01T01:00Z' }))).toEqual([]);
  });
  it('is silent with no out time', () => {
    expect(run(dateVsOut, makeEntry({ date: '1999-01-01' }))).toEqual([]);
  });
});
