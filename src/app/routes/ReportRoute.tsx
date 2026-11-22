import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CUSTOM_FIELDS } from '@core/importers';
import { completePilotProfile, type Logbook } from '@core/model';
import { indexLogbook } from '@core/query';
import {
  BUILT_IN_LAYOUTS,
  completeLayout,
  completeNamedLayouts,
  experienceReport,
  FULL_LAYOUT,
  reportToCsv,
  showAllRows,
} from '@core/reports';
import type { NamedLayout, ReportLayout } from '@core/reports';
import type { BookId } from '@storage/index';
import { ReportLayoutPanel, type SectionRows } from '../components/ReportLayoutPanel';
import { ReportSheet } from '../components/ReportSheet';
import { useBook } from '../hooks/useBook';
import { useMediaQuery, WIDE_QUERY } from '../hooks/useMediaQuery';
import { useProfileDoc } from '../hooks/useProfileDoc';
import { BOOK_LABELS } from '../lib/books';
import { todayIso } from '../lib/dates';
import { csvFileName, headerLines, sameLayout } from '../lib/report';
import { useStore } from '../store/StoreProvider';
import { useShell } from './shellContext';

/** The layout being looked at, remembered across visits so coming back from a list keeps it. */
const WORKING = 'report.working';

interface Working {
  /** The named layout it started from. */
  baseId: string;
  layout: ReportLayout;
}

function useWorking(): [Working, (next: Working) => void] {
  const store = useStore();
  const [working, setWorking] = useState<Working>({
    baseId: BUILT_IN_LAYOUTS[0]?.id ?? '',
    layout: FULL_LAYOUT,
  });
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store.getSetting<unknown>(WORKING).then(
      (stored) => {
        if (cancelled || touched || typeof stored !== 'object' || stored === null) return;
        const s = stored as { baseId?: unknown; layout?: unknown };
        if (typeof s.baseId !== 'string') return;
        setWorking({ baseId: s.baseId, layout: completeLayout(s.layout) });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [store, touched]);

  const update = useCallback(
    (next: Working) => {
      setTouched(true);
      setWorking(next);
      store.setSetting(WORKING, next).catch(() => undefined);
    },
    [store],
  );
  return [working, update];
}

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="screen">
      <div className="empty" role="status">
        <h1 className="empty-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function ReportRoute() {
  const { books, bookId } = useShell();
  if (books.status === 'loading') return <Message title="Loading your books…" />;
  if (bookId === undefined) {
    return (
      <Message title="No logbook on this device yet.">
        <p>Import an export from LogTen Pro or ForeFlight to see its experience report.</p>
        <Link to="/import" className="btn btn-primary">
          Import a logbook export
        </Link>
      </Message>
    );
  }
  return <BookReport key={bookId} bookId={bookId} />;
}

