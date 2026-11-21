import { useState } from 'react';
import type { OperatingRule } from '@core/model';
import type { BulkChoice, DecisionField, DiffPattern, RuleProposal } from '@core/reconcile';
import type { Audit, BookInfo } from '@storage/index';
import {
  auditTotals,
  decidedRules,
  fieldLabel,
  findBulk,
  proposalReason,
  proposalTitle,
  ruleStats,
  RULE_TEXT,
  SIDE_LABEL,
} from '../lib/audit';
import { formatInt } from '../lib/format';

export interface OverviewActions {
  setBulk: (
    pattern: DiffPattern | 'real',
    field: DecisionField | undefined,
    choice: BulkChoice | undefined,
  ) => void;
  /** Gives those entries the rule; `undefined` takes the pilot's rule away again. */
  setRules: (entries: readonly string[], rule: OperatingRule | undefined) => void;
  showFlights: (proposal: RuleProposal) => void;
  removeStale: () => void;
  build: () => void;
  openMain: () => void;
}

/** Fields whose real differences may be settled by one rule: they never change a total. */
const FIELD_RULES: { field: DecisionField; both: boolean }[] = [
  { field: 'remarks', both: true },
  { field: 'people', both: true },
  { field: 'route', both: false },
];

const plural = (n: number, one: string, many: string) => `${formatInt(n)} ${n === 1 ? one : many}`;

const RULES: OperatingRule[] = ['91', '121', '135', 'other'];

