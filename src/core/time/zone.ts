/**
 * Time-zone helpers. Instants are UTC ISO strings at minute precision (`2025-06-22T00:30Z`);
 * dates are `YYYY-MM-DD`. Uses only `Intl.DateTimeFormat`, which is part of the ES library.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    // Throws RangeError for an unknown zone.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

function parseInstant(instant: string): number {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid instant: ${instant}`);
  return ms;
}

function formatInstant(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16) + 'Z';
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The `YYYY-MM-DD` calendar date at the UTC instant in the IANA zone `tz`. */
export function localDateOf(instant: string, tz: string): string {
  const parts = formatterFor(tz).formatToParts(new Date(parseInstant(instant)));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}

function utcInstant(date: string, dayOffset: number, utcMinutes: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return base + dayOffset * DAY + utcMinutes * MINUTE;
}

/**
 * The UTC instant with clock time `utcMinutes` (minutes after 00:00Z) whose local date in `tz`
 * is `localDate`. Tries the UTC dates localDate-1, localDate, localDate+1 in that order; falls
 * back to the UTC date `localDate` when `tz` is undefined or nothing matches.
 */
export function resolveUtcClock(
  localDate: string,
  utcMinutes: number,
  tz: string | undefined,
): string {
  if (tz !== undefined) {
    for (const offset of [-1, 0, 1]) {
      const ms = utcInstant(localDate, offset, utcMinutes);
      const instant = formatInstant(ms);
      if (localDateOf(instant, tz) === localDate) return instant;
    }
  }
  return formatInstant(utcInstant(localDate, 0, utcMinutes));
}

/** The first instant at or after `previous` with the UTC clock time `utcMinutes`. */
export function instantAfter(previous: string, utcMinutes: number): string {
  const prev = parseInstant(previous);
  const dayStart = prev - (((prev % DAY) + DAY) % DAY);
  const sameDay = dayStart + utcMinutes * MINUTE;
  return formatInstant(sameDay >= prev ? sameDay : sameDay + DAY);
}

/** Whole minutes from `a` to `b` (negative if `b` is earlier). */
export function minutesBetween(a: string, b: string): number {
  return Math.round((parseInstant(b) - parseInstant(a)) / MINUTE);
}
