/**
 * Compare a LogTen export with a ForeFlight export of the same logbook.
 *
 *   npm run audit -- <logten file> <foreflight file> [--out <report.md>]
 *
 * The console summary holds counts and totals only. The optional report lists every flight
 * that needs a look, identified by date, tail and route; it never contains names or remarks.
 * Write it under the git-ignored data/ directory.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { importForeFlight, importLogTen } from '../src/core/importers';
import type { SourceRecord } from '../src/core/importers';
import { DURATION_FIELDS } from '../src/core/model';
import { diffPair, matchRecords, MATCH_TIERS } from '../src/core/reconcile';
import type { FieldDiff, PairDiff } from '../src/core/reconcile';
import { formatDecimal } from '../src/core/time/duration';
import { COLUMN_PRESETS } from './columns';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const outFile = outAt >= 0 ? args[outAt + 1] : undefined;
const [logtenFile, foreflightFile] = args.filter(
  (_, i) => outAt < 0 || (i !== outAt && i !== outAt + 1),
);
if (logtenFile === undefined || foreflightFile === undefined) {
  console.error('usage: npm run audit -- <logten file> <foreflight file> [--out <report.md>]');
  process.exit(2);
}

/** Fields that describe the flight but do not change any total. Reported separately. */
const INFORMATIONAL = /^(route|flightNumber|remarks|people|pilotFlying|rule|clock\.scheduled)/;

const logten = importLogTen(readFileSync(logtenFile, 'utf8'), { columns: COLUMN_PRESETS.logten });
const foreflight = importForeFlight(readFileSync(foreflightFile, 'utf8'), {
  columns: COLUMN_PRESETS.foreflight,
});
const match = matchRecords(logten.records, foreflight.records);
const diffs = match.pairs.map(diffPair);

const lines: string[] = [];
const say = (line = ''): void => void lines.push(line);
const table = (head: string[], rows: (string | number)[][]): void => {
  say(`| ${head.join(' | ')} |`);
  say(`| ${head.map(() => '---').join(' | ')} |`);
  for (const row of rows) say(`| ${row.join(' | ')} |`);
  say();
};
const sum = (
  rows: readonly SourceRecord[],
  pick: (r: SourceRecord) => number | undefined,
): number => rows.reduce((total, r) => total + (pick(r) ?? 0), 0);
const describe = (r: SourceRecord): string =>
  `${r.date} ${r.tail ?? '(no aircraft)'} ${r.from ?? '-'}→${r.localFlight === true ? 'local' : (r.to ?? '-')}`;
const show = (field: string, v: FieldDiff['a']): string =>
  v === undefined
    ? '—'
    : typeof v === 'number' && field.startsWith('durations.')
      ? formatDecimal(v, 2)
      : String(v);

// ---- Summary ----------------------------------------------------------------------------

say('# Logbook audit');
say();
say('## Matching');
say();
table(
  ['', 'LogTen', 'ForeFlight'],
  [
    ['Records', logten.records.length, foreflight.records.length],
    ['Matched', match.pairs.length, match.pairs.length],
    ['Unmatched', match.onlyA.length, match.onlyB.length],
  ],
);
table(
  ['How matched', 'Pairs'],
  MATCH_TIERS.map((tier) => [tier, match.pairs.filter((p) => p.tier === tier).length]),
);

const orphanRows = (label: string, rows: readonly SourceRecord[]): (string | number)[][] => {
  const groups = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.kind} ${r.date.slice(0, 4)}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].sort().map(([key, n]) => [label, key, n]);
};
table(
  ['Only in', 'Kind and year', 'Records'],
  [...orphanRows('LogTen', match.onlyA), ...orphanRows('ForeFlight', match.onlyB)],
);

