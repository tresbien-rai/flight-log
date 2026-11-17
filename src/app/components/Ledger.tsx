import { memo, useCallback, useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Entry } from '@core/model';
import type { LogbookIndex, SortOrder } from '@core/query';
import type { Finding } from '@core/validation';
import {
  dayAndWeekday,
  formatHours,
  formatInt,
  hoursOrBlank,
  landingsText,
  plural,
} from '../lib/format';
import { SEVERITY_SYMBOL, SEVERITY_WORD, worstSeverity } from '../lib/findings';
import { entryFigures, type LedgerItem, type MonthItem, type PageTotals } from '../lib/ledger';

/** Heights in px. Keep in step with --head-h in ledger.css. */
const HEAD_H = 44;
const ROW_H = 40;
const MONTH_H = 36;
const FOOT_H = 60;

const RULE_TEXT: Record<Entry['rule'], string> = {
  '91': '91',
  '121': '121',
  '135': '135',
  other: 'Other',
};

function Marker({ findings }: { findings: readonly Finding[] | undefined }) {
  const worst = worstSeverity(findings);
  if (!worst || !findings) return null;
  const n = findings.length;
  const text = `${SEVERITY_WORD[worst]}, ${plural(n, 'finding')}`;
  return (
    <span className={`marker marker--${worst}`} title={text}>
      <span aria-hidden="true">{SEVERITY_SYMBOL[worst]}</span>
      <span className="visually-hidden">{text}</span>
    </span>
  );
}

const EntryRow = memo(function EntryRow({
  entry,
  index,
  findings,
  selected,
  active,
  rowIndex,
  top,
  onSelect,
}: {
  entry: Entry;
  index: LogbookIndex;
  findings: readonly Finding[] | undefined;
  selected: boolean;
  active: boolean;
  rowIndex: number;
  top: number;
  onSelect: (id: string) => void;
}) {
  const f = entryFigures(entry);
  const { day, weekday } = dayAndWeekday(entry.date);
  const type = index.typeOf(entry);
  const tail = index.tailOf(entry);
  const flight = entry.kind === 'flight';
  const nonFlightLabel = entry.kind === 'simulator' ? 'Sim' : 'Ground';
  const route = !flight
    ? ''
    : entry.from && entry.to
      ? `${entry.from}–${entry.to}`
      : (entry.from ?? '');

  return (
    <div
      role="row"
      id={`row-${entry.id}`}
      aria-rowindex={rowIndex}
      aria-selected={selected}
      className={`row${selected ? ' row--selected' : ''}${active ? ' row--active' : ''}${
        flight ? '' : ' row--nonflight'
      }`}
      style={{ height: ROW_H, transform: `translateY(${top}px)` }}
      onClick={() => onSelect(entry.id)}
    >
      <div role="gridcell" className="cell c-date g">
        <span className="day">{day}</span> <span className="weekday">{weekday}</span>
      </div>
      <div role="gridcell" className="cell c-flight">
        {entry.flightNumber ?? ''}
      </div>
      <div role="gridcell" className="cell c-aircraft g">
        <span className="tail">{tail ?? ''}</span>
        <span className="type">{type?.id ?? ''}</span>
      </div>
      <div role="gridcell" className="cell c-route">
        {route}
        {flight && entry.from && !entry.to ? <span className="local"> local</span> : null}
      </div>
      <div
        role="gridcell"
        className={`cell c-rule${entry.rule === '121' && flight ? ' rule-121' : ''}`}
      >
        {flight ? RULE_TEXT[entry.rule] : nonFlightLabel}
      </div>
      <div role="gridcell" className="cell num c-total g">
        {hoursOrBlank(f.total)}
        {!flight && f.total > 0 ? (
          <span className="visually-hidden"> ({nonFlightLabel.toLowerCase()} session)</span>
        ) : null}
      </div>
      <div role="gridcell" className="cell num c-pic">
        {hoursOrBlank(f.pic)}
      </div>
      <div role="gridcell" className="cell num c-sic">
        {hoursOrBlank(f.sic)}
      </div>
      <div role="gridcell" className="cell num c-night">
        {hoursOrBlank(f.night)}
      </div>
      <div role="gridcell" className="cell num c-instrument">
        {hoursOrBlank(f.instrument)}
      </div>
      <div role="gridcell" className="cell num c-landings g">
        {landingsText(f.dayLandings, f.nightLandings)}
      </div>
      <div role="gridcell" className="cell c-marker g">
        <Marker findings={findings} />
      </div>
    </div>
  );
});

function MonthRow({ item, rowIndex, top }: { item: MonthItem; rowIndex: number; top: number }) {
  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      className="row row--month"
      style={{ height: MONTH_H, transform: `translateY(${top}px)` }}
    >
      <div role="gridcell" className="cell month-label">
        <span className="month-name">{item.label}</span>
        <span className="month-count">{plural(item.count, 'entry', 'entries')}</span>
      </div>
      <div role="gridcell" className="cell num c-total g month-total">
        {hoursOrBlank(item.totalMinutes)}
      </div>
      <div className="cell c-pic" aria-hidden="true" />
      <div className="cell c-sic" aria-hidden="true" />
      <div className="cell c-night" aria-hidden="true" />
      <div className="cell c-instrument" aria-hidden="true" />
      <div className="cell c-landings g" aria-hidden="true" />
      <div className="cell c-marker g" aria-hidden="true" />
    </div>
  );
}

