import { formatDecimal } from '../time/duration';
import type { DurationField } from '../model';

/** Minutes as decimal hours with one place, e.g. 96 -> "1.6". Tolerates odd input without throwing. */
export function hours(minutes: number): string {
  if (!Number.isFinite(minutes)) return String(minutes);
  const m = Math.round(Math.abs(minutes));
  return (minutes < 0 && m > 0 ? '-' : '') + formatDecimal(m);
}

/** Milliseconds since the epoch for an instant string, or undefined when absent or unparseable. */
export function instantMs(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

/** An instant as a UTC clock time, e.g. `2025-06-22T17:31Z` -> "17:31Z". Falls back to the raw text. */
export function clock(iso: string): string {
  const ms = instantMs(iso);
  if (ms === undefined) return iso;
  return `${new Date(ms).toISOString().slice(11, 16)}Z`;
}

/** Whole minutes from `a` to `b` (negative if b is earlier), or undefined if either is unusable. */
export function minutesBetween(a: string | undefined, b: string | undefined): number | undefined {
  const x = instantMs(a);
  const y = instantMs(b);
  if (x === undefined || y === undefined) return undefined;
  return Math.round((y - x) / 60000);
}

const FIELD_LABELS: Record<DurationField, string> = {
  total: 'Total time',
  pic: 'PIC time',
  sic: 'SIC time',
  solo: 'Solo time',
  night: 'Night time',
  crossCountry: 'Cross-country time',
  crossCountry50: 'Cross-country (50 NM) time',
  actualInstrument: 'Actual instrument time',
  simulatedInstrument: 'Simulated instrument time',
  dualReceived: 'Dual received time',
  dualGiven: 'Dual given time',
  simulator: 'Simulator time',
  groundTraining: 'Ground training time',
};

export function fieldLabel(field: DurationField): string {
  return FIELD_LABELS[field];
}