say('## Totals (hours)');
say();
const matchedA = match.pairs.map((p) => p.a);
const matchedB = match.pairs.map((p) => p.b);
table(
  ['Field', 'LogTen', 'ForeFlight', 'Difference', 'Difference on matched flights'],
  DURATION_FIELDS.map((f) => {
    const a = sum(logten.records, (r) => r.durations[f]);
    const b = sum(foreflight.records, (r) => r.durations[f]);
    const m = sum(matchedB, (r) => r.durations[f]) - sum(matchedA, (r) => r.durations[f]);
    return [f, formatDecimal(a), formatDecimal(b), signed(b - a), signed(m)];
  }).filter((row) => row[1] !== '0.0' || row[2] !== '0.0'),
);

say('## Differences on matched flights');
say();
const fieldOrder: string[] = [];
const counts = new Map<
  string,
  { rounding: number; missingA: number; missingB: number; real: number }
>();
for (const { diffs: list } of diffs) {
  for (const d of list) {
    if (d.class === 'equivalent') continue;
    let row = counts.get(d.field);
    if (!row) {
      row = { rounding: 0, missingA: 0, missingB: 0, real: 0 };
      counts.set(d.field, row);
      fieldOrder.push(d.field);
    }
    if (d.class === 'real') row.real += 1;
    else if (d.pattern === 'rounding') row.rounding += 1;
    else if (d.pattern === 'missing-a') row.missingA += 1;
    else row.missingB += 1;
  }
}
const diffTable = (fields: string[]): void =>
  table(
    ['Field', 'Disagree', 'Rounding only', 'Blank in LogTen', 'Blank in ForeFlight'],
    fields.map((f) => {
      const c = counts.get(f)!;
      return [f, c.real, c.rounding, c.missingA, c.missingB];
    }),
  );
say('Fields that affect totals or currency:');
say();
diffTable(fieldOrder.filter((f) => !INFORMATIONAL.test(f)));
say('Descriptive fields:');
say();
diffTable(fieldOrder.filter((f) => INFORMATIONAL.test(f)));

const needsLook = diffs.filter((d) => d.diffs.some(isActionable));
say(
  `${needsLook.length} matched flights have at least one disagreement in a field that affects totals or currency.`,
);
say();

console.log(lines.join('\n'));

// ---- Detail report ----------------------------------------------------------------------

if (outFile !== undefined) {
  say('## Flights matched loosely');
  say();
  table(
    ['How matched', 'LogTen', 'ForeFlight'],
    match.pairs
      .filter((p) => p.tier !== 'exact' && p.tier !== 'session')
      .map((p) => [p.tier, describe(p.a), describe(p.b)]),
  );
  say('## Unmatched records');
  say();
  table(
    ['Only in', 'Kind', 'Record', 'Line'],
    [
      ...match.onlyA.map((r) => ['LogTen', r.kind, describe(r), r.line]),
      ...match.onlyB.map((r) => ['ForeFlight', r.kind, describe(r), r.line]),
    ],
  );
  say('## Flights to review');
  say();
  say('Rounding-only differences are left out. "—" means blank.');
  say();
  table(
    ['Flight (LogTen)', 'Field', 'LogTen', 'ForeFlight'],
    needsLook
      .sort((x, y) => x.pair.a.date.localeCompare(y.pair.a.date) || x.pair.a.line - y.pair.a.line)
      .flatMap((d: PairDiff) =>
        d.diffs
          .filter(isActionable)
          .map((f) => [describe(d.pair.a), f.field, show(f.field, f.a), show(f.field, f.b)]),
      ),
  );
  writeFileSync(outFile, lines.join('\n'));
  console.log(`Detail report written to ${outFile}`);
}

function isActionable(d: FieldDiff): boolean {
  if (INFORMATIONAL.test(d.field)) return false;
  return d.class === 'real' || (d.class === 'systematic' && d.pattern !== 'rounding');
}

function signed(minutes: number): string {
  return `${minutes < 0 ? '−' : '+'}${formatDecimal(Math.abs(minutes))}`;
}