export function Ledger({
  items,
  totals,
  order,
  onOrderChange,
  index,
  findings,
  selectedId,
  activeId,
  onSelect,
  onKeyDown,
  gridRef,
  label,
  checking,
}: {
  items: readonly LedgerItem[];
  totals: PageTotals;
  order: SortOrder;
  onOrderChange: (order: SortOrder) => void;
  index: LogbookIndex;
  findings: ReadonlyMap<string, Finding[]>;
  selectedId: string | undefined;
  /** The row the keyboard cursor is on. */
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  gridRef?: RefObject<HTMLDivElement | null>;
  label: string;
  /** True while findings are still being worked out. */
  checking: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (gridRef) gridRef.current = node;
    },
    [gridRef],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.type === 'month' ? MONTH_H : ROW_H),
    overscan: 12,
    scrollMargin: HEAD_H,
    scrollPaddingStart: HEAD_H,
    scrollPaddingEnd: FOOT_H,
    getItemKey: (i) => {
      const item = items[i];
      return item ? (item.type === 'month' ? `m:${item.key}` : item.entry.id) : i;
    },
  });

  // Bring the active row into view when it changes (keyboard, or a deep link on first load).
  const scrolledTo = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (activeId === undefined || scrolledTo.current === activeId) return;
    const at = items.findIndex((it) => it.type === 'entry' && it.entry.id === activeId);
    if (at < 0) return;
    scrolledTo.current = activeId;
    virtualizer.scrollToIndex(at, { align: 'auto' });
  }, [activeId, items, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const activeRendered = virtualItems.some((v) => {
    const it = items[v.index];
    return it?.type === 'entry' && it.entry.id === activeId;
  });

  return (
    <div
      className="ledger"
      role="grid"
      aria-label={label}
      aria-rowcount={items.length + 2}
      tabIndex={0}
      aria-activedescendant={activeRendered ? `row-${activeId}` : undefined}
      ref={setRefs}
      onKeyDown={onKeyDown}
    >
      <div role="row" aria-rowindex={1} className="row row--head" style={{ height: HEAD_H }}>
        <div
          role="columnheader"
          className="cell c-date g"
          aria-sort={order === 'newest' ? 'descending' : 'ascending'}
        >
          <button
            type="button"
            className="sort-button"
            onClick={() => onOrderChange(order === 'newest' ? 'oldest' : 'newest')}
            title={
              order === 'newest'
                ? 'Newest first. Show oldest first.'
                : 'Oldest first. Show newest first.'
            }
          >
            Date <span aria-hidden="true">{order === 'newest' ? '↓' : '↑'}</span>
            <span className="visually-hidden">
              {order === 'newest' ? ', newest first' : ', oldest first'}. Change order.
            </span>
          </button>
        </div>
        <div role="columnheader" className="cell c-flight">
          Flight
        </div>
        <div role="columnheader" className="cell c-aircraft g">
          Aircraft
        </div>
        <div role="columnheader" className="cell c-route">
          Route
        </div>
        <div role="columnheader" className="cell c-rule">
          Rule
        </div>
        <div role="columnheader" className="cell num c-total g">
          Total
        </div>
        <div role="columnheader" className="cell num c-pic">
          PIC
        </div>
        <div role="columnheader" className="cell num c-sic">
          SIC
        </div>
        <div role="columnheader" className="cell num c-night">
          Night
        </div>
        <div role="columnheader" className="cell num c-instrument">
          Instrument
        </div>
        <div role="columnheader" className="cell num c-landings g">
          <span>Landings</span>
          <span className="head-sub">day / night</span>
        </div>
        <div role="columnheader" className="cell c-marker g">
          <span aria-hidden="true">!</span>
          <span className="visually-hidden">Findings</span>
        </div>
      </div>

      <div
        role="rowgroup"
        className="ledger-body"
        style={{ minHeight: virtualizer.getTotalSize() - HEAD_H }}
      >
        {virtualItems.map((v) => {
          const item = items[v.index];
          if (!item) return null;
          const top = v.start - HEAD_H;
          return item.type === 'month' ? (
            <MonthRow key={v.key} item={item} rowIndex={v.index + 2} top={top} />
          ) : (
            <EntryRow
              key={v.key}
              entry={item.entry}
              index={index}
              findings={findings.get(item.entry.id)}
              selected={item.entry.id === selectedId}
              active={item.entry.id === activeId}
              rowIndex={v.index + 2}
              top={top}
              onSelect={onSelect}
            />
          );
        })}
      </div>

      <div
        role="row"
        aria-rowindex={items.length + 2}
        className="row row--foot"
        style={{ minHeight: FOOT_H }}
      >
        <div role="rowheader" className="cell foot-label">
          <span className="foot-count">{plural(totals.count, 'entry', 'entries')}</span>
          <span className="foot-sub">
            {[
              plural(totals.flights, 'flight'),
              totals.simulatorSessions > 0 ? `${formatInt(totals.simulatorSessions)} sim` : '',
              totals.groundSessions > 0 ? `${formatInt(totals.groundSessions)} ground` : '',
              checking ? 'checking findings…' : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div role="gridcell" className="cell num c-total g">
          {formatHours(totals.total)}
        </div>
        <div role="gridcell" className="cell num c-pic">
          {hoursOrBlank(totals.pic)}
        </div>
        <div role="gridcell" className="cell num c-sic">
          {hoursOrBlank(totals.sic)}
        </div>
        <div role="gridcell" className="cell num c-night">
          {hoursOrBlank(totals.night)}
        </div>
        <div role="gridcell" className="cell num c-instrument">
          {hoursOrBlank(totals.instrument)}
        </div>
        <div role="gridcell" className="cell num c-landings g">
          {landingsText(totals.dayLandings, totals.nightLandings)}
        </div>
        <div className="cell c-marker g" aria-hidden="true" />
      </div>
    </div>
  );
}
