import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { AircraftType, Airframe, Logbook, TrainingDevice } from '@core/model';
import { aircraftUsage, indexLogbook, type AircraftUsage } from '@core/query';
import type { BookId } from '@storage/index';
import { useBook } from '../hooks/useBook';
import { useMediaQuery, WIDE_QUERY } from '../hooks/useMediaQuery';
import {
  attributeText,
  byUse,
  classText,
  currentTail,
  deviceText,
  engineText,
  periodText,
  usageText,
  type AircraftTab,
} from '../lib/aircraft';
import { BOOK_LABELS } from '../lib/books';
import { formatInt } from '../lib/format';
import { useShell } from './shellContext';

const TABS: { id: AircraftTab; label: string }[] = [
  { id: 'types', label: 'Types' },
  { id: 'aircraft', label: 'Aircraft' },
  { id: 'simulators', label: 'Simulators' },
];

const isTab = (s: string | undefined): s is AircraftTab =>
  s === 'types' || s === 'aircraft' || s === 'simulators';

const path = (tab: AircraftTab, id?: string) =>
  id === undefined ? `/aircraft/${tab}` : `/aircraft/${tab}/${encodeURIComponent(id)}`;

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="detail-rows">
      {rows
        .filter(([, v]) => v !== undefined && v !== '' && v !== null)
        .map(([k, v]) => (
          <div key={k} className="detail-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function Pane({
  title,
  sub,
  onClose,
  sheet,
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  sheet: boolean;
  children: React.ReactNode;
}) {
  return (
    <aside className="detail" aria-label={`${title} detail`}>
      <div className="detail-bar">
        <button type="button" className="btn" onClick={onClose}>
          {sheet ? 'Back to list' : 'Close'}
        </button>
      </div>
      <div className="detail-scroll">
        <div className="detail-inner">
          <header>
            <h2 className="detail-title">{title}</h2>
            {sub ? <p className="detail-sub">{sub}</p> : null}
          </header>
          {children}
        </div>
      </div>
    </aside>
  );
}

function TypeDetail({
  type,
  logbook,
  usage,
  ...pane
}: {
  type: AircraftType;
  logbook: Logbook;
  usage: AircraftUsage;
  onClose: () => void;
  sheet: boolean;
}) {
  const frames = byUse(
    logbook.airframes.filter((f) => f.configurations.some((c) => c.value === type.id)),
    (f) => usage.airframes.get(f.id),
    currentTail,
  );
  const devices = logbook.devices.filter((d) => d.represents === type.id);
  return (
    <Pane title={type.id} sub={[type.make, type.model].filter(Boolean).join(' ')} {...pane}>
      <Rows
        rows={[
          ['Time', usageText(usage.types.get(type.id))],
          ['ICAO designator', type.icaoDesignator],
          ['Class', classText(type.class)],
          ['Engine', engineText(type.engine)],
          ['Type rating', type.typeRating],
          [
            'Converted from',
            type.variantOf ? (
              <Link to={path('types', type.variantOf)}>{type.variantOf}</Link>
            ) : undefined,
          ],
          ['Attributes', attributeText(type)],
        ]}
      />
      <div className="actions">
        <Link className="btn btn-primary" to={`/?type=${encodeURIComponent(type.id)}`}>
          Show its flights
        </Link>
      </div>
      {frames.length > 0 ? (
        <section aria-label="Aircraft of this type">
          <h3 className="detail-heading">
            Aircraft <span className="muted">· {formatInt(frames.length)}</span>
          </h3>
          <ul className="link-list">
            {frames.map((f) => (
              <li key={f.id}>
                <Link to={path('aircraft', f.id)}>{currentTail(f)}</Link>
                <span className="muted">{usageText(usage.airframes.get(f.id))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {devices.length > 0 ? (
        <section aria-label="Simulators of this type">
          <h3 className="detail-heading">Simulators</h3>
          <ul className="link-list">
            {devices.map((d) => (
              <li key={d.id}>
                <Link to={path('simulators', d.id)}>{d.name}</Link>
                <span className="muted">{usageText(usage.devices.get(d.id))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Pane>
  );
}

function AirframeDetail({
  frame,
  usage,
  ...pane
}: {
  frame: Airframe;
  usage: AircraftUsage;
  onClose: () => void;
  sheet: boolean;
}) {
  const overrides = Object.entries(frame.overrides ?? {})
    .map(([k, v]) => `${k === 'taa' ? 'TAA' : k}: ${v ? 'yes' : 'no'}`)
    .join(' · ');
  return (
    <Pane title={currentTail(frame)} {...pane}>
      <Rows
        rows={[
          ['Time', usageText(usage.airframes.get(frame.id))],
          ['Serial number', frame.serialNumber],
          ['Differs from its type', overrides],
        ]}
      />
      <div className="actions">
        <Link className="btn btn-primary" to={`/?aircraft=${encodeURIComponent(frame.id)}`}>
          Show its flights
        </Link>
      </div>
      <section aria-label="Type">
        <h3 className="detail-heading">Type</h3>
        <ul className="link-list">
          {frame.configurations.map((c, i) => (
            <li key={i}>
              <Link to={path('types', c.value)}>{c.value}</Link>
              <span className="muted">{periodText(c.from, c.to)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Registrations">
        <h3 className="detail-heading">Registrations</h3>
        <ul className="link-list">
          {frame.registrations.map((r, i) => (
            <li key={i}>
              <span>{r.value}</span>
              <span className="muted">{periodText(r.from, r.to)}</span>
            </li>
          ))}
        </ul>
      </section>
    </Pane>
  );
}

function DeviceDetail({
  device,
  usage,
  ...pane
}: {
  device: TrainingDevice;
  usage: AircraftUsage;
  onClose: () => void;
  sheet: boolean;
}) {
  return (
    <Pane title={device.name} sub={`${device.level} training device`} {...pane}>
      <Rows
        rows={[
          ['Time', usageText(usage.devices.get(device.id))],
          [
            'Represents',
            device.represents ? (
              <Link to={path('types', device.represents)}>{device.represents}</Link>
            ) : undefined,
          ],
        ]}
      />
      <div className="actions">
        <Link className="btn btn-primary" to={`/?aircraft=${encodeURIComponent(device.id)}`}>
          Show its sessions
        </Link>
      </div>
    </Pane>
  );
}

function AircraftScreen({ logbook, bookId }: { logbook: Logbook; bookId: BookId }) {
  const navigate = useNavigate();
  const wide = useMediaQuery(WIDE_QUERY);
  const params = useParams();
  const [tabPart, ...rest] = (params['*'] ?? '').split('/');
  const tab: AircraftTab = isTab(tabPart) ? tabPart : 'types';
  const selectedId = rest.length > 0 ? decodeURIComponent(rest.join('/')) : undefined;

  const index = useMemo(() => indexLogbook(logbook), [logbook]);
  const usage = useMemo(() => aircraftUsage(logbook.entries, index), [logbook, index]);
  const close = () => void navigate(path(tab));

  useEffect(() => {
    if (selectedId === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      void navigate(path(tab));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId, tab, navigate]);

  const rows = useMemo(() => {
    if (tab === 'types') {
      return byUse(
        logbook.aircraftTypes,
        (t) => usage.types.get(t.id),
        (t) => t.id,
      ).map((t) => ({
        id: t.id,
        name: t.id,
        detail: [t.make, t.model].filter(Boolean).join(' '),
        aside: t.icaoDesignator ?? '',
        use: usageText(usage.types.get(t.id)),
      }));
    }
    if (tab === 'aircraft') {
      return byUse(logbook.airframes, (f) => usage.airframes.get(f.id), currentTail).map((f) => ({
        id: f.id,
        name: currentTail(f),
        detail: f.configurations.map((c) => c.value).join(' → '),
        aside: '',
        use: usageText(usage.airframes.get(f.id)),
      }));
    }
    return byUse(
      logbook.devices,
      (d) => usage.devices.get(d.id),
      (d) => d.name,
    ).map((d) => ({
      id: d.id,
      name: d.name,
      detail: deviceText(d),
      aside: '',
      use: usageText(usage.devices.get(d.id)),
    }));
  }, [tab, logbook, usage]);

  const pane = { onClose: close, sheet: !wide };
  let detail: React.ReactNode = null;
  if (selectedId !== undefined) {
    const type =
      tab === 'types' ? logbook.aircraftTypes.find((t) => t.id === selectedId) : undefined;
    const frame =
      tab === 'aircraft' ? logbook.airframes.find((f) => f.id === selectedId) : undefined;
    const device =
      tab === 'simulators' ? logbook.devices.find((d) => d.id === selectedId) : undefined;
    detail = type ? (
      <TypeDetail type={type} logbook={logbook} usage={usage} {...pane} />
    ) : frame ? (
      <AirframeDetail frame={frame} usage={usage} {...pane} />
    ) : device ? (
      <DeviceDetail device={device} usage={usage} {...pane} />
    ) : (
      <Pane title="Not found" {...pane}>
        <p>This is not in the {BOOK_LABELS[bookId]} book.</p>
      </Pane>
    );
  }

  return (
    <div className="audit">
      <div className={`audit-body${selectedId !== undefined ? ' has-selection' : ''}`}>
        <div className="audit-list-col">
          <div className="audit-filters">
            <nav className="segmented" aria-label="Aircraft lists">
              {TABS.map((t) => (
                <Link
                  key={t.id}
                  to={path(t.id)}
                  className="btn btn-toggle"
                  aria-current={t.id === tab ? 'page' : undefined}
                  aria-pressed={t.id === tab}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>
          {rows.length === 0 ? (
            <p className="audit-empty">Nothing in the {BOOK_LABELS[bookId]} book.</p>
          ) : (
            <ul className="audit-list" aria-label={TABS.find((t) => t.id === tab)!.label}>
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    to={path(tab, r.id)}
                    className={`audit-row aircraft-row${r.id === selectedId ? ' is-selected' : ''}`}
                    aria-current={r.id === selectedId ? 'true' : undefined}
                  >
                    <span className="aircraft-row-main">
                      <span className="aircraft-row-name">{r.name}</span>
                      <span className="aircraft-row-detail">{r.detail}</span>
                      <span className="aircraft-row-aside">{r.aside}</span>
                    </span>
                    <span className="aircraft-row-use">{r.use}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="audit-detail-col">
          {detail ??
            (wide ? (
              <div className="detail detail--empty">
                <p className="muted">
                  {tab === 'types'
                    ? 'Select a type to see its aircraft and time.'
                    : tab === 'aircraft'
                      ? 'Select an aircraft to see its type, registrations and time.'
                      : 'Select a simulator to see its sessions.'}
                </p>
              </div>
            ) : null)}
        </div>
      </div>
    </div>
  );
}

export function AircraftRoute() {
  const { bookId } = useShell();
  const { state, retry } = useBook(bookId);
  if (bookId === undefined || state.status === 'missing') {
    return (
      <div className="screen">
        <div className="empty">
          <h1 className="empty-title">No logbook on this device yet.</h1>
          <Link to="/import" className="btn btn-primary">
            Import a logbook export
          </Link>
        </div>
      </div>
    );
  }
  if (state.status === 'loading') {
    return (
      <div className="screen">
        <p role="status">Loading {BOOK_LABELS[bookId]}…</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="screen">
        <div className="empty" role="alert">
          <h1 className="empty-title">The {BOOK_LABELS[bookId]} book could not be loaded.</h1>
          <p>{state.message}</p>
          <button type="button" className="btn btn-primary" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  return <AircraftScreen key={bookId} logbook={state.value} bookId={bookId} />;
}
