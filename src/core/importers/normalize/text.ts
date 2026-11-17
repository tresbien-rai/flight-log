/** Small cell-level parsers shared by the importers. All are pure and never throw. */

import { parseDuration } from '../../time/duration';

/** Trim and collapse whitespace runs to one space; `undefined` if nothing is left. */
export function clean(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.replace(/\s+/g, ' ').trim();
  return t === '' ? undefined : t;
}

export function normalizeTail(s: string | undefined): string | undefined {
  return clean(s)?.toUpperCase();
}

export function normalizeAirport(s: string | undefined): { ident?: string; local: boolean } {
  const c = normalizeTail(s);
  if (c === undefined) return { local: false };
  if (c === 'LOCAL') return { local: true };
  return { ident: c, local: false };
}

/** `YYYY-MM-DD` that is a real calendar date, else undefined. */
export function parseDate(s: string | undefined): string | undefined {
  const t = s?.trim();
  if (t === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Date.UTC maps years 0-99 to 1900+, so set the year explicitly.
  dt.setUTCFullYear(y);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return undefined;
  }
  return t;
}

/** `HH:MM` or `H:MM` (00:00-23:59) as minutes after midnight. */
export function parseClock(s: string | undefined): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s?.trim() ?? '');
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return h * 60 + min;
}

const THOUSANDS = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)`;
const COUNT_RE = new RegExp(String.raw`^(${THOUSANDS})(?:\.0+)?$`);
const NUMBER_RE = new RegExp(String.raw`^(${THOUSANDS}(?:\.\d+)?|\.\d+)$`);

/** Non-negative integer; tolerates `2.0`/`2.00` and thousands commas. */
export function parseCount(s: string | undefined): number | undefined {
  const m = COUNT_RE.exec(s?.trim() ?? '');
  return m ? Number(m[1]!.replace(/,/g, '')) : undefined;
}

/** Non-negative decimal; tolerates thousands commas (`1,684.0` -> 1684). */
export function parseNumber(s: string | undefined): number | undefined {
  const m = NUMBER_RE.exec(s?.trim() ?? '');
  return m ? Number(m[1]!.replace(/,/g, '')) : undefined;
}

export function parseBool(s: string | undefined): boolean | undefined {
  switch (s?.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'x':
      return true;
    case '0':
    case 'false':
    case 'no':
      return false;
    default:
      return undefined;
  }
}

/** Decimal hours (or anything `parseDuration` accepts) to integer minutes. */
export function parseHours(s: string | undefined): number | undefined {
  const t = s?.trim();
  if (t === undefined || t === '') return undefined;
  let u = t;
  if (t.includes(',')) {
    // Only genuine thousands grouping, e.g. "1,684.0"; "1,5" stays invalid.
    if (!/^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(t)) return undefined;
    u = t.replace(/,/g, '');
  }
  return parseDuration(u) ?? undefined;
}
