/**
 * Run the validation rules over one logbook export.
 *
 *   npm run validate -- <logten|foreflight> <file> [--out <report.md>]
 *
 * The console shows a count per rule. The optional report lists every finding, identified by
 * date, tail and route; it never contains names or remarks. Write it under data/.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createAirportLookup } from '../src/core/airports';
import type { AirportData } from '../src/core/airports';
import airportData from '../src/core/airports/airports.data.json' with { type: 'json' };
import { importForeFlight, importLogTen, toLogbook } from '../src/core/importers';
import type { Entry } from '../src/core/model';
import { valueOn } from '../src/core/model';
import { ALL_RULES, validate } from '../src/core/validation';
import type { Finding, Severity } from '../src/core/validation';
import { COLUMN_PRESETS } from '../src/core/importers/presets';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const outFile = outAt >= 0 ? args[outAt + 1] : undefined;
const [source, file] = args.filter((_, i) => outAt < 0 || (i !== outAt && i !== outAt + 1));
if ((source !== 'logten' && source !== 'foreflight') || file === undefined) {
  console.error('usage: npm run validate -- <logten|foreflight> <file> [--out <report.md>]');
  process.exit(2);
}

const airports = createAirportLookup(airportData as unknown as AirportData);
const text = readFileSync(file, 'utf8');
const options = { columns: COLUMN_PRESETS[source] };
const imported =
  source === 'logten' ? importLogTen(text, options) : importForeFlight(text, options);
const { logbook, notes } = toLogbook(imported, { airports });
const findings = validate(logbook, { airports });

const sourceDate = new Map(imported.records.map((r) => [`${r.source}:${r.line}`, r.date]));
const entryById = new Map(logbook.entries.map((e) => [e.id, e]));
const tailById = new Map(
  logbook.airframes.map((a) => [a.id, (date: string) => valueOn(a.registrations, date) ?? a.id]),
);
const describe = (e: Entry): string => {
  const tail =
    e.airframeId !== undefined
      ? (tailById.get(e.airframeId)?.(e.date) ?? e.airframeId)
      : (e.deviceId?.replace(/^dev:/, '') ?? '(no aircraft)');
  // Show the date as the source app shows it, so the entry can be found there.
  return `${sourceDate.get(e.id) ?? e.date} ${tail} ${e.from ?? '-'}→${e.to ?? (e.kind === 'flight' ? 'local' : '-')}`;
};

const ORDER: Severity[] = ['error', 'warning', 'note'];
const titles = new Map(ALL_RULES.map((r) => [r.id, r.title]));
const byRule = new Map<string, Finding[]>();
for (const f of findings) byRule.set(f.ruleId, [...(byRule.get(f.ruleId) ?? []), f]);
const groups = [...byRule].sort(
  (x, y) =>
    ORDER.indexOf(x[1][0]!.severity) - ORDER.indexOf(y[1][0]!.severity) ||
    y[1].length - x[1].length,
);

const lines: string[] = [];
lines.push(`# Validation: ${source}`, '');
lines.push(
  `${logbook.entries.length} entries, ${findings.length} findings ` +
    `(${ORDER.map((s) => `${findings.filter((f) => f.severity === s).length} ${s}s`).join(', ')}).`,
  '',
  '| Severity | Rule | Findings |',
  '| --- | --- | --- |',
  ...groups.map(
    ([id, list]) =>
      `| ${list[0]!.severity} | ${titles.get(id) ?? id} (\`${id}\`) | ${list.length} |`,
  ),
  '',
);
const noteCounts = new Map<string, number>();
for (const n of notes) noteCounts.set(n.code, (noteCounts.get(n.code) ?? 0) + 1);
lines.push(
  'Conversion notes: ' +
    ([...noteCounts].map(([code, n]) => `${code} ×${n}`).join(', ') || 'none') +
    '.',
  '',
);
console.log(lines.join('\n'));

if (outFile !== undefined) {
  for (const [id, list] of groups) {
    lines.push(
      `## ${titles.get(id) ?? id}`,
      '',
      `\`${id}\` · ${list[0]!.severity} · ${list.length}`,
      '',
    );
    lines.push('| Entry | Finding |', '| --- | --- |');
    for (const f of list) {
      const who = f.entryIds
        .map((entryId) => entryById.get(entryId))
        .filter((e) => e !== undefined)
        .map(describe)
        .join('<br>');
      lines.push(`| ${who || '—'} | ${f.message} |`);
    }
    lines.push('');
  }
  writeFileSync(outFile, lines.join('\n'));
  console.log(`Detail report written to ${outFile}`);
}
