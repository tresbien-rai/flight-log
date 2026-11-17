import { DURATION_FIELDS, zeroDurations } from '../model';
import type { Entry } from '../model';
import type { Totals } from './types';

export function emptyTotals(): Totals {
  return {
    flights: 0,
    simulatorSessions: 0,
    groundSessions: 0,
    durations: zeroDurations(),
    dayTakeoffs: 0,
    nightTakeoffs: 0,
    dayLandings: 0,
    nightLandings: 0,
    approaches: 0,
    holds: 0,
  };
}

/** Adds up every non-deleted entry. */
export function totalEntries(entries: readonly Entry[]): Totals {
  const t = emptyTotals();
  for (const e of entries) {
    if (e.deletedAt !== undefined) continue;
    if (e.kind === 'flight') t.flights += 1;
    else if (e.kind === 'simulator') t.simulatorSessions += 1;
    else t.groundSessions += 1;
    for (const f of DURATION_FIELDS) t.durations[f] += e.durations[f];
    t.dayTakeoffs += e.dayTakeoffs;
    t.nightTakeoffs += e.nightTakeoffs;
    t.dayLandings += e.landings.dayFullStop + e.landings.dayTouchAndGo;
    t.nightLandings += e.landings.nightFullStop + e.landings.nightTouchAndGo;
    t.approaches += e.approaches.length;
    t.holds += e.holds;
  }
  return t;
}
