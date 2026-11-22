import { useMemo, useState, type FormEvent } from 'react';
import {
  parseConversionList,
  periodsFromChanges,
  withTypeFrom,
  type AircraftEdits,
  type AirframeEdit,
  type TypeEdit,
} from '@core/aircraft';
import type {
  AircraftClass,
  AircraftType,
  Airframe,
  Dated,
  EngineType,
  Logbook,
} from '@core/model';
import { classText, currentTail, engineText } from '../lib/aircraft';
import { formatInt } from '../lib/format';

const CLASSES: AircraftClass[] = [
  'ASEL',
  'AMEL',
  'ASES',
  'AMES',
  'helicopter',
  'gyroplane',
  'other',
];
const ENGINES: EngineType[] = [
  'piston',
  'turboprop',
  'turbofan',
  'turbojet',
  'turboshaft',
  'electric',
  'none',
];
const FLAGS = [
  ['multiPilot', 'Multi-pilot'],
  ['complex', 'Complex'],
  ['highPerformance', 'High performance'],
  ['taa', 'Technically advanced (TAA)'],
  ['retractable', 'Retractable gear'],
  ['pressurized', 'Pressurised'],
  ['tailwheel', 'Tailwheel'],
] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function FormActions({ onCancel, onReset }: { onCancel: () => void; onReset?: () => void }) {
  return (
    <div className="actions">
      <button type="submit" className="btn btn-primary">
        Save
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
      {onReset ? (
        <button type="button" className="btn btn-link" onClick={onReset}>
          Undo my changes
        </button>
      ) : null}
    </div>
  );
}

