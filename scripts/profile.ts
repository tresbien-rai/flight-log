/**
 * Summarise a logbook export from the command line.
 *
 *   npm run profile -- <logten|foreflight> <file> [--mapped]
 *
 * Prints counts and totals only: no names, remarks or row content. `--mapped` applies the
 * column mappings in scripts/columns.ts for user-defined fields.
 */
import { readFileSync } from 'node:fs';
import { importForeFlight, importLogTen } from '../src/core/importers';
import type { ImportResult, SourceRecord } from '../src/core/importers';
import { DURATION_FIELDS } from '../src/core/model';
import { formatDecimal } from '../src/core/time/duration';
import { COLUMN_PRESETS } from '../src/core/importers/presets';

const [source, file, ...flags] = process.argv.slice(2);
if ((source !== 'logten' && source !== 'foreflight') || file === undefined) {
  console.error('usage: npm run profile -- <logten|foreflight> <file> [--mapped]');
  process.exit(2);
}

const options = flags.includes('--mapped') ? { columns: COLUMN_PRESETS[source] } : undefined;
const text = readFileSync(file, 'utf8');
const result: ImportResult =
  source === 'logten' ? importLogTen(text, options) : importForeFlight(text, options);

const hours = (minutes: number): string => formatDecimal(minutes, 1).padStart(9);

function tally<K extends string>(items: readonly K[]): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function printTable(title: string, rows: readonly (readonly [string, string])[]): void {
  console.log(`\n${title}`);
  for (const [label, value] of rows) console.log(`  ${label.padEnd(34)}${value}`);
}

const { records, aircraft, issues } = result;
const dates = records
  .map((r) => r.date)
  .filter((d) => d !== '')
  .sort();

printTable(`${source}: ${file.split('/').pop() ?? file}`, [
  ['records', String(records.length)],
  ['aircraft', String(aircraft.length)],
  ['date range', `${dates[0] ?? '-'} to ${dates[dates.length - 1] ?? '-'}`],
  ...[...tally(records.map((r) => r.kind))].map(([k, n]) => [`kind: ${k}`, String(n)] as const),
  ...[...tally(records.map((r) => r.rule ?? 'not stated'))].map(
    ([k, n]) => [`rule: ${k}`, String(n)] as const,
  ),
  ['with clock times', String(records.filter((r) => r.clock.out !== undefined).length)],
  ['local flights', String(records.filter((r) => r.localFlight === true).length)],
]);

printTable(
  'Durations (hours)',
  DURATION_FIELDS.map((f) => [f, hours(sum(records, (r) => r.durations[f]))] as const).filter(
    ([, v]) => v.trim() !== '0.0',
  ),
);

const countKeys = [
  'dayTakeoffs',
  'nightTakeoffs',
  'dayLandings',
  'nightLandings',
  'dayFullStopLandings',
  'nightFullStopLandings',
  'fullStopLandings',
  'touchAndGoes',
  'allLandings',
  'holds',
  'goArounds',
] as const;
printTable('Counts', [
  ...countKeys
    .map((k) => [k, sum(records, (r) => r.counts[k])] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => [k, String(n).padStart(9)] as const),
  ['approaches', String(sum(records, (r) => r.approaches.length)).padStart(9)],
]);

const customKeys = [...new Set(records.flatMap((r) => Object.keys(r.custom)))].sort();
if (customKeys.length > 0) {
  printTable(
    'User-defined fields',
    customKeys.map((key) => {
      const values = records.map((r) => r.custom[key]).filter((v) => v !== undefined);
      const numbers = values.filter((v): v is number => typeof v === 'number');
      const trues = values.filter((v) => v === true).length;
      const detail =
        numbers.length > 0
          ? `sum ${numbers.reduce((a, b) => a + b, 0)}`
          : trues > 0
            ? `${trues} true`
            : 'text';
      return [key, `${values.length} rows, ${detail}`] as const;
    }),
  );
}

const typeOf = new Map(aircraft.map((a) => [a.tail, a.typeCode ?? '(none)']));
const byType = new Map<string, { flights: number; minutes: number; tails: Set<string> }>();
for (const r of records) {
  const type = r.tail === undefined ? '(no aircraft)' : (typeOf.get(r.tail) ?? '(none)');
  const row = byType.get(type) ?? { flights: 0, minutes: 0, tails: new Set<string>() };
  row.flights += 1;
  row.minutes += r.durations.total ?? 0;
  if (r.tail !== undefined) row.tails.add(r.tail);
  byType.set(type, row);
}
printTable(
  'By aircraft type           rows  tails    hours',
  [...byType]
    .sort((a, b) => b[1].flights - a[1].flights)
    .map(
      ([type, v]) =>
        [
          type,
          `${String(v.flights).padStart(3)}  ${String(v.tails.size).padStart(5)}${hours(v.minutes)}`,
        ] as const,
    ),
);

const byYear = new Map<string, { flights: number; minutes: number }>();
for (const r of records) {
  const year = r.date.slice(0, 4) || '(none)';
  const row = byYear.get(year) ?? { flights: 0, minutes: 0 };
  row.flights += 1;
  row.minutes += r.durations.total ?? 0;
  byYear.set(year, row);
}
printTable(
  'By year                    rows    hours',
  [...byYear]
    .sort()
    .map(([y, v]) => [y, `${String(v.flights).padStart(3)}${hours(v.minutes)}`] as const),
);

printTable(
  `Issues (${issues.length})`,
  [...tally(issues.map((i) => `${i.severity}: ${i.code}`))].map(
    ([k, n]) => [k, String(n)] as const,
  ),
);

function sum(rows: readonly SourceRecord[], pick: (r: SourceRecord) => number | undefined): number {
  return rows.reduce((total, r) => total + (pick(r) ?? 0), 0);
}
