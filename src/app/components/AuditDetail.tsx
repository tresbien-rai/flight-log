import { useState, type FormEvent } from 'react';
import type {
  DecisionField,
  FieldChoice,
  ResolvedField,
  ResolvedOrphan,
  ResolvedPair,
} from '@core/reconcile';
import type { NameOrder } from '@core/importers';
import {
  displayTyped,
  displayValue,
  fieldLabel,
  parseTyped,
  routeText,
  SIDE_LABEL,
  tierText,
  TYPED_HINT,
  typedKind,
} from '../lib/audit';
import { longDate } from '../lib/format';

export interface DetailActions {
  setField: (pair: ResolvedPair, field: DecisionField, choice: FieldChoice | undefined) => void;
  setMatch: (pair: ResolvedPair, match: 'confirmed' | 'rejected' | null) => void;
  setOrphan: (orphan: ResolvedOrphan, action: 'keep' | 'drop' | undefined) => void;
  /** Present when this orphan came from a pairing the pilot rejected. */
  undoReject?: (orphan: ResolvedOrphan) => void;
}

const BY_TEXT: Record<ResolvedField['by'], string> = {
  undecided: 'Open',
  pair: 'Your choice',
  bulk: 'Settled by a rule',
  equivalent: 'Same meaning',
};