/** Edits a type. Only fields that differ from what is shown now are stored. */
export function TypeForm({
  type,
  typeIds,
  edited,
  onSave,
  onReset,
  onCancel,
}: {
  type: AircraftType;
  typeIds: readonly string[];
  /** True when the pilot has changed this type before. */
  edited: boolean;
  onSave: (changes: TypeEdit) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    make: type.make,
    model: type.model,
    icaoDesignator: type.icaoDesignator ?? '',
    class: type.class,
    engine: type.engine,
    typeRating: type.typeRating ?? '',
    variantOf: type.variantOf ?? '',
    notes: type.notes ?? '',
    ...Object.fromEntries(FLAGS.map(([k]) => [k, Boolean(type[k])])),
  } as Record<string, string | boolean>);
  const set = (k: string, v: string | boolean) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = (k: string) => (f[k] as string).trim();
    const next: TypeEdit = {
      make: text('make'),
      model: text('model'),
      icaoDesignator: text('icaoDesignator').toUpperCase() || undefined,
      class: f.class as AircraftClass,
      engine: f.engine as EngineType,
      typeRating: text('typeRating') || undefined,
      variantOf: text('variantOf') || undefined,
      notes: text('notes') || undefined,
      ...Object.fromEntries(FLAGS.map(([k]) => [k, f[k] as boolean])),
    };
    const changes = Object.fromEntries(
      Object.entries(next).filter(
        ([k, v]) =>
          (type[k as keyof AircraftType] ?? undefined) !== v &&
          !(v === false && type[k as keyof AircraftType] === undefined),
      ),
    ) as TypeEdit;
    onSave(changes);
  };

  const field = (k: string, label: string) => (
    <label className="field">
      <span>{label}</span>
      <input className="input" value={f[k] as string} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <form className="edit-form" onSubmit={submit} aria-label={`Edit ${type.id}`}>
      {field('make', 'Make')}
      {field('model', 'Model')}
      {field('icaoDesignator', 'ICAO designator')}
      <label className="field">
        <span>Category and class</span>
        <select
          className="input"
          value={f.class as string}
          onChange={(e) => set('class', e.target.value)}
        >
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {classText(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Engine</span>
        <select
          className="input"
          value={f.engine as string}
          onChange={(e) => set('engine', e.target.value)}
        >
          {ENGINES.map((e) => (
            <option key={e} value={e}>
              {engineText(e)}
            </option>
          ))}
        </select>
      </label>
      {field('typeRating', 'Type rating')}
      <label className="field">
        <span>Converted from</span>
        <select
          className="input"
          value={f.variantOf as string}
          onChange={(e) => set('variantOf', e.target.value)}
        >
          <option value="">Not a conversion</option>
          {typeIds
            .filter((id) => id !== type.id)
            .map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
        </select>
      </label>
      <fieldset className="edit-flags">
        <legend className="choice-name">Attributes</legend>
        {FLAGS.map(([k, label]) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={f[k] as boolean}
              onChange={(e) => set(k, e.target.checked)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Notes</span>
        <textarea
          className="input textarea"
          value={f.notes as string}
          onChange={(e) => set('notes', e.target.value)}
        />
      </label>
      <FormActions onCancel={onCancel} onReset={edited ? onReset : undefined} />
    </form>
  );
}

interface Change {
  value: string;
  /** Empty for the first row: "from the start". */
  from: string;
}

const toChanges = (periods: readonly Dated<string>[]): Change[] =>
  periods.map((p, i) => ({ value: p.value, from: i === 0 ? '' : (p.from ?? '') }));

/** A history of values with the dates they changed: the first runs from the start. */
function HistoryEditor({
  label,
  rows,
  onChange,
  valueInput,
  addLabel,
  note,
}: {
  label: string;
  rows: Change[];
  onChange: (rows: Change[]) => void;
  valueInput: (value: string, set: (v: string) => void, i: number) => React.ReactNode;
  addLabel: string;
  note?: (row: Change, i: number) => string | undefined;
}) {
  const update = (i: number, patch: Partial<Change>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="history">
      <legend className="choice-name">{label}</legend>
      {rows.map((r, i) => (
        <div key={i} className="history-row">
          {i === 0 ? (
            <span className="history-from muted">From the start</span>
          ) : (
            <label className="history-from">
              <span className="visually-hidden">
                {label} change {i}: from
              </span>
              <input
                type="date"
                className="input"
                value={r.from}
                onChange={(e) => update(i, { from: e.target.value })}
              />
            </label>
          )}
          {valueInput(r.value, (v) => update(i, { value: v }), i)}
          {i > 0 ? (
            <button
              type="button"
              className="btn"
              aria-label={`Remove ${label.toLowerCase()} change ${i}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          ) : null}
          {note?.(r, i) ? <p className="history-note muted">{note(r, i)}</p> : null}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-link"
        onClick={() => onChange([...rows, { value: rows.at(-1)?.value ?? '', from: '' }])}
      >
        {addLabel}
      </button>
    </fieldset>
  );
}

/** Edits an airframe: its types and tails over time, serial number, TAA and notes. */
export function AirframeForm({
  frame,
  logbook,
  typeIds,
  edited,
  onSave,
  onReset,
  onCancel,
}: {
  frame: Airframe;
  logbook: Logbook;
  typeIds: readonly string[];
  edited: boolean;
  onSave: (edit: AirframeEdit) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const [types, setTypes] = useState<Change[]>(toChanges(frame.configurations));
  const [tails, setTails] = useState<Change[]>(toChanges(frame.registrations));
  const [serial, setSerial] = useState(frame.serialNumber ?? '');
  const [taa, setTaa] = useState(
    frame.overrides?.taa === undefined ? '' : String(frame.overrides.taa),
  );
  const [notes, setNotes] = useState(frame.notes ?? '');
  const [error, setError] = useState<string>();

  const dates = useMemo(
    () =>
      logbook.entries
        .filter((e) => e.airframeId === frame.id && e.kind === 'flight')
        .map((e) => e.date),
    [logbook, frame.id],
  );
  const flightsFrom = (from: string, until?: string) =>
    dates.filter((d) => d >= from && (until === undefined || d < until)).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const bad =
      types.slice(1).some((r) => !DATE.test(r.from)) ||
      tails.slice(1).some((r) => !DATE.test(r.from));
    if (bad || types.some((r) => r.value === '') || tails.some((r) => r.value.trim() === '')) {
      setError('Every change needs a date, and every row a type or tail.');
      return;
    }
    const periods = (rows: Change[]) =>
      periodsFromChanges(rows.map((r, i) => (i === 0 ? { value: r.value } : r)));
    const edit: AirframeEdit = {
      configurations: periods(types),
      registrations: periods(tails.map((t) => ({ ...t, value: t.value.trim().toUpperCase() }))),
      serialNumber: serial.trim() || undefined,
      overrides: taa === '' ? undefined : { ...frame.overrides, taa: taa === 'true' },
      notes: notes.trim() || undefined,
    };
    onSave(edit);
  };

  return (
    <form className="edit-form" onSubmit={submit} aria-label={`Edit ${currentTail(frame)}`}>
      <HistoryEditor
        label="Type"
        rows={types}
        onChange={setTypes}
        addLabel="Converted to another type on…"
        valueInput={(value, set, i) => (
          <label className="history-value">
            <span className="visually-hidden">Type {i}</span>
            <select className="input" value={value} onChange={(e) => set(e.target.value)}>
              {typeIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        )}
        note={(r, i) => {
          if (i === 0 || !DATE.test(r.from)) return undefined;
          const next = types[i + 1]?.from;
          const n = flightsFrom(r.from, next && DATE.test(next) ? next : undefined);
          return `${formatInt(n)} ${n === 1 ? 'flight counts' : 'flights count'} as ${r.value}.`;
        }}
      />
      <HistoryEditor
        label="Registration"
        rows={tails}
        onChange={setTails}
        addLabel="Re-registered on…"
        valueInput={(value, set, i) => (
          <label className="history-value">
            <span className="visually-hidden">Tail {i}</span>
            <input className="input" value={value} onChange={(e) => set(e.target.value)} />
          </label>
        )}
        note={(r, i) =>
          i > 0 &&
          logbook.airframes.some(
            (f) => f.id === `af:${r.value.trim().toUpperCase()}` && f.id !== frame.id,
          )
            ? `${r.value.toUpperCase()} is listed as its own aircraft; its flights will move here.`
            : undefined
        }
      />
      <label className="field">
        <span>Serial number</span>
        <input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} />
      </label>
      <label className="field">
        <span>Technically advanced (TAA)</span>
        <select className="input" value={taa} onChange={(e) => setTaa(e.target.value)}>
          <option value="">As its type</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea
          className="input textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {error ? (
        <p className="typed-error" role="alert">
          {error}
        </p>
      ) : null}
      <FormActions onCancel={onCancel} onReset={edited ? onReset : undefined} />
    </form>
  );
}

/** Pastes a fleet conversion list: each tail changes to one type from its date. */
export function ConversionForm({
  logbook,
  typeIds,
  edits,
  onSave,
  onCancel,
}: {
  logbook: Logbook;
  typeIds: readonly string[];
  edits: AircraftEdits;
  onSave: (next: AircraftEdits) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [typeId, setTypeId] = useState(
    typeIds.includes('CRJ-550') ? 'CRJ-550' : (typeIds[0] ?? ''),
  );
  const parsed = useMemo(() => parseConversionList(text), [text]);
  const frames = new Map(
    logbook.airframes.flatMap((f) => f.registrations.map((r) => [r.value, f] as const)),
  );
  const found = parsed.rows.filter((r) => frames.has(r.tail));
  const unknown = parsed.rows.filter((r) => !frames.has(r.tail));
  const moved = found.reduce(
    (n, r) =>
      n +
      logbook.entries.filter(
        (e) => e.airframeId === frames.get(r.tail)!.id && e.kind === 'flight' && e.date >= r.from,
      ).length,
    0,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const airframes = { ...edits.airframes };
    for (const r of found) {
      const frame = frames.get(r.tail)!;
      airframes[frame.id] = {
        ...airframes[frame.id],
        configurations: withTypeFrom(frame.configurations, typeId, r.from),
      };
    }
    onSave({ ...edits, airframes });
  };

  return (
    <form className="edit-form" onSubmit={submit} aria-label="Record a fleet conversion">
      <p className="lede">
        Paste one aircraft per line: its tail and the date it was converted, for example
        <code> N701SK 2025-03-10</code>.
      </p>
      <label className="field">
        <span>Converted to</span>
        <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {typeIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Aircraft and dates</span>
        <textarea
          className="input textarea textarea--tall"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p role="status">
        {formatInt(found.length)} {found.length === 1 ? 'aircraft' : 'aircraft'} found;{' '}
        {formatInt(moved)} {moved === 1 ? 'flight moves' : 'flights move'} to {typeId}.
      </p>
      {unknown.length + parsed.rejected.length > 0 ? (
        <p className="muted">
          Not used:{' '}
          {[
            ...unknown.map((r) => `${r.tail} (not in this book)`),
            ...parsed.rejected.map((l) => `“${l}”`),
          ].join(', ')}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={found.length === 0}>
          Save {formatInt(found.length)}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
