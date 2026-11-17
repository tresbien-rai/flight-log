import type { Airport } from '../../airports/types';
import type { Entry } from '../../model';
import type { Finding, RuleContext, Severity } from '../types';

export function finding(
  ruleId: string,
  severity: Severity,
  entryIds: string[],
  fields: string[],
  message: string,
): Finding {
  return { ruleId, severity, entryIds, fields, message };
}

/** Great-circle distance in nautical miles (mean Earth radius 3440.065 NM). */
export function haversineNm(a: Airport, b: Airport): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Ends {
  from: Airport;
  to: Airport;
}

/** Both airports of an entry, when airport data is loaded and both resolve. */
export function resolveEnds(entry: Entry, ctx: RuleContext): Ends | undefined {
  if (!ctx.airports || !entry.from || !entry.to) return undefined;
  const from = ctx.airports(entry.from);
  const to = ctx.airports(entry.to);
  return from && to ? { from, to } : undefined;
}

/** Whole days since the epoch for a `YYYY-MM-DD` date, or undefined if unparseable. */
export function dayNumber(date: string): number | undefined {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? undefined : Math.round(ms / 86400000);
}

/** Identity of an airport for comparing two legs: the resolved ident if known, else the text. */
export function airportKey(ident: string, ctx: RuleContext): string {
  return ctx.airports?.(ident)?.ident.toUpperCase() ?? ident.trim().toUpperCase();
}
