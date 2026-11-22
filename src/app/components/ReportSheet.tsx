import type { PilotProfile } from '@core/model';
import type { Report, ReportCell, ReportRow, ReportSection } from '@core/reports';
import { formatInt, shortDate } from '../lib/format';
import { periodText, reportValue, roundingText, rulesText } from '../lib/report';

/** Sections wide enough to need the full page width. The rest sit side by side. */
const WIDE = new Set(['recent', 'types']);

export interface OpenList {
  (label: string, entryIds: readonly string[]): void;
}

function NumberCell({
  text,
  cell,
  label,
  onOpen,
}: {
  text: string;
  cell: ReportCell | { value: number; entryIds: readonly string[] };
  label: string;
  onOpen: OpenList;
}) {
  if (cell.value === 0 || cell.entryIds.length === 0) {
    return <td className="num report-zero">{text}</td>;
  }
  const n = cell.entryIds.length;
  return (
    <td className="num">
      <button
        type="button"
        className="report-num"
        onClick={() => onOpen(label, cell.entryIds)}
        aria-label={`${label}: ${text}. Show the ${formatInt(n)} ${n === 1 ? 'entry' : 'entries'}`}
      >
        {text}
      </button>
    </td>
  );
}

function Row({
  section,
  row,
  onOpen,
  total = false,
}: {
  section: ReportSection;
  row: ReportRow;
  onOpen: OpenList;
  total?: boolean;
}) {
  const name = total ? `${section.title} total` : row.label;
  const className = [
    row.depth === 1 ? 'report-sub' : '',
    row.family ? 'report-family' : '',
    total ? 'report-total' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <tr className={className || undefined}>
      <th scope="row">
        <span className="report-label">{row.label}</span>
        {row.range ? (
          <span className="report-range">
            {shortDate(row.range.from)} – {shortDate(row.range.to)}
          </span>
        ) : null}
      </th>
      {section.countNoun ? (
        <NumberCell
          text={`${formatInt(row.count)} ${row.count === 1 ? section.countNoun.one : section.countNoun.many}`}
          cell={{ value: row.count, entryIds: row.entryIds }}
          label={name}
          onOpen={onOpen}
        />
      ) : null}
      {row.cells.map((cell, i) => {
        const column = section.columns[i];
        if (!column) return null;
        return (
          <NumberCell
            key={column.id}
            text={reportValue(cell.value, column.unit)}
            cell={cell}
            label={`${name} · ${column.short}`}
            onOpen={onOpen}
          />
        );
      })}
    </tr>
  );
}

function SectionTable({ section, onOpen }: { section: ReportSection; onOpen: OpenList }) {
  const headingId = `report-${section.id}`;
  return (
    <section
      className={`report-section report-section--${section.id}${WIDE.has(section.id) ? ' report-section--wide' : ''}`}
      aria-labelledby={headingId}
    >
      <h2 className="report-heading" id={headingId}>
        {section.title}
      </h2>
      <div className="report-scroll">
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">{section.rowHeading}</th>
              {section.countNoun ? (
                <th scope="col" className="num">
                  <span className="visually-hidden">Count</span>
                </th>
              ) : null}
              {section.columns.map((c) => (
                <th key={c.id} scope="col" className="num">
                  <abbr title={c.label}>{c.short}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <Row key={row.id} section={section} row={row} onOpen={onOpen} />
            ))}
          </tbody>
          {section.total ? (
            <tfoot>
              <Row section={section} row={section.total} onOpen={onOpen} total />
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}

function Credentials({ pilot }: { pilot: PilotProfile }) {
  const certificates = pilot.certificates.filter((c) => c.title.trim() !== '');
  const tags: [string, string][] = [];
  if (pilot.flightReview) tags.push(['Last flight review', shortDate(pilot.flightReview)]);
  if (pilot.ipc) tags.push(['Last IPC', shortDate(pilot.ipc)]);
  const medical = pilot.medical.class.trim();
  if (certificates.length === 0 && tags.length === 0 && medical === '') return null;
  return (
    <div className="report-credentials">
      {certificates.length > 0 || medical !== '' ? (
        <div>
          <h2 className="report-heading">Certificates</h2>
          <dl className="report-certs">
            {certificates.map((c, i) => (
              <div key={i}>
                <dt>{c.title}</dt>
                {c.details.trim() ? <dd>{c.details}</dd> : null}
              </div>
            ))}
            {medical !== '' ? (
              <div>
                <dt>Medical certificate</dt>
                <dd>
                  {medical}
                  {pilot.medical.date ? `, ${shortDate(pilot.medical.date)}` : ''}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
      {tags.length > 0 ? (
        <div>
          <h2 className="report-heading">Reviews</h2>
          <dl className="report-tags">
            {tags.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/** The report as a page: what it covers, the pilot's credentials, then the tables. */
export function ReportSheet({
  report,
  pilot,
  bookLabel,
  onOpen,
}: {
  report: Report;
  pilot: PilotProfile;
  bookLabel: string;
  onOpen: OpenList;
}) {
  const rules = rulesText(report);
  const hasRecent = report.sections.some((s) => s.id === 'recent');
  return (
    <article className="report-sheet" aria-label="Experience report">
      <header className="report-head">
        <h1 className="report-name">{pilot.name.trim() || 'Experience report'}</h1>
        <p className="report-period">
          Experience report: <strong>{periodText(report)}</strong>
          {report.covered ? (
            <span className="report-covered">
              {' '}
              (entries {shortDate(report.covered.from)} to {shortDate(report.covered.to)})
            </span>
          ) : null}
        </p>
        <p className="report-notes">
          {[
            rules,
            hasRecent ? `Recent experience as of ${shortDate(report.asOf)}` : undefined,
            roundingText(report),
            `${bookLabel} book`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>
      <Credentials pilot={pilot} />
      {report.sections.length === 0 ? (
        <p className="report-empty">Nothing in this book matches the layout’s period and rules.</p>
      ) : (
        <div className="report-grid">
          {report.sections.map((s) => (
            <SectionTable key={s.id} section={s} onOpen={onOpen} />
          ))}
        </div>
      )}
    </article>
  );
}
