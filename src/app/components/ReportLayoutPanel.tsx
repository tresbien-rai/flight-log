import type { CustomFieldDef } from '@core/importers';
import type { OperatingRule } from '@core/model';
import { lookBackId, SECTION_IDS, SECTION_INFO, sectionColumns } from '@core/reports';
import type { ColumnId, ReportLayout, SectionId, SectionLayout, TypeGrouping } from '@core/reports';
import { lookBackOptions, toggleLookBack } from '../lib/report';

const RULES: { value: OperatingRule; label: string }[] = [
  { value: '121', label: 'Part 121' },
  { value: '135', label: 'Part 135' },
  { value: '91', label: 'Part 91' },
  { value: 'other', label: 'Other' },
];

const GROUPINGS: { value: TypeGrouping; label: string }[] = [
  { value: 'type', label: 'Type (172S, CRJ-700)' },
  { value: 'icao', label: 'ICAO designator (C172, CRJ7)' },
  { value: 'typeRating', label: 'Type rating (CL-65)' },
];

/** Rows a section can show, by id, for choosing which to hide. */
export type SectionRows = Partial<Record<SectionId, { id: string; label: string }[]>>;

function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function SectionChoices({
  id,
  section,
  rows,
  customFields,
  onChange,
}: {
  id: SectionId;
  section: SectionLayout;
  rows: { id: string; label: string }[];
  customFields: readonly CustomFieldDef[];
  onChange: (next: SectionLayout) => void;
}) {
  const options = sectionColumns(id, customFields);
  const toggleColumn = (column: ColumnId) => {
    const on = new Set(toggled(section.columns, column));
    const known = options.map((o) => o.id);
    // Keep the panel's order, and any column the layout names that is not offered now.
    onChange({
      ...section,
      columns: [
        ...known.filter((c) => on.has(c)),
        ...section.columns.filter((c) => !known.includes(c)),
      ],
    });
  };
  const title = SECTION_INFO[id].title;
  return (
    <details className="layout-section">
      <summary>
        <label className="check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={section.on}
            onChange={() => onChange({ ...section, on: !section.on })}
          />
          <span>{title}</span>
        </label>
      </summary>
      <fieldset className="layout-group">
        <legend>Columns</legend>
        <div className="layout-checks">
          {options.map((o) => (
            <label key={o.id} className="check">
              <input
                type="checkbox"
                checked={section.columns.includes(o.id)}
                onChange={() => toggleColumn(o.id)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {rows.length > 0 ? (
        <fieldset className="layout-group">
          <legend>Rows</legend>
          <div className="layout-checks">
            {rows.map((r) => (
              <label key={r.id} className="check">
                <input
                  type="checkbox"
                  checked={!section.hiddenRows.includes(r.id)}
                  onChange={() =>
                    onChange({ ...section, hiddenRows: toggled(section.hiddenRows, r.id) })
                  }
                />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </details>
  );
}

/** Every switch the report has: period, rules, rounding, grouping, sections, columns, rows. */
export function ReportLayoutPanel({
  layout,
  onChange,
  rows,
  customFields,
}: {
  layout: ReportLayout;
  onChange: (next: ReportLayout) => void;
  rows: SectionRows;
  customFields: readonly CustomFieldDef[];
}) {
  const set = (patch: Partial<ReportLayout>) => onChange({ ...layout, ...patch });
  const range = layout.period.kind === 'range' ? layout.period : undefined;
  const setRange = (patch: { from?: string; to?: string }) => {
    const next = { kind: 'range' as const, ...range, ...patch };
    if (!next.from) delete next.from;
    if (!next.to) delete next.to;
    set({ period: next });
  };
  const chosen = new Set(layout.lookBacks.map(lookBackId));

  return (
    <div className="layout-panel">
      <fieldset className="layout-group">
        <legend>Period</legend>
        <div className="layout-row">
          <label className="check">
            <input
              type="radio"
              name="report-period"
              checked={!range}
              onChange={() => set({ period: { kind: 'all' } })}
            />
            <span>All time</span>
          </label>
          <label className="check">
            <input
              type="radio"
              name="report-period"
              checked={!!range}
              onChange={() => setRange({})}
            />
            <span>Between dates</span>
          </label>
        </div>
        {range ? (
          <div className="layout-row">
            <label className="field">
              From
              <input
                className="input"
                type="date"
                value={range.from ?? ''}
                max={range.to}
                onChange={(e) => setRange({ from: e.target.value })}
              />
            </label>
            <label className="field">
              To
              <input
                className="input"
                type="date"
                value={range.to ?? ''}
                min={range.from}
                onChange={(e) => setRange({ to: e.target.value })}
              />
            </label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="layout-group">
        <legend>Recent experience</legend>
        <label className="field">
          Counted back from
          <input
            className="input"
            type="date"
            value={layout.asOf ?? ''}
            onChange={(e) => {
              const next: ReportLayout = { ...layout, asOf: e.target.value };
              if (!next.asOf) delete next.asOf;
              onChange(next);
            }}
          />
          <span className="muted">Empty: the period’s end, or today.</span>
        </label>
        <div className="layout-checks layout-checks--cols">
          {lookBackOptions(layout).map(({ lookBack, label }) => (
            <label key={lookBackId(lookBack)} className="check">
              <input
                type="checkbox"
                checked={chosen.has(lookBackId(lookBack))}
                onChange={() => set({ lookBacks: toggleLookBack(layout, lookBack) })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="layout-group">
        <legend>Flights under</legend>
        <div className="layout-row">
          {RULES.map((r) => (
            <button
              key={r.value}
              type="button"
              className="btn btn-toggle"
              aria-pressed={layout.rules.includes(r.value)}
              onClick={() => set({ rules: toggled(layout.rules, r.value) })}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="muted">None chosen: every rule. Simulator sessions are always shown.</span>
      </fieldset>

      <fieldset className="layout-group">
        <legend>Rounding</legend>
        <label className="check">
          <input
            type="radio"
            name="report-rounding"
            checked={layout.rounding === 'total'}
            onChange={() => set({ rounding: 'total' })}
          />
          <span>Once, on each total</span>
        </label>
        <label className="check">
          <input
            type="radio"
            name="report-rounding"
            checked={layout.rounding === 'perFlight'}
            onChange={() => set({ rounding: 'perFlight' })}
          />
          <span>Each flight to a tenth, as ForeFlight does</span>
        </label>
      </fieldset>

      <fieldset className="layout-group">
        <legend>Aircraft types</legend>
        <label className="field">
          Group flights by
          <select
            className="input"
            value={layout.typeGrouping}
            onChange={(e) => set({ typeGrouping: e.target.value as TypeGrouping })}
          >
            {GROUPINGS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={layout.familyLines}
            disabled={layout.typeGrouping !== 'type'}
            onChange={() => set({ familyLines: !layout.familyLines })}
          />
          <span>A combined line over a type and its converted variants</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={layout.showEmpty}
            onChange={() => set({ showEmpty: !layout.showEmpty })}
          />
          <span>Show rows and columns that are all zero</span>
        </label>
      </fieldset>

      <fieldset className="layout-group">
        <legend>Sections</legend>
        {SECTION_IDS.map((id) => (
          <SectionChoices
            key={id}
            id={id}
            section={layout.sections[id]}
            rows={rows[id] ?? []}
            customFields={customFields}
            onChange={(next) => set({ sections: { ...layout.sections, [id]: next } })}
          />
        ))}
      </fieldset>
    </div>
  );
}
