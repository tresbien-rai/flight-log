import { describe, expect, it } from 'vitest';
import { DURATION_FIELDS, zeroDurations } from '../model';
import { makeEntry } from '../validation/testing';
import { emptyTotals, totalEntries } from './totals';

describe('emptyTotals', () => {
  it('is all zero and returns fresh objects', () => {
    const t = emptyTotals();
    expect(t.flights).toBe(0);
    expect(t.durations).toEqual(zeroDurations());
    t.durations.total = 5;
    expect(emptyTotals().durations.total).toBe(0);
  });
});

describe('totalEntries', () => {
  it('returns empty totals for no entries', () => {
    expect(totalEntries([])).toEqual(emptyTotals());
  });

  it('counts entries by kind', () => {
    const t = totalEntries([
      makeEntry({ id: '1' }),
      makeEntry({ id: '2' }),
      makeEntry({ id: '3', kind: 'simulator' }),
      makeEntry({ id: '4', kind: 'ground' }),
      makeEntry({ id: '5', kind: 'ground' }),
    ]);
    expect([t.flights, t.simulatorSessions, t.groundSessions]).toEqual([2, 1, 2]);
  });

  it('sums every duration field', () => {
    const a = makeEntry({ id: 'a' });
    const b = makeEntry({ id: 'b' });
    DURATION_FIELDS.forEach((f, i) => {
      a.durations[f] = i + 1;
      b.durations[f] = 10 * (i + 1);
    });
    const t = totalEntries([a, b]);
    DURATION_FIELDS.forEach((f, i) => expect(t.durations[f]).toBe(11 * (i + 1)));
  });

  it('adds takeoffs, landings, approaches and holds', () => {
    const t = totalEntries([
      makeEntry({
        id: 'a',
        dayTakeoffs: 2,
        nightTakeoffs: 1,
        landings: { dayFullStop: 1, dayTouchAndGo: 3, nightFullStop: 2, nightTouchAndGo: 4 },
        approaches: [{ type: 'ILS' }, { type: 'VOR' }],
        holds: 1,
      }),
      makeEntry({
        id: 'b',
        dayTakeoffs: 1,
        nightTakeoffs: 0,
        landings: { dayFullStop: 5, dayTouchAndGo: 0, nightFullStop: 0, nightTouchAndGo: 1 },
        approaches: [{ type: 'LOC' }],
        holds: 2,
      }),
    ]);
    expect(t.dayTakeoffs).toBe(3);
    expect(t.nightTakeoffs).toBe(1);
    expect(t.dayLandings).toBe(9);
    expect(t.nightLandings).toBe(7);
    expect(t.approaches).toBe(3);
    expect(t.holds).toBe(3);
  });

  it('skips deleted entries', () => {
    const t = totalEntries([
      makeEntry({ id: 'a' }),
      makeEntry({ id: 'b', deletedAt: '2025-01-01T00:00Z', holds: 9 }),
    ]);
    expect(t.flights).toBe(1);
    expect(t.durations.total).toBe(60);
    expect(t.holds).toBe(0);
  });
});
