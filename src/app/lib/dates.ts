/** Calendar helpers for the date filter. Dates are `YYYY-MM-DD` strings; no time zones involved. */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;

/** Today's date on this device, as `YYYY-MM-DD`. The only place the clock is read. */
export function todayIso(now: Date = new Date()): string {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function toUtc(date: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Moves back/forward whole months, clamping to the end of a shorter month. */
export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fromUtc(d);
}

export interface QuickRange {
  id: 'all' | 'year' | '12m' | '90d';
  label: string;
  /** Empty string means unbounded. */
  from: string;
  to: string;
}

/** The quick picks, computed from `today` (`YYYY-MM-DD`). */
export function quickRanges(today: string): QuickRange[] {
  const year = today.slice(0, 4);
  return [
    { id: 'all', label: 'All time', from: '', to: '' },
    { id: 'year', label: 'This year', from: `${year}-01-01`, to: `${year}-12-31` },
    { id: '12m', label: 'Last 12 months', from: addDays(addMonths(today, -12), 1), to: today },
    { id: '90d', label: 'Last 90 days', from: addDays(today, -89), to: today },
  ];
}

/** The quick pick that exactly matches a date range, if any. */
export function matchingQuickRange(
  from: string,
  to: string,
  today: string,
): QuickRange | undefined {
  return quickRanges(today).find((r) => r.from === from && r.to === to);
}