function TypedInput({
  field,
  current,
  onUse,
}: {
  field: DecisionField;
  current: string;
  onUse: (value: string | number) => void;
}) {
  const kind = typedKind(field)!;
  const [text, setText] = useState(current);
  const [invalid, setInvalid] = useState(false);
  const id = `typed-${field}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = parseTyped(field, text);
    if (value === undefined) setInvalid(true);
    else onUse(value);
  };
  return (
    <form className="typed" onSubmit={submit}>
      <label htmlFor={id} className="typed-label">
        Something else
      </label>
      <input
        id={id}
        className="input"
        value={text}
        placeholder={TYPED_HINT[kind]}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
      />
      <button type="submit" className="btn">
        Use
      </button>
      {invalid ? (
        <p id={`${id}-error`} className="typed-error" role="alert">
          {TYPED_HINT[kind]}.
        </p>
      ) : null}
    </form>
  );
}

function FieldCard({
  pair,
  field,
  actions,
  nameOrder,
}: {
  pair: ResolvedPair;
  field: ResolvedField;
  actions: DetailActions;
  nameOrder: NameOrder;
}) {
  const name = fieldLabel(field.field);
  const choice = field.choice;
  const typed = typeof choice === 'object' ? choice.value : undefined;
  const canBoth = field.field === 'people' || field.field === 'remarks';
  const options: { value: 'a' | 'b' | 'both'; label: string; text: string }[] = [
    { value: 'a', label: SIDE_LABEL.a, text: displayValue(pair.a, field.field, nameOrder) },
    { value: 'b', label: SIDE_LABEL.b, text: displayValue(pair.b, field.field, nameOrder) },
  ];
  if (canBoth) options.push({ value: 'both', label: 'Both', text: 'Keep what each app has' });

  return (
    <fieldset className={`choice choice--${field.by}`}>
      <legend className="choice-legend">
        <span className="choice-name">{name}</span>
        <span className="choice-by">{BY_TEXT[field.by]}</span>
      </legend>
      <div className="choice-options">
        {options.map((option) => (
          <label key={option.value} className="choice-option">
            <input
              type="radio"
              name={`${pair.entryId}:${field.field}`}
              checked={choice === option.value}
              onChange={() => actions.setField(pair, field.field, option.value)}
            />
            <span className="choice-side">{option.label}</span>
            <span className="choice-value">{option.text}</span>
          </label>
        ))}
        {typed !== undefined ? (
          <p className="choice-typed">
            <span className="choice-side">Typed</span>
            <span className="choice-value">{displayTyped(field.field, typed)}</span>
          </p>
        ) : null}
      </div>
      {typedKind(field.field) ? (
        <TypedInput
          key={String(typed ?? '')}
          field={field.field}
          current={typed === undefined ? '' : displayTyped(field.field, typed).replace(/Z$/, '')}
          onUse={(value) => actions.setField(pair, field.field, { value })}
        />
      ) : null}
      {field.by === 'pair' ? (
        <button
          type="button"
          className="btn btn-link choice-clear"
          onClick={() => actions.setField(pair, field.field, undefined)}
          aria-label={`Clear my choice for ${name}`}
        >
          Clear my choice
        </button>
      ) : null}
    </fieldset>
  );
}

function Summary({ record, label }: { record: ResolvedPair['a']; label: string }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>
        {record.date} · {record.tail ?? 'no aircraft'} · {routeText(record)}
        {record.durations.total
          ? ` · ${displayTyped('durations.total', record.durations.total)} h`
          : ''}
      </dd>
    </div>
  );
}

export function AuditDetail({
  pair,
  orphan,
  actions,
  onClose,
  sheet,
  nameOrder,
}: {
  pair?: ResolvedPair;
  orphan?: ResolvedOrphan;
  actions: DetailActions;
  onClose: () => void;
  sheet: boolean;
  nameOrder: NameOrder;
}) {
  const record = pair?.a ?? orphan!.record;
  const live = pair?.fields.filter((f) => f.class !== 'equivalent' || f.by === 'pair') ?? [];
  const same = (pair?.fields.length ?? 0) - live.length;

  return (
    <aside className="detail" aria-label="Audit detail">
      <div className="detail-bar">
        <button type="button" className="btn" onClick={onClose}>
          {sheet ? 'Back to list' : 'Close'}
        </button>
      </div>
      <div className="detail-scroll">
        <div className="detail-inner audit-detail">
          <header>
            <h2 className="detail-title">{longDate(record.date)}</h2>
            <p className="detail-sub">
              {record.tail ?? 'No aircraft'} · {routeText(record)}
            </p>
          </header>

          {pair && pair.tier !== 'exact' ? (
            <section className={`match-box match-box--${pair.match}`} aria-label="Pairing">
              <p>
                {pair.match === 'unconfirmed'
                  ? `These two rows were paired despite ${tierText(pair.tier)}. Are they the same flight?`
                  : `Paired despite ${tierText(pair.tier)}; you confirmed it is one flight.`}
              </p>
              <dl className="detail-rows">
                <Summary record={pair.a} label={SIDE_LABEL.a} />
                <Summary record={pair.b} label={SIDE_LABEL.b} />
              </dl>
              <div className="actions">
                {pair.match === 'unconfirmed' ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => actions.setMatch(pair, 'confirmed')}
                  >
                    Same flight
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => actions.setMatch(pair, null)}
                  >
                    Undo confirmation
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={() => actions.setMatch(pair, 'rejected')}
                >
                  Different flights
                </button>
              </div>
            </section>
          ) : null}

          {pair ? (
            <section aria-label="Differences" className="choices">
              {live.length === 0 ? (
                <p className="muted">The two apps agree on this flight.</p>
              ) : null}
              {live.map((field) => (
                <FieldCard
                  key={field.field}
                  pair={pair}
                  field={field}
                  actions={actions}
                  nameOrder={nameOrder}
                />
              ))}
              {same > 0 ? (
                <p className="detail-note">
                  {same} more {same === 1 ? 'field is' : 'fields are'} written differently but mean
                  the same.
                </p>
              ) : null}
            </section>
          ) : null}

          {orphan ? (
            <section aria-label="One app only" className="match-box">
              <p>
                This entry is only in {SIDE_LABEL[orphan.side]}.{' '}
                {orphan.action === 'undecided'
                  ? 'Should it be in your logbook?'
                  : orphan.action === 'keep'
                    ? 'You chose to keep it.'
                    : 'You chose to leave it out.'}
              </p>
              <dl className="detail-rows">
                <Summary record={orphan.record} label={SIDE_LABEL[orphan.side]} />
                {orphan.record.durations.simulator ? (
                  <div className="detail-row">
                    <dt>Simulator</dt>
                    <dd>
                      {displayTyped('durations.simulator', orphan.record.durations.simulator)} h
                    </dd>
                  </div>
                ) : null}
                {orphan.record.remarks ? (
                  <div className="detail-row">
                    <dt>Remarks</dt>
                    <dd>{orphan.record.remarks}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={orphan.action === 'keep'}
                  onClick={() =>
                    actions.setOrphan(orphan, orphan.action === 'keep' ? undefined : 'keep')
                  }
                >
                  Keep it
                </button>
                <button
                  type="button"
                  className="btn btn-toggle"
                  aria-pressed={orphan.action === 'drop'}
                  onClick={() =>
                    actions.setOrphan(orphan, orphan.action === 'drop' ? undefined : 'drop')
                  }
                >
                  Leave it out
                </button>
                {actions.undoReject ? (
                  <button type="button" className="btn" onClick={() => actions.undoReject!(orphan)}>
                    Pair it again
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
