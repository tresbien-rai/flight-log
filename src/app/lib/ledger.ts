/** Turns a sorted list of entries into ledger rows and the figures shown in them. */
import type { Entry } from '@core/model';
import { totalEntries } from '@core/query';
import { monthLabel } from './format';

export type MonthItem = {
  type: 'month';
  key: string;
  label: string;
  totalMinutes: number;
  count: number;
};
export type LedgerItem = MonthItem | { type: 'entry'; entry: Entry };

/** Entries must already be sorted by date; a month header is inserted at each change of month. */
export function buildLedgerItems(sorted: readonly Entry[]): LedgerItem[] {
  const items: LedgerItem[] = [];
  let header: MonthItem | undefined;
  for (const entry of sorted) {
    const key = entry.date.slice(0, 7);
    if (header === undefined || header.key !== key) {
      header = { type: 'month', key, label: monthLabel(key), totalMinutes: 0, count: 0 };
      items.push(header);
    }
    header.totalMinutes += entry.durations.total;
    header.count += 1;
    items.push({ type: 'entry', entry });
  }
  return items;
}

/** What goes in the total column: flight time, or the session length for simulator and ground. */
export function shownTotal(entry: Entry): number {
  if (entry.kind === 'simulator') return entry.durations.simulator || entry.durations.total;
  if (entry.kind === 'ground') return entry.durations.groundTraining || entry.durations.total;
  return entry.durations.total;
}

export interface Figures {
  total: number;
  pic: number;
  sic: number;
  night: number;
  instrument: number;
  dayLandings: number;
  nightLandings: number;
}

export function entryFigures(entry: Entry): Figures {
  const d = entry.durations;
  const l = entry.landings;
  return {
    total: shownTotal(entry),
    pic: d.pic,
    sic: d.sic,
    night: d.night,
    instrument: d.actualInstrument + d.simulatedInstrument,
    dayLandings: l.dayFullStop + l.dayTouchAndGo,
    nightLandings: l.nightFullStop + l.nightTouchAndGo,
  };
}

export interface PageTotals extends Figures {
  count: number;
  flights: number;
  simulatorSessions: number;
  groundSessions: number;
}

/**
 * The totals for the foot of the page. The total column adds up flight time only: simulator and
 * ground sessions are shown in their own rows but are not flight time.
 */
export function pageTotals(entries: readonly Entry[]): PageTotals {
  const t = totalEntries(entries);
  return {
    count: t.flights + t.simulatorSessions + t.groundSessions,
    flights: t.flights,
    simulatorSessions: t.simulatorSessions,
    groundSessions: t.groundSessions,
    total: t.durations.total,
    pic: t.durations.pic,
    sic: t.durations.sic,
    night: t.durations.night,
    instrument: t.durations.actualInstrument + t.durations.simulatedInstrument,
    dayLandings: t.dayLandings,
    nightLandings: t.nightLandings,
  };
}
