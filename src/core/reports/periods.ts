/** Date arithmetic for report periods. Dates are `YYYY-MM-DD`; all ranges are inclusive. */
import type { LookBack } from './types';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1;
}

const toUtc = (date: string): Date => {
  const m = DATE.exec(date);
  if (!m) throw new Error(`Not a date: ${date}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};

const fromUtc = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Moves by whole months, keeping the day of the month where it exists (Mar 31 − 1 month = Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUtc(target);
}

/**
 * The dates a look-back covers, ending on `asOf`. "90 days" is `asOf` and the 89 days before
 * it (14 CFR 61.57's "preceding 90 days"); "12 months" starts the day after the same date a
 * year earlier.
 */
export function lookBackRange(asOf: string, lookBack: LookBack): { from: string; to: string } {
  const from =
    lookBack.unit === 'days'
      ? addDays(asOf, -(lookBack.count - 1))
      : addDays(addMonths(asOf, -lookBack.count), 1);
  return { from, to: asOf };
}

export function lookBackId(lookBack: LookBack): string {
  return `${lookBack.unit === 'days' ? 'd' : 'm'}${lookBack.count}`;
}

export function lookBackLabel(lookBack: LookBack): string {
  const { unit, count } = lookBack;
  if (unit === 'months' && count % 12 === 0) {
    const years = count / 12;
    // Twelve and twenty-four months are how applications ask; longer spans read as years.
    if (years > 2) return `Last ${years} years`;
  }
  const noun = unit === 'days' ? 'day' : 'month';
  return `Last ${count} ${noun}${count === 1 ? '' : 's'}`;
}
