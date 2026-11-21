import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  amendPairDecision,
  decisionKey,
  proposeRules,
  ruleDecisions,
  type Decision,
  type DecisionField,
  type PairDecision,
  type ResolvedOrphan,
  type RuleProposal,
} from '@core/reconcile';
import { writeMainBook, type Audit } from '@storage/index';
import { AuditDetail, type DetailActions } from '../components/AuditDetail';
import { AuditOverview, type OverviewActions } from '../components/AuditOverview';
import { FixList } from '../components/FixList';
import { useAirports } from '../hooks/useAirports';
import { useAudit } from '../hooks/useAudit';
import { useMediaQuery, WIDE_QUERY } from '../hooks/useMediaQuery';
import {
  auditItems,
  fieldLabel,
  isOpen,
  proposalTitle,
  SIDE_LABEL,
  tierText,
  type AuditItem,
} from '../lib/audit';
import { BOOK_LABELS } from '../lib/books';
import { formatInt, shortDate } from '../lib/format';
import { useStore } from '../store/StoreProvider';
import { useShell } from './shellContext';

type Show = 'open' | 'decided' | 'all';
const PAGE = 150;
/** The detail pane's address for the fix list; entry ids all start with `main:`. */
const FIXES = 'fixes';
const now = () => new Date().toISOString();

function rejectedDecisionFor(audit: Audit, orphan: ResolvedOrphan): PairDecision | undefined {
  return audit.decisions.find(
    (d): d is PairDecision =>
      d.kind === 'pair' && d.match === 'rejected' && d[orphan.side] === orphan.fingerprint,
  );
}

