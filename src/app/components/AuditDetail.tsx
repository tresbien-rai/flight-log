import { useState, type FormEvent } from 'react';
import type { PairCandidate } from '../lib/audit';
import type {
  DecisionField,
  FieldChoice,
  ResolvedField,
  ResolvedOrphan,
  ResolvedPair,
} from '@core/reconcile';
import type { OperatingRule } from '@core/model';
import type { RuleStatus } from '@core/reconcile';
import {
  displayTyped,
  displayValue,
  isShown,
  RULE_TEXT,
  suggestionText,
  fieldLabel,
  parseTyped,
  routeText,
  SIDE_LABEL,
  tierText,
  TYPED_HINT,
  typedKind,
} from '../lib/audit';
import type { DisplayPrefs } from '../lib/prefs';
import { longDate } from '../lib/format';

export interface DetailActions {
  setField: (pair: ResolvedPair, field: DecisionField, choice: FieldChoice | undefined) => void;
  setMatch: (pair: ResolvedPair, match: 'confirmed' | 'rejected' | null) => void;
  setOrphan: (orphan: ResolvedOrphan, action: 'keep' | 'drop' | undefined) => void;
  setRule: (rule: OperatingRule | undefined) => void;
  /** Pairs a one-app-only entry with a row from the other app. */
  pairWith: (orphan: ResolvedOrphan, candidate: PairCandidate) => void;
  /** Undoes a pairing made by hand. */
  unpair: (pair: ResolvedPair) => void;
  /** Present when this orphan came from a pairing the pilot rejected. */
  undoReject?: (orphan: ResolvedOrphan) => void;
}

