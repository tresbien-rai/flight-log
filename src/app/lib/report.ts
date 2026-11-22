/** Words and numbers for the experience report screen. Pure; no DOM. */
import type { OperatingRule, PilotProfile } from '@core/model';
import { hoursText, lookBackId, lookBackLabel } from '@core/reports';
import type { ColumnUnit, LookBack, Report, ReportLayout } from '@core/reports';
import { formatInt, shortDate } from './format';

/** Report hours: tenths rounded half up (as in the CSV), with thousands separators. */
export function reportHours(minutes: number): string {
  const [whole = '0', frac = '0'] = hoursText(minutes).split('.');
  return `${formatInt(Number(whole))}.${frac}`;
}

export function reportValue(value: number, unit: ColumnUnit): string {
  return unit === 'minutes' ? reportHours(value) : formatInt(value);
}

/** "All time", "Since 1 Jan 2024", "1 Jan 2024 to 2 Jun 2024", "Up to 2 Jun 2024". */
export function periodText(report: Report): string {
  const p = report.period;
  if (p.kind === 'all' || (p.from === undefined && p.to === undefined)) return 'All time';
  if (p.from !== undefined && p.to !== undefined) {
    return `${shortDate(p.from)} to ${shortDate(p.to)}`;
  }
  return p.from !== undefined ? `Since ${shortDate(p.from)}` : `Up to ${shortDate(p.to ?? '')}`;
}

export function roundingText(report: Report): string {
  return report.rounding === 'perFlight'
    ? 'Each flight rounded to a tenth of an hour before adding'
    : 'Exact minutes added, each total rounded once to a tenth of an hour';
}

const RULE_NAMES: Record<OperatingRule, string> = {
  '121': 'Part 121',
  '135': 'Part 135',
  '91': 'Part 91',
  other: 'other rules',
};

/** Undefined when every rule is included. */
export function rulesText(report: Report): string | undefined {
  if (report.rules.length === 0) return undefined;
  return `Flights under ${report.rules.map((r) => RULE_NAMES[r]).join(' and ')} only`;
}

/** The lines printed above the tables, in the CSV too. */
export function headerLines(report: Report, pilot: PilotProfile, book: string): string[] {
  return [
    pilot.name.trim() || 'Experience report',
    `Experience report: ${periodText(report)}`,
    ...(rulesText(report) ? [rulesText(report) as string] : []),
    roundingText(report),
    `From the ${book} book`,
  ];
}

/** Look-backs the layout panel offers. Any others in a stored layout are kept and shown too. */
export const LOOK_BACK_CHOICES: readonly LookBack[] = [
  { unit: 'days', count: 30 },
  { unit: 'days', count: 60 },
  { unit: 'days', count: 90 },
  { unit: 'months', count: 6 },
  { unit: 'months', count: 12 },
  { unit: 'months', count: 24 },
  { unit: 'months', count: 36 },
  { unit: 'months', count: 60 },
  { unit: 'months', count: 120 },
];

const lookBackDays = (lb: LookBack) => (lb.unit === 'days' ? lb.count : lb.count * 30.44);

/** Choices plus anything else the layout holds, shortest first. */
export function lookBackOptions(layout: ReportLayout): { lookBack: LookBack; label: string }[] {
  const all = new Map<string, LookBack>();
  for (const lb of [...LOOK_BACK_CHOICES, ...layout.lookBacks]) all.set(lookBackId(lb), lb);
  return [...all.values()]
    .sort((a, b) => lookBackDays(a) - lookBackDays(b))
    .map((lookBack) => ({ lookBack, label: lookBackLabel(lookBack) }));
}

/** Turns one look-back on or off, keeping them shortest first. */
export function toggleLookBack(layout: ReportLayout, lookBack: LookBack): LookBack[] {
  const id = lookBackId(lookBack);
  const has = layout.lookBacks.some((lb) => lookBackId(lb) === id);
  const next = has
    ? layout.lookBacks.filter((lb) => lookBackId(lb) !== id)
    : [...layout.lookBacks, lookBack];
  return next.sort((a, b) => lookBackDays(a) - lookBackDays(b));
}

/** Two layouts are the same when they would draw the same report. */
export function sameLayout(a: ReportLayout, b: ReportLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** `experience-report-2026-11-22.csv` */
export function csvFileName(today: string): string {
  return `experience-report-${today}.csv`;
}
