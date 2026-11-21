import type { NameOrder } from '@core/importers';
import { personName } from '../lib/names';
import { useEffect, useRef, type ReactNode } from 'react';
import { DURATION_FIELDS, type Approach, type DurationField, type Entry } from '@core/model';
import type { LogbookIndex } from '@core/query';
import type { Finding } from '@core/validation';
import { formatDecimal } from '@core/time/duration';
import { hoursAndClock, longDate, minutesBetween, utcClock, formatInt } from '../lib/format';
import { bySeverity, ruleTitle, SEVERITY_SYMBOL, SEVERITY_WORD } from '../lib/findings';

const DURATION_LABELS: Record<DurationField, string> = {
  total: 'Total time',
  pic: 'Pilot in command',
  sic: 'Second in command',
  solo: 'Solo',
  night: 'Night',
  crossCountry: 'Cross-country',
  crossCountry50: 'Cross-country over 50 NM',
  actualInstrument: 'Actual instrument',
  simulatedInstrument: 'Simulated instrument',
  dualReceived: 'Dual received',
  dualGiven: 'Dual given',
  simulator: 'Simulator session',
  groundTraining: 'Ground training',
};

const CUSTOM_LABELS: Record<string, { label: string; kind: 'duration' | 'count' }> = {
  dualGivenPPL: { label: 'Dual given, private pilot students', kind: 'duration' },
  dualGivenIRA: { label: 'Dual given, instrument students', kind: 'duration' },
  dualGivenCPL: { label: 'Dual given, commercial students', kind: 'duration' },
  passengerCount: { label: 'Passengers', kind: 'count' },
};

const RULE_NAMES: Record<Entry['rule'], string> = {
  '91': 'Part 91',
  '121': 'Part 121',
  '135': 'Part 135',
  other: 'Other',
};

const CREW_ROLES: Record<string, string> = {
  PIC: 'Pilot in command',
  SIC: 'Second in command',
  instructor: 'Instructor',
  student: 'Student',
  examiner: 'Examiner',
  observer: 'Observer',
  passenger: 'Passenger',
  other: 'Other',
};

const KIND_NAMES: Record<Entry['kind'], string> = {
  flight: 'Flight',
  simulator: 'Simulator session',
  ground: 'Ground training',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h3 className="detail-heading">{title}</h3>
      {children}
    </section>
  );
}

type RowList = [string, ReactNode][];

const present = (rows: RowList): RowList =>
  rows.filter(([, value]) => value !== undefined && value !== null && value !== '');