function ItemRow({
  item,
  selected,
  onSelect,
}: {
  item: AuditItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const notes: string[] = [];
  if (item.orphan) {
    notes.push(
      item.orphan.action === 'undecided'
        ? `Only in ${SIDE_LABEL[item.orphan.side]}`
        : item.orphan.action === 'keep'
          ? `Only in ${SIDE_LABEL[item.orphan.side]} · kept`
          : `Only in ${SIDE_LABEL[item.orphan.side]} · left out`,
    );
  }
  if (item.pair && item.openItself) notes.push(`Confirm pairing: ${tierText(item.pair.tier)}`);
  const shown = item.openFields.slice(0, 3).map(fieldLabel);
  if (item.openFields.length > 3) shown.push(`+${item.openFields.length - 3}`);
  if (shown.length > 0) notes.push(shown.join(', '));
  if (notes.length === 0) notes.push('Decided');

  return (
    <li>
      <button
        type="button"
        className={`audit-row${selected ? ' is-selected' : ''}${isOpen(item) ? '' : ' is-done'}`}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className="audit-row-main">
          <span className="audit-row-date">{shortDate(item.date)}</span>
          <span className="audit-row-tail">{item.tail || '—'}</span>
          <span className="audit-row-route">{item.route}</span>
        </span>
        <span className="audit-row-notes">{notes.join(' · ')}</span>
      </button>
    </li>
  );
}

function AuditScreen({ audit }: { audit: Audit }) {
  const store = useStore();
  const shell = useShell();
  const navigate = useNavigate();
  const airports = useAirports();
  const wide = useMediaQuery(WIDE_QUERY);
  const params = useParams();
  const selectedId = params['*'] ? decodeURIComponent(params['*']) : undefined;

  const [show, setShow] = useState<Show>('open');
  const [fieldFilter, setFieldFilter] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [building, setBuilding] = useState(false);
  const [failure, setFailure] = useState<string>();

  /** Set while the list shows the flights of one operating-rule proposal. */
  const [group, setGroup] = useState<{ title: string; ids: ReadonlySet<string> }>();

  const items = useMemo(() => auditItems(audit.resolution), [audit.resolution]);
  const groupItems = useMemo(
    () => (group ? auditItems(audit.resolution, group.ids) : undefined),
    [audit.resolution, group],
  );
  const proposals = useMemo(() => proposeRules(audit.resolution, audit), [audit]);
  const openItems = useMemo(() => items.filter(isOpen), [items]);
  const fieldsInPlay = useMemo(() => {
    const counts = new Map<DecisionField, number>();
    for (const item of openItems) {
      for (const f of item.openFields) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return [...counts].sort((x, y) => y[1] - x[1]);
  }, [openItems]);

  const visible = useMemo(() => {
    if (groupItems) return groupItems;
    let list =
      show === 'open' ? openItems : show === 'decided' ? items.filter((i) => i.touched) : items;
    if (fieldFilter !== '') {
      list = list.filter((i) =>
        i.pair?.fields.some((f) => f.field === fieldFilter && f.class !== 'equivalent'),
      );
    }
    return list;
  }, [items, openItems, show, fieldFilter, groupItems]);

  const selected =
    selectedId === undefined
      ? undefined
      : (groupItems?.find((i) => i.id === selectedId) ??
        items.find((i) => i.id === selectedId) ??
        auditItems(audit.resolution, new Set([selectedId]))[0]);
  const open = (id: string) => void navigate(`/audit/${encodeURIComponent(id)}`);
  const close = useCallback(() => void navigate('/audit'), [navigate]);

  // Deciding the last open thing on a flight moves on to the next open one, so a run of
  // decisions needs no trips back to the list.
  const openIds = openItems.map((i) => i.id);
  const nextOpen = (afterId: string): string | undefined => {
    const at = visible.findIndex((i) => i.id === afterId);
    return visible.slice(at + 1).find((i) => isOpen(i))?.id;
  };

  useEffect(() => {
    if (selectedId === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, close]);

  const write = (work: Promise<unknown>) => {
    setFailure(undefined);
    work.catch((error: unknown) =>
      setFailure(error instanceof Error ? error.message : String(error)),
    );
  };
  const put = (decisions: Decision[]) => write(store.putDecisions(decisions));

  const setRules = (
    entries: readonly string[],
    rule: Parameters<OverviewActions['setRules']>[1],
  ) => {
    if (rule === undefined) write(store.removeDecisions(entries.map((entry) => `rule:${entry}`)));
    else put(ruleDecisions(entries, rule, now()));
  };

  const detailActions: DetailActions = {
    setRule: (rule) => {
      if (selected) setRules([selected.anchor], rule);
    },
    setField: (pair, field, choice) =>
      put([amendPairDecision(pair, { fields: { [field]: choice } }, now())]),
    setMatch: (pair, match) => {
      put([amendPairDecision(pair, { match }, now())]);
      if (match === 'rejected') close();
    },
    setOrphan: (orphan, action) => {
      const key = `orphan:${orphan.side}:${orphan.fingerprint}`;
      if (action === undefined) write(store.removeDecisions([key]));
      else {
        put([
          {
            kind: 'orphan',
            side: orphan.side,
            record: orphan.fingerprint,
            action,
            decidedAt: now(),
          },
        ]);
      }
    },
  };
  if (selected?.orphan && rejectedDecisionFor(audit, selected.orphan)) {
    detailActions.undoReject = (orphan) => {
      const decision = rejectedDecisionFor(audit, orphan);
      if (!decision) return;
      const { match, ...rest } = decision;
      void match;
      put([{ ...rest, decidedAt: now() }]);
      close();
    };
  }

  const overviewActions: OverviewActions = {
    setBulk: (pattern, field, choice) => {
      if (choice === undefined) {
        write(store.removeDecisions([`bulk:${pattern}:${field ?? '*'}`]));
      } else {
        put([{ kind: 'bulk', pattern, choice, decidedAt: now(), ...(field ? { field } : {}) }]);
      }
    },
    setRules,
    showFlights: (proposal: RuleProposal) => {
      setGroup({ title: proposalTitle(proposal), ids: new Set(proposal.entryIds) });
      setLimit(PAGE);
    },
    showFixes: () => void navigate(`/audit/${FIXES}`),
    removeStale: () => write(store.removeDecisions(audit.resolution.stale.map(decisionKey))),
    build: () => {
      setBuilding(true);
      write(
        writeMainBook(store, audit, {
          airports: airports.status === 'ready' ? airports.airports : undefined,
          now,
        }).finally(() => setBuilding(false)),
      );
    },
    openMain: () => {
      shell.selectBook('main');
      void navigate('/');
    },
  };

  const undecidedOrphans = audit.resolution.orphans.filter((o) => o.action === 'undecided');
  const keepAll = () =>
    put(
      undecidedOrphans.map((o) => ({
        kind: 'orphan' as const,
        side: o.side,
        record: o.fingerprint,
        action: 'keep' as const,
        decidedAt: now(),
      })),
    );

  const main =
    shell.books.status === 'ready' ? shell.books.value.find((b) => b.book === 'main') : undefined;
  const overview = (
    <AuditOverview
      audit={audit}
      proposals={proposals}
      prefs={shell.prefs}
      main={main}
      building={building}
      canBuild={airports.status !== 'loading'}
      actions={overviewActions}
    />
  );
  const shownItems = visible.slice(0, limit);
  const upNext = selected && !isOpen(selected) ? nextOpen(selected.id) : undefined;

  return (
    <div className="audit">
      {failure ? (
        <p className="notice" role="alert">
          That could not be saved: {failure}
        </p>
      ) : null}
      <div className={`audit-body${selectedId !== undefined ? ' has-selection' : ''}`}>
        <div className="audit-list-col">
          {wide ? null : overview}
          {group ? (
            <div className="audit-filters">
              <span className="audit-group-title">{group.title}</span>
              <button type="button" className="btn" onClick={() => setGroup(undefined)}>
                Back to differences
              </button>
            </div>
          ) : (
            <div className="audit-filters">
              <div className="segmented" role="group" aria-label="Show">
                {(
                  [
                    ['open', `To do (${formatInt(openIds.length)})`],
                    ['decided', 'Decided by you'],
                    ['all', 'All'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className="btn btn-toggle"
                    aria-pressed={show === value}
                    onClick={() => {
                      setShow(value);
                      setLimit(PAGE);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="field audit-field-filter">
                <span>Difference in</span>
                <select
                  className="input"
                  value={fieldFilter}
                  onChange={(event) => {
                    setFieldFilter(event.target.value);
                    setLimit(PAGE);
                  }}
                >
                  <option value="">Anything</option>
                  {fieldsInPlay.map(([field, count]) => (
                    <option key={field} value={field}>
                      {fieldLabel(field)} ({count})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {!group && undecidedOrphans.length > 1 && show === 'open' && fieldFilter === '' ? (
            <div className="audit-bulk-orphans">
              <span>{formatInt(undecidedOrphans.length)} entries are in one app only.</span>
              <button type="button" className="btn" onClick={keepAll}>
                Keep all {formatInt(undecidedOrphans.length)}
              </button>
            </div>
          ) : null}
          {visible.length === 0 ? (
            <p className="audit-empty" role="status">
              {show === 'open' ? 'Nothing left to decide here.' : 'Nothing to show.'}
            </p>
          ) : (
            <ul className="audit-list" aria-label="Flights to review">
              {shownItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() => open(item.id)}
                />
              ))}
              {visible.length > limit ? (
                <li className="audit-more">
                  <button type="button" className="btn" onClick={() => setLimit(limit + PAGE)}>
                    Show {Math.min(PAGE, visible.length - limit)} more of{' '}
                    {formatInt(visible.length)}
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </div>
        <div className="audit-detail-col">
          {selectedId === FIXES ? (
            <FixList
              resolution={audit.resolution}
              prefs={shell.prefs}
              onClose={close}
              sheet={!wide}
            />
          ) : selectedId === undefined ? (
            wide ? (
              <div className="detail">
                <div className="detail-scroll">
                  <div className="detail-inner">{overview}</div>
                </div>
              </div>
            ) : null
          ) : selected ? (
            <>
              <AuditDetail
                key={selected.id}
                pair={selected.pair}
                orphan={selected.orphan}
                actions={detailActions}
                onClose={close}
                sheet={!wide}
                prefs={shell.prefs}
                rule={selected.rule}
              />
              {upNext ? (
                <div className="audit-next">
                  <span>Nothing left to decide on this one.</span>
                  <button type="button" className="btn btn-primary" onClick={() => open(upNext)}>
                    Next to do
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <aside className="detail" aria-label="Audit detail">
              <div className="detail-bar">
                <button type="button" className="btn" onClick={close}>
                  {wide ? 'Close' : 'Back to list'}
                </button>
              </div>
              <div className="detail-inner">
                <p>This flight no longer needs a decision, or its rows have changed.</p>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuditRoute() {
  const { state, retry } = useAudit();

  if (state.status === 'ready') return <AuditScreen audit={state.audit} />;

  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="screen-title">Audit</h1>
        {state.status === 'loading' ? (
          <p role="status">Comparing the two logbooks…</p>
        ) : state.status === 'error' ? (
          <>
            <p role="alert">The audit could not be loaded: {state.message}</p>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={retry}>
                Try again
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="lede">
              The audit compares your LogTen and ForeFlight exports flight by flight. It needs the
              file from each app.
            </p>
            <p role="status">
              Still needed: {state.missing.map((source) => BOOK_LABELS[source]).join(' and ')}. A
              book imported before the audit existed has to be imported once more.
            </p>
            <div className="actions">
              <Link className="btn btn-primary" to="/import">
                Go to Import
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