function BookReport({ bookId }: { bookId: BookId }) {
  const { state, retry } = useBook(bookId);
  if (state.status === 'loading') return <Message title={`Loading ${BOOK_LABELS[bookId]}…`} />;
  if (state.status === 'missing') {
    return <Message title={`The ${BOOK_LABELS[bookId]} book is no longer on this device.`} />;
  }
  if (state.status === 'error') {
    return (
      <Message title={`The ${BOOK_LABELS[bookId]} book could not be loaded.`}>
        <p>{state.message}</p>
        <button type="button" className="btn btn-primary" onClick={retry}>
          Try again
        </button>
      </Message>
    );
  }
  return <ReportView logbook={state.value} bookId={bookId} />;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportView({ logbook, bookId }: { logbook: Logbook; bookId: BookId }) {
  const { showReportList } = useShell();
  const wide = useMediaQuery(WIDE_QUERY);
  const [today] = useState(() => todayIso());
  const index = useMemo(() => indexLogbook(logbook), [logbook]);
  const pilot = useProfileDoc('pilot', completePilotProfile);
  const saved = useProfileDoc('reportLayouts', completeNamedLayouts);
  const [working, setWorking] = useWorking();
  const [panelOpen, setPanelOpen] = useState(false);
  const [naming, setNaming] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const layouts: NamedLayout[] = useMemo(
    () => [...BUILT_IN_LAYOUTS, ...saved.value],
    [saved.value],
  );
  const base = layouts.find((l) => l.id === working.baseId);
  const changed = !base || !sameLayout(base.layout, working.layout);
  const isSaved = base !== undefined && !base.id.startsWith('builtin:');

  const report = useMemo(
    () => experienceReport(logbook, index, working.layout, { today, customFields: CUSTOM_FIELDS }),
    [logbook, index, working.layout, today],
  );

  // Every row each section could show, for choosing which to hide. Only while the panel is open.
  const rows: SectionRows = useMemo(() => {
    if (!panelOpen) return {};
    const all = experienceReport(logbook, index, showAllRows(working.layout), {
      today,
      customFields: CUSTOM_FIELDS,
    });
    return Object.fromEntries(
      all.sections
        .filter((s) => s.id !== 'recent')
        .map((s) => [s.id, s.rows.map((r) => ({ id: r.id, label: r.label }))]),
    );
  }, [panelOpen, logbook, index, working.layout, today]);

  const choose = (id: string) => {
    const next = layouts.find((l) => l.id === id);
    if (next) setWorking({ baseId: next.id, layout: next.layout });
    setConfirmDelete(false);
  };

  const saveAs = (name: string) => {
    const named: NamedLayout = { id: `layout:${Date.now()}`, name, layout: working.layout };
    void saved.save([...saved.value, named]);
    setWorking({ baseId: named.id, layout: working.layout });
    setNaming(undefined);
  };

  const saveChanges = () => {
    if (!isSaved) return;
    void saved.save(
      saved.value.map((l) => (l.id === base.id ? { ...l, layout: working.layout } : l)),
    );
  };

  const remove = () => {
    if (!isSaved) return;
    void saved.save(saved.value.filter((l) => l.id !== base.id));
    choose(BUILT_IN_LAYOUTS[0]?.id ?? '');
  };

  const book = BOOK_LABELS[bookId];
  const csv = () =>
    download(
      csvFileName(today),
      reportToCsv(report, { lines: headerLines(report, pilot.value, book) }),
    );

  return (
    <div className={`report-screen${panelOpen ? ' report-screen--panel' : ''}`}>
      <div className="report-toolbar" role="toolbar" aria-label="Report">
        <label className="report-layout-pick">
          <span className="muted">Layout</span>
          <select
            className="input"
            value={base ? base.id : ''}
            onChange={(e) => choose(e.target.value)}
          >
            {base ? null : <option value="">(removed layout)</option>}
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {changed && base ? (
          <>
            <span className="report-changed">Changed</span>
            <button type="button" className="btn btn-link" onClick={() => choose(base.id)}>
              Undo changes
            </button>
          </>
        ) : null}
        {changed && isSaved ? (
          <button type="button" className="btn" onClick={saveChanges}>
            Save changes
          </button>
        ) : null}
        {naming === undefined ? (
          <button type="button" className="btn" onClick={() => setNaming('')}>
            Save as new layout…
          </button>
        ) : (
          <form
            className="report-name-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (naming.trim()) saveAs(naming.trim());
            }}
          >
            <label className="visually-hidden" htmlFor="layout-name">
              Name for the new layout
            </label>
            <input
              id="layout-name"
              className="input"
              placeholder="Insurance renewal"
              value={naming}
              autoFocus
              onChange={(e) => setNaming(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={!naming.trim()}>
              Save
            </button>
            <button type="button" className="btn btn-link" onClick={() => setNaming(undefined)}>
              Cancel
            </button>
          </form>
        )}
        {isSaved ? (
          confirmDelete ? (
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete “{base.name}”
            </button>
          ) : (
            <button type="button" className="btn btn-link" onClick={() => setConfirmDelete(true)}>
              Delete layout…
            </button>
          )
        ) : null}
        <span className="report-toolbar-end">
          <button
            type="button"
            className="btn btn-toggle"
            aria-pressed={panelOpen}
            aria-controls="report-layout-panel"
            onClick={() => setPanelOpen((o) => !o)}
          >
            Adjust layout
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print or PDF
          </button>
          <button type="button" className="btn" onClick={csv}>
            CSV
          </button>
        </span>
      </div>
      <div className="report-body">
        <div className="report-page">
          <ReportSheet
            report={report}
            pilot={pilot.value}
            bookLabel={book}
            onOpen={(label, entryIds) => showReportList({ bookId, label, entryIds })}
          />
          {!pilot.value.name && pilot.ready ? (
            <p className="report-hint muted">
              Your name, certificates and review dates can be added in{' '}
              <Link to="/settings">Settings</Link>.
            </p>
          ) : null}
        </div>
        {panelOpen ? (
          <aside
            id="report-layout-panel"
            className={`report-panel${wide ? '' : ' report-panel--sheet'}`}
            aria-label="Report layout"
          >
            <div className="report-panel-bar">
              <h2 className="popover-title">Layout</h2>
              <button type="button" className="btn" onClick={() => setPanelOpen(false)}>
                Done
              </button>
            </div>
            <ReportLayoutPanel
              layout={working.layout}
              onChange={(layout) => setWorking({ ...working, layout })}
              rows={rows}
              customFields={CUSTOM_FIELDS}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