function Proposal({ proposal, actions }: { proposal: RuleProposal; actions: OverviewActions }) {
  const [rule, setRule] = useState<OperatingRule>(proposal.rule);
  const title = proposalTitle(proposal);
  const id = `proposal-${proposal.id}`;
  return (
    <li className="rule">
      <div className="rule-text">
        <h3 className="rule-title">{title}</h3>
        <p className="muted">{proposalReason(proposal)}</p>
      </div>
      <div className="rule-state">
        <label htmlFor={id} className="visually-hidden">
          Operating rule for {title}
        </label>
        <select
          id={id}
          className="input"
          value={rule}
          onChange={(event) => setRule(event.target.value as OperatingRule)}
        >
          {RULES.map((r) => (
            <option key={r} value={r}>
              {RULE_TEXT[r]}
              {r === proposal.rule ? ' (suggested)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => actions.setRules(proposal.entries, rule)}
          aria-label={`Mark ${title} as ${RULE_TEXT[rule]}`}
        >
          Mark all
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => actions.showFlights(proposal)}
          aria-label={`Show ${title}`}
        >
          Show
        </button>
      </div>
    </li>
  );
}

export function AuditOverview({
  audit,
  proposals,
  main,
  building,
  canBuild,
  actions,
}: {
  audit: Audit;
  proposals: readonly RuleProposal[];
  main: BookInfo | undefined;
  building: boolean;
  canBuild: boolean;
  actions: OverviewActions;
}) {
  const { resolution, decisions } = audit;
  const { open } = resolution;
  const stats = ruleStats(resolution);
  const stat = (key: string) => stats.get(key) ?? { open: 0, settled: 0 };
  const totals = auditTotals(audit.a.records, audit.b.records, resolution);
  const openCount = open.fields + open.matches + open.orphans + resolution.openRules;
  const decided = [...decidedRules(resolution)].sort((x, y) => (x[0] < y[0] ? -1 : 1));

  const lastDecision = decisions.reduce(
    (latest, d) => (d.decidedAt > latest ? d.decidedAt : latest),
    '',
  );
  const outOfDate = main !== undefined && lastDecision > main.updatedAt;

  const rounding = findBulk(decisions, 'rounding');
  const roundingStat = stat('bulk:rounding:*');
  const blankOn = findBulk(decisions, 'missing-a') && findBulk(decisions, 'missing-b');
  const blankStat = {
    open: stat('bulk:missing-a:*').open + stat('bulk:missing-b:*').open,
    settled: stat('bulk:missing-a:*').settled + stat('bulk:missing-b:*').settled,
  };

  const toggle = (
    on: boolean,
    s: { open: number; settled: number },
    apply: () => void,
    remove: () => void,
    name: string,
  ) =>
    on ? (
      <div className="rule-state">
        <span className="rule-on">On · settles {formatInt(s.settled)}</span>
        <button type="button" className="btn" onClick={remove} aria-label={`Turn off: ${name}`}>
          Turn off
        </button>
      </div>
    ) : (
      <div className="rule-state">
        <button
          type="button"
          className="btn btn-primary"
          onClick={apply}
          disabled={s.open === 0}
          aria-label={`Apply: ${name}`}
        >
          Apply to {formatInt(s.open)}
        </button>
      </div>
    );

  return (
    <div className="audit-overview">
      <section aria-labelledby="audit-progress">
        <h2 id="audit-progress" className="detail-heading">
          Still to decide
        </h2>
        {openCount === 0 ? (
          <p role="status">Everything is decided.</p>
        ) : (
          <ul className="open-list" aria-labelledby="audit-progress">
            <li>
              <span className="num">{formatInt(open.fields)}</span> differences between the two apps
            </li>
            <li>
              <span className="num">{formatInt(open.matches)}</span> pairings to confirm
            </li>
            <li>
              <span className="num">{formatInt(open.orphans)}</span> entries that are in one app
              only
            </li>
            <li>
              <span className="num">{formatInt(resolution.openRules)}</span> flights without an
              operating rule
            </li>
          </ul>
        )}
      </section>

      <section aria-labelledby="audit-totals">
        <h2 id="audit-totals" className="detail-heading">
          Totals
        </h2>
        <table className="totals-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Measure</span>
              </th>
              <th scope="col">{SIDE_LABEL.a}</th>
              <th scope="col">{SIDE_LABEL.b}</th>
              <th scope="col">My logbook</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="num">{row.a}</td>
                <td className="num">{row.b}</td>
                <td className="num totals-merged">{row.merged}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {openCount > 0 ? (
          <p className="detail-note">
            My logbook uses {SIDE_LABEL.a}’s value wherever a difference is still open, and keeps
            one-app-only entries until you drop them.
          </p>
        ) : null}
      </section>

      {proposals.length > 0 || decided.length > 0 ? (
        <section aria-labelledby="audit-oprule">
          <h2 id="audit-oprule" className="detail-heading">
            Operating rule
          </h2>
          {proposals.length > 0 ? (
            <p className="detail-note">
              Neither app says which rule these flights were flown under. Until you mark them they
              count as Part 91.
            </p>
          ) : null}
          <ul className="rule-list">
            {proposals.map((proposal) => (
              <Proposal key={proposal.id} proposal={proposal} actions={actions} />
            ))}
            {decided.map(([rule, entries]) => (
              <li className="rule" key={rule}>
                <div className="rule-text">
                  <h3 className="rule-title">Marked {RULE_TEXT[rule] ?? rule} by you</h3>
                  <p className="muted">{plural(entries.length, 'flight', 'flights')}.</p>
                </div>
                <div className="rule-state">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => actions.setRules(entries, undefined)}
                    aria-label={`Undo marking ${plural(entries.length, 'flight', 'flights')} as ${RULE_TEXT[rule] ?? rule}`}
                  >
                    Undo
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="audit-rules">
        <h2 id="audit-rules" className="detail-heading">
          Rules for whole groups
        </h2>
        <p className="detail-note">
          A rule settles every difference of one kind at once. A choice you make on a single flight
          always wins over a rule.
        </p>
        <ul className="rule-list">
          <li className="rule">
            <div className="rule-text">
              <h3 className="rule-title">Rounding</h3>
              <p className="muted">
                {SIDE_LABEL.b} rounds each time to a tenth of an hour. Keep the more precise value.
              </p>
            </div>
            {toggle(
              rounding !== undefined,
              roundingStat,
              () => actions.setBulk('rounding', undefined, 'more-precise'),
              () => actions.setBulk('rounding', undefined, undefined),
              'Rounding',
            )}
          </li>
          <li className="rule">
            <div className="rule-text">
              <h3 className="rule-title">Blank in one app</h3>
              <p className="muted">
                One app has a value (or more crew, or longer remarks) and the other has nothing.
                Take what is there.
              </p>
            </div>
            {toggle(
              Boolean(blankOn),
              blankStat,
              () => {
                actions.setBulk('missing-a', undefined, 'present');
                actions.setBulk('missing-b', undefined, 'present');
              },
              () => {
                actions.setBulk('missing-a', undefined, undefined);
                actions.setBulk('missing-b', undefined, undefined);
              },
              'Blank in one app',
            )}
          </li>
          {FIELD_RULES.map(({ field, both }) => {
            const rule = findBulk(decisions, 'real', field);
            const s = stat(`bulk:real:${field}`);
            if (!rule && s.open === 0) return null;
            const id = `rule-${field}`;
            return (
              <li className="rule" key={field}>
                <div className="rule-text">
                  <h3 className="rule-title">
                    <label htmlFor={id}>{fieldLabel(field)} that differ</label>
                  </h3>
                  <p className="muted">
                    {rule
                      ? `Settles ${formatInt(s.settled)}.`
                      : `${plural(s.open, 'flight', 'flights')}. This never changes a total.`}
                  </p>
                </div>
                <div className="rule-state">
                  <select
                    id={id}
                    className="input"
                    value={rule?.choice ?? ''}
                    onChange={(event) =>
                      actions.setBulk(
                        'real',
                        field,
                        event.target.value === '' ? undefined : (event.target.value as BulkChoice),
                      )
                    }
                  >
                    <option value="">Decide each one</option>
                    <option value="a">Keep {SIDE_LABEL.a}’s</option>
                    <option value="b">Keep {SIDE_LABEL.b}’s</option>
                    {both ? <option value="both">Keep both</option> : null}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {resolution.stale.length > 0 ? (
        <section aria-labelledby="audit-stale">
          <h2 id="audit-stale" className="detail-heading">
            Earlier decisions that no longer apply
          </h2>
          <p>
            {plural(resolution.stale.length, 'decision was', 'decisions were')} made about rows that
            have since changed or gone from the exports. They do nothing now.
          </p>
          <div className="actions">
            <button type="button" className="btn" onClick={actions.removeStale}>
              Remove them
            </button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="audit-build">
        <h2 id="audit-build" className="detail-heading">
          My logbook
        </h2>
        {main ? (
          <p>
            Built with {plural(main.entryCount, 'entry', 'entries')}.
            {outOfDate ? ' Decisions have changed since then.' : ''}
          </p>
        ) : (
          <p>Not built yet.</p>
        )}
        {openCount > 0 ? (
          <p className="detail-note">
            You can build it now and again later; {plural(openCount, 'thing is', 'things are')}{' '}
            still open.
          </p>
        ) : null}
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={actions.build}
            disabled={building || !canBuild}
          >
            {building ? 'Building…' : main ? 'Rebuild my logbook' : 'Build my logbook'}
          </button>
          {main ? (
            <button type="button" className="btn" onClick={actions.openMain}>
              Open my logbook
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