const BY_TEXT: Record<ResolvedField['by'], string> = {
  undecided: 'Open',
  pair: 'Your choice',
  bulk: 'Settled by a rule',
  equivalent: 'Same meaning',
  automatic: 'Settled automatically',
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
  prefs,
}: {
  pair: ResolvedPair;
  field: ResolvedField;
  actions: DetailActions;
  prefs: DisplayPrefs;
}) {
  const name = fieldLabel(field.field);
  const choice = field.choice;
  const typed = typeof choice === 'object' ? choice.value : undefined;
  const canBoth = field.field === 'people' || field.field === 'remarks';
  const options: { value: 'a' | 'b' | 'both'; label: string; text: string }[] = [
    { value: 'a', label: SIDE_LABEL.a, text: displayValue(pair.a, field.field, prefs) },
    { value: 'b', label: SIDE_LABEL.b, text: displayValue(pair.b, field.field, prefs) },
  ];
  if (canBoth) options.push({ value: 'both', label: 'Both', text: 'Keep what each app has' });

  return (
    <fieldset className={`choice choice--${field.by}`}>
      <legend className="choice-legend">
        <span className="choice-name">{name}</span>
        <span className="choice-by">{BY_TEXT[field.by]}</span>
      </legend>
      {field.suggested ? (
        <p className="choice-suggestion">
          Suggested: {SIDE_LABEL[field.suggested.side]}. {suggestionText(field.suggested.reason)}
        </p>
      ) : null}
      <div className="choice-options">
        {options.map((option) => (
          <label key={option.value} className="choice-option">
            <input
              type="radio"
              name={`${pair.entryId}:${field.field}`}
              checked={choice === option.value}
              onChange={() => actions.setField(pair, field.field, option.value)}
            />
            <span className="choice-side">
              {option.label}
              {field.suggested?.side === option.value ? (
                <span className="choice-badge">Suggested</span>
              ) : null}
            </span>
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

const PICKER_PAGE = 8;

function PairPicker({
  orphan,
  candidates,
  onPick,
}: {
  orphan: ResolvedOrphan;
  candidates: readonly PairCandidate[];
  onPick: (candidate: PairCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PICKER_PAGE);
  const other = SIDE_LABEL[orphan.side === 'a' ? 'b' : 'a'];
  if (candidates.length === 0) return null;
  if (!open) {
    return (
      <div className="actions">
        <button type="button" className="btn btn-link" onClick={() => setOpen(true)}>
          It is the same flight as an entry in {other}…
        </button>
      </div>
    );
  }
  return (
    <div className="pair-picker">
      <p id={`picker-${orphan.fingerprint}`} className="choice-name">
        Pair with an entry in {other}
      </p>
      <ul className="pair-candidates" aria-labelledby={`picker-${orphan.fingerprint}`}>
        {candidates.slice(0, limit).map((c) => (
          <li key={c.fingerprint}>
            <button type="button" className="pair-candidate" onClick={() => onPick(c)}>
              <span className="pair-candidate-main">
                {c.record.date} · {c.record.tail ?? 'no aircraft'} · {routeText(c.record)}
                {c.record.durations.total
                  ? ` · ${displayTyped('durations.total', c.record.durations.total)} h`
                  : c.record.durations.simulator
                    ? ` · ${displayTyped('durations.simulator', c.record.durations.simulator)} h`
                    : ''}
              </span>
              <span className="pair-candidate-note">
                {c.daysApart === 0
                  ? 'Same day'
                  : `${c.daysApart} ${c.daysApart === 1 ? 'day' : 'days'} apart`}
                {c.pairedWith
                  ? ' · now paired with another entry; that one becomes one-app-only'
                  : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="actions">
        {candidates.length > limit ? (
          <button type="button" className="btn" onClick={() => setLimit(limit + PICKER_PAGE)}>
            Show more
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AuditDetail({
  pair,
  orphan,
  actions,
  onClose,
  sheet,
  prefs,
  rule,
  candidates,
}: {
  pair?: ResolvedPair;
  orphan?: ResolvedOrphan;
  actions: DetailActions;
  onClose: () => void;
  sheet: boolean;
  prefs: DisplayPrefs;
  /** Where this entry's operating rule comes from. */
  rule: RuleStatus;
  /** For a one-app-only entry: rows it could be paired with. */
  candidates?: readonly PairCandidate[];
}) {
  const merged = pair?.record ?? orphan!.record;
  const record = pair?.a ?? orphan!.record;
  const live = pair?.fields.filter(isShown) ?? [];
  const automatic = pair?.fields.filter((f) => f.by === 'automatic' && !isShown(f)) ?? [];
  const same = (pair?.fields.length ?? 0) - live.length - automatic.length;

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

          {pair && pair.tier === 'manual' ? (
            <section className="match-box" aria-label="Pairing">
              <p>You paired these two rows by hand.</p>
              <dl className="detail-rows">
                <Summary record={pair.a} label={SIDE_LABEL.a} />
                <Summary record={pair.b} label={SIDE_LABEL.b} />
              </dl>
              <div className="actions">
                <button type="button" className="btn" onClick={() => actions.unpair(pair)}>
                  Unpair
                </button>
              </div>
            </section>
          ) : null}

          {pair && pair.tier !== 'exact' && pair.tier !== 'manual' ? (
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
                  prefs={prefs}
                />
              ))}
              {automatic.length > 0 ? (
                <p className="detail-note">
                  Settled automatically: {automatic.map((f) => fieldLabel(f.field)).join(', ')}
                  {automatic.every((f) => f.pattern === 'rounding')
                    ? ' (the more precise value is kept).'
                    : '.'}
                </p>
              ) : null}
              {same > 0 ? (
                <p className="detail-note">
                  {same} more {same === 1 ? 'field is' : 'fields are'} written differently but mean
                  the same.
                </p>
              ) : null}
            </section>
          ) : null}

          {rule === 'open' || rule === 'decided' ? (
            <section aria-label="Operating rule" className="rule-pick">
              <label htmlFor="entry-rule" className="choice-name">
                Operating rule
              </label>
              <span className={`choice-by${rule === 'open' ? ' is-open' : ''}`}>
                {rule === 'open' ? 'Neither app says · counts as Part 91' : 'Your choice'}
              </span>
              <select
                id="entry-rule"
                className="input"
                value={rule === 'decided' ? (merged.rule ?? '') : ''}
                onChange={(event) =>
                  actions.setRule(
                    event.target.value === '' ? undefined : (event.target.value as OperatingRule),
                  )
                }
              >
                <option value="">Not marked</option>
                {(['91', '121', '135', 'other'] as const).map((r) => (
                  <option key={r} value={r}>
                    {RULE_TEXT[r]}
                  </option>
                ))}
              </select>
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
              <PairPicker
                orphan={orphan}
                candidates={candidates ?? []}
                onPick={(c) => actions.pairWith(orphan, c)}
              />
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
