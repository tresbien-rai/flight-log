import { useMemo, useState } from 'react';
import type { AircraftType } from '@core/model';
import type { EntryKind } from '@core/model';
import { matchingQuickRange, quickRanges, todayIso } from '../lib/dates';
import { shortDate } from '../lib/format';
import {
  countActiveFilters,
  KINDS,
  RULE_KEYS,
  type FilterState,
  type RuleKey,
} from '../lib/filterState';
import type { FilterControls } from '../hooks/useFilterState';
import { Popover } from './Popover';

const RULE_LABELS: Record<RuleKey, string> = { '91': 'Part 91', '121': 'Part 121', other: 'Other' };
const KIND_LABELS: Record<EntryKind, string> = {
  flight: 'Flights',
  simulator: 'Simulator',
  ground: 'Ground',
};

function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function dateSummary(filter: FilterState, today: string): string {
  if (filter.dateFrom === '' && filter.dateTo === '') return 'Dates';
  const quick = matchingQuickRange(filter.dateFrom, filter.dateTo, today);
  if (quick) return quick.label;
  const from = filter.dateFrom ? shortDate(filter.dateFrom) : 'start';
  const to = filter.dateTo ? shortDate(filter.dateTo) : 'now';
  return `${from} – ${to}`;
}

function typeSummary(count: number): string {
  return count === 0 ? 'Type' : count === 1 ? '1 type' : `${count} types`;
}

/** Toggle buttons for a small set of values, any number of which may be on. */
function ToggleGroup<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: readonly T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="toggle-group" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className="btn btn-toggle"
          aria-pressed={value.includes(o)}
          onClick={() => onChange(toggled(value, o))}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({
  controls,
  types,
  aircraftNames,
}: {
  controls: FilterControls;
  /** Types the open book uses. */
  types: readonly AircraftType[];
  /** Tail or device name by airframe or device id, for naming an aircraft filter. */
  aircraftNames?: ReadonlyMap<string, string>;
}) {
  const { filter, draftText, setDraftText, update, clear } = controls;
  const aircraftLabel =
    filter.aircraftIds.length === 1
      ? (aircraftNames?.get(filter.aircraftIds[0]!) ?? '1 aircraft')
      : `${filter.aircraftIds.length} aircraft`;
  const [expanded, setExpanded] = useState(false);
  // Read once per mount: the quick picks are "from today", which only changes overnight.
  const [today] = useState(() => todayIso());
  const active = countActiveFilters(filter);
  const picks = useMemo(() => quickRanges(today), [today]);
  const current = matchingQuickRange(filter.dateFrom, filter.dateTo, today);

  return (
    <div className={`filter-bar${expanded ? ' filter-bar--open' : ''}`} role="search">
      <div className="filter-search">
        <label htmlFor="entry-search" className="visually-hidden">
          Search entries
        </label>
        <input
          id="entry-search"
          type="search"
          className="input"
          placeholder="Search tail, airport, flight, crew"
          value={draftText}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => setDraftText(e.target.value)}
        />
        <button
          type="button"
          className={`btn filter-expand${active > 0 ? ' btn-active' : ''}`}
          aria-expanded={expanded}
          aria-controls="filter-controls"
          onClick={() => setExpanded((e) => !e)}
        >
          Filters{active > 0 ? ` (${active})` : ''}
        </button>
      </div>

      <div className="filter-controls" id="filter-controls">
        <ToggleGroup
          label="Operating rule"
          options={RULE_KEYS}
          labels={RULE_LABELS}
          value={filter.rules}
          onChange={(rules) => update({ rules })}
        />
        <ToggleGroup
          label="Kind of entry"
          options={KINDS}
          labels={KIND_LABELS}
          value={filter.kinds}
          onChange={(kinds) => update({ kinds })}
        />

        <Popover label={typeSummary(filter.typeIds.length)} active={filter.typeIds.length > 0}>
          <p className="popover-title">Aircraft type</p>
          {types.length === 0 ? <p className="muted">No aircraft types in this book.</p> : null}
          <ul className="check-list">
            {types.map((t) => (
              <li key={t.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={filter.typeIds.includes(t.id)}
                    onChange={() => update({ typeIds: toggled(filter.typeIds, t.id).sort() })}
                  />
                  <span>{t.id}</span>
                  <span className="muted">
                    {t.make} {t.model}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {filter.typeIds.length > 0 ? (
            <button type="button" className="btn" onClick={() => update({ typeIds: [] })}>
              Any type
            </button>
          ) : null}
        </Popover>

        <Popover
          label={dateSummary(filter, today)}
          active={current?.id !== 'all' && !!(filter.dateFrom || filter.dateTo)}
        >
          <p className="popover-title">Dates</p>
          <div className="quick-picks" role="group" aria-label="Quick picks">
            {picks.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn btn-toggle"
                aria-pressed={current?.id === p.id}
                onClick={() => update({ dateFrom: p.from, dateTo: p.to })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="date-range">
            <label className="field">
              <span>From</span>
              <input
                type="date"
                className="input"
                value={filter.dateFrom}
                max={filter.dateTo || undefined}
                onChange={(e) => update({ dateFrom: e.target.value })}
              />
            </label>
            <label className="field">
              <span>To</span>
              <input
                type="date"
                className="input"
                value={filter.dateTo}
                min={filter.dateFrom || undefined}
                onChange={(e) => update({ dateTo: e.target.value })}
              />
            </label>
          </div>
        </Popover>

        <button
          type="button"
          className="btn btn-toggle btn-findings"
          aria-pressed={filter.withFindings}
          onClick={() => update({ withFindings: !filter.withFindings })}
        >
          With findings
        </button>

        {filter.aircraftIds.length > 0 ? (
          <button
            type="button"
            className="btn btn-toggle"
            aria-pressed="true"
            onClick={() => update({ aircraftIds: [] })}
            aria-label={`Showing ${aircraftLabel}; show every aircraft`}
          >
            {aircraftLabel} ×
          </button>
        ) : null}

        {active > 0 ? (
          <button type="button" className="btn btn-link" onClick={clear}>
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