function Rows({ rows }: { rows: RowList }) {
  const shown = present(rows);
  return (
    <dl className="detail-rows">
      {shown.map(([term, value]) => (
        <div key={term} className="detail-row">
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A titled list of label/value rows. Left out entirely when nothing in it is recorded. */
function RowSection({ title, rows, note }: { title: string; rows: RowList; note?: string }) {
  if (present(rows).length === 0) return null;
  return (
    <Section title={title}>
      <Rows rows={rows} />
      {note ? <p className="muted detail-note">{note}</p> : null}
    </Section>
  );
}

function approachText(a: Approach): string {
  return [
    a.type,
    a.runway ? `runway ${a.runway}` : undefined,
    a.airport ? `at ${a.airport}` : undefined,
    a.circleToLand ? 'circle to land' : undefined,
    a.missed ? 'missed' : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

export function EntryDetail({
  entry,
  index,
  findings,
  onClose,
  sheet,
  nameOrder,
}: {
  entry: Entry;
  index: LogbookIndex;
  findings: readonly Finding[];
  onClose: () => void;
  /** True when shown as a full-screen sheet rather than a side pane. */
  sheet: boolean;
  nameOrder: NameOrder;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const crewName = (personId: string) => {
    const person = index.person(personId);
    return person ? personName(person, nameOrder) : personId;
  };
  const backRef = useRef<HTMLButtonElement>(null);

  // A new entry starts at the top; a newly opened sheet takes focus so Back is one keypress away.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [entry.id]);
  useEffect(() => {
    if (sheet) backRef.current?.focus();
  }, [sheet]);

  const type = index.typeOf(entry);
  const tail = index.tailOf(entry);
  const device = index.deviceOf(entry);
  const d = entry.durations;
  const block = minutesBetween(entry.out, entry.in);
  const airborne = minutesBetween(entry.off, entry.on);
  const l = entry.landings;

  const times = DURATION_FIELDS.filter((f) => d[f] > 0);
  const landingRows: RowList = [
    ['Day takeoffs', entry.dayTakeoffs || undefined],
    ['Night takeoffs', entry.nightTakeoffs || undefined],
    ['Day landings, full stop', l.dayFullStop || undefined],
    ['Day landings, touch and go', l.dayTouchAndGo || undefined],
    ['Night landings, full stop', l.nightFullStop || undefined],
    ['Night landings, touch and go', l.nightTouchAndGo || undefined],
    ['Go-arounds', entry.goArounds || undefined],
  ];

  const route =
    entry.kind === 'flight' && entry.from
      ? entry.to
        ? `${entry.from}–${entry.to}`
        : `${entry.from} local`
      : undefined;
  const customRows: RowList = Object.entries(entry.custom).map(([key, value]) => {
    const known = CUSTOM_LABELS[key];
    if (known && typeof value === 'number') {
      return [
        known.label,
        known.kind === 'duration' ? `${formatDecimal(value)} h` : formatInt(value),
      ];
    }
    return [
      known?.label ?? key,
      typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value),
    ];
  });

  return (
    <aside className={`detail${sheet ? ' detail--sheet' : ''}`} aria-label="Entry detail">
      <div className="detail-bar">
        {sheet ? (
          <button ref={backRef} type="button" className="btn" onClick={onClose}>
            <span aria-hidden="true">‹ </span>Back to list
          </button>
        ) : (
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="detail-scroll" ref={scrollRef}>
        <div className="detail-inner">
          <header className="detail-head">
            <h2 className="detail-title">{longDate(entry.date)}</h2>
            <p className="detail-sub">
              {[tail, type?.id, route].filter(Boolean).join(' · ') || KIND_NAMES[entry.kind]}
            </p>
            <p className="detail-sub">
              {KIND_NAMES[entry.kind]}
              {entry.kind === 'flight' ? ` · ${RULE_NAMES[entry.rule]}` : ''}
            </p>
          </header>

          {findings.length > 0 ? (
            <Section title={`Findings (${findings.length})`}>
              <ul className="finding-list">
                {bySeverity(findings).map((f, i) => (
                  <li key={`${f.ruleId}:${i}`} className={`finding finding--${f.severity}`}>
                    <p className="finding-head">
                      <span className="finding-sev">
                        <span aria-hidden="true" className="finding-symbol">
                          {SEVERITY_SYMBOL[f.severity]}
                        </span>
                        {SEVERITY_WORD[f.severity]}
                      </span>
                      <span className="finding-title">{ruleTitle(f.ruleId)}</span>
                    </p>
                    <p className="finding-message">{f.message}</p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <RowSection
            title="When"
            note={
              entry.out || entry.off || entry.on || entry.in ? 'Clock times are UTC.' : undefined
            }
            rows={[
              ['Local date', longDate(entry.date)],
              ['Out', entry.out ? utcClock(entry.out) : undefined],
              ['Off', entry.off ? utcClock(entry.off) : undefined],
              ['On', entry.on ? utcClock(entry.on) : undefined],
              ['In', entry.in ? utcClock(entry.in) : undefined],
              ['Block time', block !== undefined ? hoursAndClock(block) : undefined],
              ['Airborne time', airborne !== undefined ? hoursAndClock(airborne) : undefined],
            ]}
          />

          <RowSection
            title="Aircraft"
            rows={[
              [device ? 'Device' : 'Tail', tail],
              ['Level', device?.level],
              ['Type', type?.id],
              ['Make and model', type ? `${type.make} ${type.model}` : undefined],
            ]}
          />

          {entry.kind === 'flight' ? (
            <RowSection
              title="Route"
              rows={[
                ['From', entry.from],
                ['To', entry.to ?? (entry.from ? 'Local flight' : undefined)],
                ['Route', entry.route],
                ['Flight number', entry.flightNumber],
                ['Operating rule', RULE_NAMES[entry.rule]],
              ]}
            />
          ) : null}

          <RowSection
            title="Role"
            rows={[
              [
                'Seat',
                entry.seat === 'PIC'
                  ? 'Pilot in command'
                  : entry.seat === 'SIC'
                    ? 'Second in command'
                    : undefined,
              ],
              [
                'Pilot flying',
                entry.pilotFlying === undefined ? undefined : entry.pilotFlying ? 'Yes' : 'No',
              ],
            ]}
          />

          <Section title="Time">
            {times.length === 0 ? (
              <p className="muted">No time recorded.</p>
            ) : (
              <dl className="detail-rows">
                {times.map((f) => (
                  <div key={f} className="detail-row">
                    <dt>{DURATION_LABELS[f]}</dt>
                    <dd className="num">{hoursAndClock(d[f])}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Section>

          <RowSection title="Takeoffs and landings" rows={landingRows} />

          {entry.approaches.length > 0 || entry.holds > 0 ? (
            <Section title="Approaches and holds">
              {entry.approaches.length > 0 ? (
                <ul className="plain-list">
                  {entry.approaches.map((a, i) => (
                    <li key={i}>
                      {approachText(a)}
                      {a.note ? <span className="muted"> ({a.note})</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {entry.holds > 0 ? <Rows rows={[['Holds', formatInt(entry.holds)]]} /> : null}
            </Section>
          ) : null}

          {entry.crew.length > 0 ? (
            <Section title="Crew">
              <dl className="detail-rows">
                {entry.crew.map((c, i) => (
                  <div key={`${c.personId}:${i}`} className="detail-row">
                    <dt>{CREW_ROLES[c.role] ?? c.role}</dt>
                    <dd>{crewName(c.personId)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          ) : null}

          <RowSection title="Custom fields" rows={customRows} />

          {entry.remarks ? (
            <Section title="Remarks">
              <p className="remarks">{entry.remarks}</p>
            </Section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
