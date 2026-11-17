/** Display formatting for the ledger and detail pane. Pure; no DOM. */
import { formatDecimal, formatHM } from '@core/time/duration';

const groupThousands = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Whole number with thousands separators, e.g. 1312 -> "1,312". */
export function formatInt(n: number): string {
  return groupThousands(String(Math.round(n)));
}

/** Minutes as decimal hours with one place and thousands separators, e.g. 173964 -> "2,899.4". */
export function formatHours(minutes: number): string {
  const [whole = '0', frac = '0'] = formatDecimal(Math.max(0, Math.round(minutes))).split('.');
  return `${groupThousands(whole)}.${frac}`;
}

/** Like `formatHours`, but a zero is left blank, as on a paper page. */
export function hoursOrBlank(minutes: number): string {
  return minutes > 0 ? formatHours(minutes) : '';
}

/** A count; zero is left blank. */
export function countOrBlank(n: number): string {
  return n > 0 ? formatInt(n) : '';
}

/** Day and night landings as `2 / 1`; blank when there are none. */
export function landingsText(day: number, night: number): string {
  return day === 0 && night === 0 ? '' : `${formatInt(day)} / ${formatInt(night)}`;
}

/** An instant as a UTC clock time, e.g. `2025-06-22T17:31Z` -> "17:31Z". Falls back to the raw text. */
export function utcClock(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : `${new Date(ms).toISOString().slice(11, 16)}Z`;
}

/** Whole minutes from `a` to `b`, or undefined if either is missing, unusable or `b` is earlier. */
export function minutesBetween(a: string | undefined, b: string | undefined): number | undefined {
  if (a === undefined || b === undefined) return undefined;
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (Number.isNaN(x) || Number.isNaN(y) || y < x) return undefined;
  return Math.round((y - x) / 60000);
}

/** `2.9 h (2:54)` */
export function hoursAndClock(minutes: number): string {
  return `${formatDecimal(minutes)} h (${formatHM(minutes)})`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `2026-11` -> "November 2026"; an empty key (entries with no date) -> "No date". */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  const name = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && name ? `${name} ${m[1]}` : 'No date';
}

function parseDate(date: string): { y: number; m: number; d: number; dow: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCMonth() !== mo - 1) return undefined;
  return { y, m: mo, d, dow: at.getUTCDay() };
}

/** `2026-11-07` -> { day: "7", weekday: "Sat" }. Blank for an unusable date. */
export function dayAndWeekday(date: string): { day: string; weekday: string } {
  const p = parseDate(date);
  return p ? { day: String(p.d), weekday: WEEKDAYS[p.dow] ?? '' } : { day: '', weekday: '' };
}

/** `2026-11-07` -> "Sat 7 Nov 2026". */
export function longDate(date: string): string {
  const p = parseDate(date);
  if (!p) return date === '' ? 'No date' : date;
  return `${WEEKDAYS[p.dow]} ${p.d} ${MONTHS[p.m - 1]?.slice(0, 3)} ${p.y}`;
}

/** `2026-11-07` -> "7 Nov 2026" */
export function shortDate(date: string): string {
  const p = parseDate(date);
  return p ? `${p.d} ${MONTHS[p.m - 1]?.slice(0, 3)} ${p.y}` : date;
}

/** When a book was imported, in the device's own time and language. */
export function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}
