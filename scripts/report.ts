/**
 * Print the experience report for one logbook export.
 *
 *   npm run report -- <logten|foreflight> <file> [--layout full|airline|foreflight]
 *                     [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--csv <out.csv>]
 *
 * Shows hours and counts per type, class, engine and so on; never names or remarks. Write any
 * CSV under data/.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createAirportLookup } from '../src/core/airports';
import type { AirportData } from '../src/core/airports';
import airportData from '../src/core/airports/airports.data.json' with { type: 'json' };
import {
  COLUMN_PRESETS,
  CUSTOM_FIELDS,
  importForeFlight,
  importLogTen,
  toLogbook,
} from '../src/core/importers';
import { indexLogbook } from '../src/core/query';
import {
  AIRLINE_LAYOUT,
  experienceReport,
  FOREFLIGHT_LAYOUT,
  FULL_LAYOUT,
  hoursText,
  reportToCsv,
} from '../src/core/reports';
import type { ReportLayout, ReportRow, ReportSection } from '../src/core/reports';

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const [source, file] = positional;
const layouts: Record<string, ReportLayout> = {
  full: FULL_LAYOUT,
  airline: AIRLINE_LAYOUT,
  foreflight: FOREFLIGHT_LAYOUT,
};
const base = layouts[option('--layout') ?? 'full'];
if ((source !== 'logten' && source !== 'foreflight') || file === undefined || !base) {
  console.error(
    'usage: npm run report -- <logten|foreflight> <file> [--layout full|airline|foreflight] [--from D] [--to D] [--csv out.csv]',
  );
  process.exit(2);
}
const from = option('--from');
const to = option('--to');
const layout: ReportLayout = from || to ? { ...base, period: { kind: 'range', from, to } } : base;

const airports = createAirportLookup(airportData as unknown as AirportData);
const text = readFileSync(file, 'utf8');
const options = { columns: COLUMN_PRESETS[source] };
const imported =
  source === 'logten' ? importLogTen(text, options) : importForeFlight(text, options);
const { logbook } = toLogbook(imported, { airports });
const report = experienceReport(logbook, indexLogbook(logbook), layout, {
  today: new Date().toISOString().slice(0, 10),
  customFields: CUSTOM_FIELDS,
});

const csvOut = option('--csv');
if (csvOut) {
  writeFileSync(csvOut, reportToCsv(report));
  console.log(`wrote ${csvOut}`);
}

console.log(
  `Experience report, ${source}: ${report.covered ? `${report.covered.from} to ${report.covered.to}` : 'no entries'}; ` +
    `as of ${report.asOf}; rounded ${report.rounding === 'perFlight' ? 'per flight' : 'once on the total'}`,
);

function print(section: ReportSection): void {
  const cell = (row: ReportRow, i: number) => {
    const v = row.cells[i]?.value ?? 0;
    return section.columns[i]?.unit === 'minutes' ? hoursText(v) : String(v);
  };
  const head = [
    section.rowHeading,
    ...(section.countNoun ? ['#'] : []),
    ...section.columns.map((c) => c.short),
  ];
  const body = [...section.rows, ...(section.total ? [section.total] : [])].map((r) => [
    `${r.depth ? '  ' : ''}${r.label}`,
    ...(section.countNoun ? [String(r.count)] : []),
    ...section.columns.map((_, i) => cell(r, i)),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i]?.length ?? 0)));
  const fmt = (cells: string[]) =>
    cells
      .map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0)))
      .join('  ');
  console.log(`\n${section.title.toUpperCase()}`);
  console.log(fmt(head));
  for (const b of body) console.log(fmt(b));
}

for (const section of report.sections) print(section);
