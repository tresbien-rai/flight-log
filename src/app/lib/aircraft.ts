/** Display helpers for the aircraft screen. Pure; no DOM. */
import type { AircraftType, Airframe, TrainingDevice } from '@core/model';
import type { Usage } from '@core/query';
import { emptyUsage } from '@core/query';
import { formatHours, formatInt } from './format';

export type AircraftTab = 'types' | 'aircraft' | 'simulators';

/** `1,324.2 h in 665 flights`; simulator time when there are no flights. */
export function usageText(u: Usage | undefined): string {
  const use = u ?? emptyUsage();
  const parts: string[] = [];
  if (use.flights > 0) {
    parts.push(
      `${formatHours(use.minutes)} h in ${formatInt(use.flights)} ${use.flights === 1 ? 'flight' : 'flights'}`,
    );
  }
  if (use.sessions > 0) {
    parts.push(
      `${formatHours(use.sessionMinutes)} h in ${formatInt(use.sessions)} simulator ${use.sessions === 1 ? 'session' : 'sessions'}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : 'Not flown';
}

const CLASS_TEXT: Record<string, string> = {
  ASEL: 'Single-engine land',
  AMEL: 'Multi-engine land',
  ASES: 'Single-engine sea',
  AMES: 'Multi-engine sea',
  helicopter: 'Helicopter',
  gyroplane: 'Gyroplane',
  other: 'Other',
};

const ENGINE_TEXT: Record<string, string> = {
  piston: 'Piston',
  turboprop: 'Turboprop',
  turbofan: 'Turbofan',
  turbojet: 'Turbojet',
  turboshaft: 'Turboshaft',
  electric: 'Electric',
  none: 'None',
};

export const classText = (c: string) => CLASS_TEXT[c] ?? c;
export const engineText = (e: string) => ENGINE_TEXT[e] ?? e;

/** `Complex · Retractable gear · Pressurised`, or `None`. */
export function attributeText(
  t: Pick<
    AircraftType,
    | 'complex'
    | 'highPerformance'
    | 'taa'
    | 'pressurized'
    | 'retractable'
    | 'tailwheel'
    | 'multiPilot'
  >,
): string {
  const parts = [
    t.multiPilot ? 'Multi-pilot' : undefined,
    t.complex ? 'Complex' : undefined,
    t.highPerformance ? 'High performance' : undefined,
    t.taa ? 'TAA' : undefined,
    t.retractable ? 'Retractable gear' : 'Fixed gear',
    t.tailwheel ? 'Tailwheel' : undefined,
    t.pressurized ? 'Pressurised' : undefined,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** The tail an airframe wears now (its latest registration). */
export function currentTail(f: Airframe): string {
  return f.registrations.at(-1)?.value ?? f.id;
}

/** `From 2025-03-10`, `Until 2025-03-09`, `2024-01-01 – 2025-03-09`, or empty for always. */
export function periodText(from?: string, to?: string): string {
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return '';
}

/** Rows sorted by flight time, most first, then by name. */
export function byUse<T>(
  rows: readonly T[],
  usageOf: (row: T) => Usage | undefined,
  name: (row: T) => string,
): T[] {
  const time = (row: T) => {
    const u = usageOf(row);
    return u ? u.minutes + u.sessionMinutes : 0;
  };
  return [...rows].sort((x, y) => time(y) - time(x) || name(x).localeCompare(name(y)));
}

export function deviceText(d: TrainingDevice): string {
  return d.represents ? `${d.level} · ${d.represents}` : d.level;
}
