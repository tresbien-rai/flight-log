/** The experience report as CSV: one block per section, separated by a blank line. Pure. */
import type { Report, ReportRow, ReportSection } from './types';

/** Minutes as decimal hours with one place, rounded half up (`90` → `1.5`, `93` → `1.6`). */
export function hoursText(minutes: number): string {
  const tenths = Math.round(minutes / 6);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

const quote = (s: string): string => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const line = (cells: string[]): string => cells.map(quote).join(',');

function rowCells(section: ReportSection, row: ReportRow): string[] {
  const label = row.depth === 1 ? `  ${row.label}` : row.label;
  return [
    label,
    ...(section.countNoun ? [String(row.count)] : []),
    ...row.cells.map((c, i) =>
      section.columns[i]?.unit === 'minutes' ? hoursText(c.value) : String(c.value),
    ),
  ];
}

export interface CsvHeader {
  /** Lines printed above the tables, e.g. the pilot's name and the period. */
  lines: string[];
}

/** Hours are written with one decimal place; counts as whole numbers. Lines end in CRLF. */
export function reportToCsv(report: Report, header: CsvHeader = { lines: [] }): string {
  const out: string[] = header.lines.map((l) => line([l]));
  if (out.length > 0) out.push('');
  for (const section of report.sections) {
    out.push(line([section.title]));
    out.push(
      line([
        section.rowHeading,
        ...(section.countNoun
          ? [section.countNoun.many[0]?.toUpperCase() + section.countNoun.many.slice(1)]
          : []),
        ...section.columns.map((c) => c.label),
      ]),
    );
    for (const row of section.rows) out.push(line(rowCells(section, row)));
    if (section.total) out.push(line(rowCells(section, section.total)));
    out.push('');
  }
  return out.join('\r\n');
}
