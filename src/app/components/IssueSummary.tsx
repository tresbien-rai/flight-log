import { formatInt } from '../lib/format';

export interface SummaryItem {
  code: string;
  message: string;
  line?: number;
  severity?: string;
}

const SHOWN = 5;

/** Counts of issues by code, most frequent first; each code expands to its first few messages. */
export function IssueSummary({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: readonly SummaryItem[];
  emptyText: string;
}) {
  const groups = new Map<string, SummaryItem[]>();
  for (const item of items) {
    const list = groups.get(item.code);
    if (list) list.push(item);
    else groups.set(item.code, [item]);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <section className="issues" aria-label={title}>
      <h3 className="issues-title">
        {title}
        {items.length > 0 ? <span className="muted"> ({formatInt(items.length)})</span> : null}
      </h3>
      {ordered.length === 0 ? <p className="muted">{emptyText}</p> : null}
      {ordered.map(([code, list]) => (
        <details key={code} className="issue-group">
          <summary>
            <span className="issue-code">{code}</span>
            <span className="issue-count">{formatInt(list.length)}</span>
          </summary>
          <ul className="issue-messages">
            {list.slice(0, SHOWN).map((item, i) => (
              <li key={i}>
                {item.line !== undefined ? <span className="muted">Row {item.line}: </span> : null}
                {item.severity ? <span className="muted">{item.severity}. </span> : null}
                {item.message}
              </li>
            ))}
          </ul>
          {list.length > SHOWN ? (
            <p className="muted issue-more">and {formatInt(list.length - SHOWN)} more</p>
          ) : null}
        </details>
      ))}
    </section>
  );
}
