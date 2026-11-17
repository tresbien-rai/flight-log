import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useMatch, useNavigate } from 'react-router';
import type { Logbook } from '@core/model';
import { filterEntries, sortEntries } from '@core/query';
import type { BookId } from '@storage/index';
import { EntryDetail } from '../components/EntryDetail';
import { FilterBar } from '../components/FilterBar';
import { Ledger } from '../components/Ledger';
import { useBook } from '../hooks/useBook';
import { useFilterState } from '../hooks/useFilterState';
import { useLogbookAnalysis } from '../hooks/useLogbookAnalysis';
import { useMediaQuery, WIDE_QUERY } from '../hooks/useMediaQuery';
import { BOOK_LABELS } from '../lib/books';
import { isFiltered, toEntryFilter } from '../lib/filterState';
import { buildLedgerItems, pageTotals } from '../lib/ledger';
import { useShell } from './shellContext';

function Message({
  title,
  children,
  role,
}: {
  title: string;
  children?: React.ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <div className="screen">
      <div className="empty" role={role}>
        <h1 className="empty-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function LogbookRoute() {
  const { books, retryBooks, bookId } = useShell();

  if (books.status === 'loading') return <Message title="Loading your books…" role="status" />;
  if (books.status === 'error') {
    return (
      <Message title="Your books could not be read from this device." role="alert">
        <p>{books.message}</p>
        <p>Reload the page. If this keeps happening, check that the browser allows site storage.</p>
        <button type="button" className="btn btn-primary" onClick={retryBooks}>
          Try again
        </button>
      </Message>
    );
  }
  if (bookId === undefined) {
    return (
      <Message title="No logbook on this device yet.">
        <p>
          Import an export from LogTen Pro or ForeFlight to see its entries here. The file stays on
          this device.
        </p>
        <Link to="/import" className="btn btn-primary">
          Import a logbook export
        </Link>
      </Message>
    );
  }
  return <BookScreen key={bookId} bookId={bookId} />;
}

function BookScreen({ bookId }: { bookId: BookId }) {
  const { state, retry } = useBook(bookId);
  if (state.status === 'loading') {
    return <Message title={`Loading ${BOOK_LABELS[bookId]}…`} role="status" />;
  }
  if (state.status === 'missing') {
    return (
      <Message title={`The ${BOOK_LABELS[bookId]} book is no longer on this device.`}>
        <Link to="/import" className="btn btn-primary">
          Import a logbook export
        </Link>
      </Message>
    );
  }
  if (state.status === 'error') {
    return (
      <Message title={`The ${BOOK_LABELS[bookId]} book could not be loaded.`} role="alert">
        <p>{state.message}</p>
        <button type="button" className="btn btn-primary" onClick={retry}>
          Try again
        </button>
      </Message>
    );
  }
  return <LogbookView logbook={state.value} bookId={bookId} />;
}

function LogbookView({ logbook, bookId }: { logbook: Logbook; bookId: BookId }) {
  const analysis = useLogbookAnalysis(logbook);
  const { index, findings } = analysis;
  const controls = useFilterState();
  const { filter } = controls;
  const wide = useMediaQuery(WIDE_QUERY);
  const navigate = useNavigate();
  const location = useLocation();
  const selectedId = useMatch('/entry/:id')?.params.id;
  const gridRef = useRef<HTMLDivElement | null>(null);

  const entryById = useMemo(() => new Map(logbook.entries.map((e) => [e.id, e])), [logbook]);
  const flagged = useMemo(() => new Set(findings.keys()), [findings]);
  const filtered = useMemo(
    () => filterEntries(logbook.entries, toEntryFilter(filter), index, flagged),
    [logbook, filter, index, flagged],
  );
  const sorted = useMemo(() => sortEntries(filtered, filter.order), [filtered, filter.order]);
  const items = useMemo(() => buildLedgerItems(sorted), [sorted]);
  const totals = useMemo(() => pageTotals(sorted), [sorted]);
  const entryIds = useMemo(() => sorted.map((e) => e.id), [sorted]);

  const open = useCallback(
    (id: string, replace = false) => {
      void navigate(
        { pathname: `/entry/${encodeURIComponent(id)}`, search: location.search },
        { replace },
      );
    },
    [navigate, location.search],
  );
  const close = useCallback(() => {
    void navigate({ pathname: '/', search: location.search });
    gridRef.current?.focus();
  }, [navigate, location.search]);

  // The keyboard cursor. It follows the selection unless the user moved it without opening a row.
  const [cursor, setCursor] = useState<{ id: string; selected: string | undefined }>();
  const cursorId = cursor && cursor.selected === selectedId ? cursor.id : selectedId;

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (entryIds.length === 0) return;
    const at = cursorId === undefined ? -1 : entryIds.indexOf(cursorId);
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(entryIds.length - 1, at + 1);
        break;
      case 'ArrowUp':
        next = at < 0 ? 0 : Math.max(0, at - 1);
        break;
      case 'PageDown':
        next = Math.min(entryIds.length - 1, Math.max(at, 0) + 10);
        break;
      case 'PageUp':
        next = Math.max(0, at - 10);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = entryIds.length - 1;
        break;
      case 'Enter':
      case ' ':
        if (cursorId !== undefined) {
          event.preventDefault();
          open(cursorId);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    const id = entryIds[next];
    if (id === undefined) return;
    if (wide) {
      setCursor(undefined);
      open(id, true);
    } else {
      setCursor({ id, selected: selectedId });
    }
  };

  // Escape closes the detail, unless a control inside it (a popover, say) already used the key.
  useEffect(() => {
    if (selectedId === undefined) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, close]);

  const selected = selectedId === undefined ? undefined : entryById.get(selectedId);
  const filteredOn = isFiltered(filter);
  const sheet = !wide;
  const waitingForFindings = filter.withFindings && analysis.checking;

  return (
    <div className="logbook">
      <FilterBar controls={controls} types={index.typesInUse} />
      {analysis.airportsMissing ? (
        <p className="notice" role="status">
          The airport data could not be loaded, so checks that need airports did not run. Reload the
          page to try again.
        </p>
      ) : null}
      <div className={`logbook-body${selectedId !== undefined ? ' has-selection' : ''}`}>
        <div className="ledger-wrap">
          {items.length === 0 ? (
            <div className="empty" role="status">
              {waitingForFindings ? (
                <h2 className="empty-title">Checking entries for findings…</h2>
              ) : filteredOn ? (
                <>
                  <h2 className="empty-title">No entries match these filters.</h2>
                  <button type="button" className="btn btn-primary" onClick={controls.clear}>
                    Clear filters
                  </button>
                </>
              ) : (
                <h2 className="empty-title">This book has no entries.</h2>
              )}
            </div>
          ) : (
            <Ledger
              label={`${BOOK_LABELS[bookId]} entries`}
              items={items}
              totals={totals}
              order={filter.order}
              onOrderChange={(order) => controls.update({ order })}
              index={index}
              findings={findings}
              selectedId={selectedId}
              activeId={cursorId}
              checking={analysis.checking}
              onSelect={(id) => {
                setCursor(undefined);
                open(id);
              }}
              onKeyDown={onGridKeyDown}
              gridRef={gridRef}
            />
          )}
        </div>
        <div className="detail-wrap">
          {selectedId === undefined ? (
            wide ? (
              <aside className="detail detail--empty" aria-label="Entry detail">
                <p className="muted">Select an entry to see its details.</p>
              </aside>
            ) : null
          ) : selected ? (
            <EntryDetail
              entry={selected}
              index={index}
              findings={findings.get(selected.id) ?? []}
              onClose={close}
              sheet={sheet}
            />
          ) : (
            <aside className="detail" aria-label="Entry detail">
              <div className="detail-bar">
                <button type="button" className="btn" onClick={close}>
                  {sheet ? 'Back to list' : 'Close'}
                </button>
              </div>
              <div className="detail-inner">
                <p>This entry is not in the {BOOK_LABELS[bookId]} book.</p>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
