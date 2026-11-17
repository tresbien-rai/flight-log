import { describe, expect, it } from 'vitest';
import { DURATION_FIELDS, zeroDurations } from './entry';

describe('zeroDurations', () => {
  it('has every duration field set to zero and nothing else', () => {
    const d = zeroDurations();
    expect(Object.keys(d).sort()).toEqual([...DURATION_FIELDS].sort());
    for (const f of DURATION_FIELDS) expect(d[f]).toBe(0);
  });
  it('returns a fresh object each call', () => {
    const a = zeroDurations();
    const b = zeroDurations();
    expect(a).not.toBe(b);
    a.total = 90;
    expect(b.total).toBe(0);
    expect(zeroDurations().total).toBe(0);
  });
});
