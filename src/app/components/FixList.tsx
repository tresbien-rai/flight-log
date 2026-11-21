import { Link } from 'react-router';
import type { Side } from '@core/reconcile';
import { fixList, routeText, SIDE_LABEL, type FixItem } from '../lib/audit';
import { formatInt, shortDate } from '../lib/format';
import type { DisplayPrefs } from '../lib/prefs';
import type { Resolution } from '@core/reconcile';
import { formatFlightNumber } from '@core/importers';

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}Z`;

/** How to find the row in the app: its own date, flight number, tail, route and out time. */
function where(item: FixItem, prefs: DisplayPrefs): string {
  const r = item.record;
  return [
    shortDate(r.date),
    r.flightNumber ? formatFlightNumber(r.flightNumber, prefs.flightNumberStyle) : undefined,
    r.tail,
    routeText(r),
    r.clock.out !== undefined ? `out ${hhmm(r.clock.out)}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function AppFixes({ side, items, prefs }: { side: Side; items: FixItem[]; prefs: DisplayPrefs }) {
  const app = SIDE_LABEL[side];
  return (
    <section aria-labelledby={`fixes-${side}`} className="fix-app">
      <h2 id={`fixes-${side}`} className="detail-heading">
        In {app} <span className="muted">· {formatInt(items.length)}</span>
      </h2>
      {items.length === 0 ? (
        <p className="muted">Nothing to change.</p>
      ) : (
        <ul className="fix-list">
          {items.map((item) => (
            <li key={`${item.entryId}:${item.kind}`} className="fix">
              <p className="fix-where">
                <Link to={`/audit/${encodeURIComponent(item.entryId)}`}>{where(item, prefs)}</Link>
              </p>
              {item.kind === 'add' ? (
                <p>Add this entry: it is only in the other app, and you kept it.</p>
              ) : item.kind === 'delete' ? (
                <p>Delete this entry: you left it out of your logbook.</p>
              ) : (
                <dl className="fix-changes">
                  {item.changes.map((c) => (
                    <div key={c.field} className="fix-change">
                      <dt>{c.label}</dt>
                      <dd>
                        <span className="fix-now">{c.now}</span>
                        <span aria-hidden="true"> → </span>
                        <span className="visually-hidden"> should be </span>
                        <span className="fix-should">{c.should}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Where each app disagrees with the pilot's decisions, and what to change it to. */
export function FixList({
  resolution,
  prefs,
  onClose,
  sheet,
}: {
  resolution: Resolution;
  prefs: DisplayPrefs;
  onClose: () => void;
  sheet: boolean;
}) {
  const fixes = fixList(resolution, prefs);
  return (
    <aside className="detail" aria-label="Fix in the apps">
      <div className="detail-bar">
        <button type="button" className="btn" onClick={onClose}>
          {sheet ? 'Back to list' : 'Close'}
        </button>
      </div>
      <div className="detail-scroll">
        <div className="detail-inner">
          <header>
            <h1 className="detail-title">Fix in the apps</h1>
            <p className="detail-sub">
              Each row is dated and described as that app has it. Once you have corrected the app
              and imported its export again, the row leaves this list.
            </p>
          </header>
          <AppFixes side="a" items={fixes.a} prefs={prefs} />
          <AppFixes side="b" items={fixes.b} prefs={prefs} />
        </div>
      </div>
    </aside>
  );
}
