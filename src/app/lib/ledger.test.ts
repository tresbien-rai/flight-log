import { describe, expect, it } from 'vitest';
import { zeroDurations } from '@core/model';
import { makeEntry } from '@core/validation/testing';
import { buildLedgerItems, entryFigures, pageTotals, shownTotal } from './ledger';

const flight = (id: string, date: string, total: number) =>
  makeEntry({ id, date, durations: { ...zeroDurations(), total, pic: total } });
const sim = makeEntry({
  id: 'sim',
  kind: 'simulator',
  date: '2025-05-02',
  durations: { ...zeroDurations(), simulator: 72, simulatedInstrument: 72 },
});
const ground = makeEntry({
  id: 'gnd',
  kind: 'ground',
  date: '2025-05-01',
  durations: { ...zeroDurations(), groundTraining: 60 },
});

describe('ledger rows', () => {
  it('inserts a month heading at each change of month with that month total', () => {
    const items = buildLedgerItems([
      flight('a', '2025-06-22', 60),
      flight('b', '2025-06-02', 30),
      flight('c', '2025-05-30', 90),
    ]);
    expect(items.map((i) => i.type)).toEqual(['month', 'entry', 'entry', 'month', 'entry']);
    expect(items[0]).toMatchObject({
      key: '2025-06',
      label: 'June 2025',
      totalMinutes: 90,
      count: 2,
    });
    expect(items[3]).toMatchObject({ key: '2025-05', totalMinutes: 90, count: 1 });
  });

  it('shows the session length for simulator and ground entries', () => {
    expect(shownTotal(sim)).toBe(72);
    expect(shownTotal(ground)).toBe(60);
    expect(shownTotal(flight('a', '2025-06-22', 45))).toBe(45);
  });

  it('adds actual and simulated instrument, and day and night landings', () => {
    const e = makeEntry({
      durations: { ...zeroDurations(), total: 60, actualInstrument: 10, simulatedInstrument: 5 },
      landings: { dayFullStop: 1, dayTouchAndGo: 2, nightFullStop: 1, nightTouchAndGo: 0 },
    });
    expect(entryFigures(e)).toMatchObject({ instrument: 15, dayLandings: 3, nightLandings: 1 });
  });
});

describe('page totals', () => {
  it('counts every entry but adds only flight time to the total column', () => {
    const t = pageTotals([
      flight('a', '2025-06-22', 60),
      flight('b', '2025-06-02', 30),
      sim,
      ground,
    ]);
    expect(t).toMatchObject({
      count: 4,
      flights: 2,
      simulatorSessions: 1,
      groundSessions: 1,
      total: 90,
      pic: 90,
      instrument: 72,
      dayLandings: 4,
    });
  });

  it('is all zero for no entries', () => {
    expect(pageTotals([])).toMatchObject({ count: 0, total: 0, dayLandings: 0 });
  });
});
