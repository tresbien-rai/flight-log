import { ALL_RULES, type Finding, type Severity } from '@core/validation';

const RANK: Record<Severity, number> = { error: 3, warning: 2, note: 1 };

export const SEVERITY_WORD: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  note: 'Note',
};

/** One symbol per severity so colour is never the only signal. */
export const SEVERITY_SYMBOL: Record<Severity, string> = {
  error: '×',
  warning: '!',
  note: 'i',
};

export function worstSeverity(findings: readonly Finding[] | undefined): Severity | undefined {
  let worst: Severity | undefined;
  for (const f of findings ?? []) {
    if (worst === undefined || RANK[f.severity] > RANK[worst]) worst = f.severity;
  }
  return worst;
}

/** Findings grouped by every entry they name. */
export function findingsByEntry(findings: readonly Finding[]): Map<string, Finding[]> {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    for (const id of f.entryIds) {
      const list = map.get(id);
      if (list) list.push(f);
      else map.set(id, [f]);
    }
  }
  return map;
}

const TITLES = new Map(ALL_RULES.map((r) => [r.id, r.title]));

export function ruleTitle(ruleId: string): string {
  return TITLES.get(ruleId) ?? ruleId;
}

/** Findings most severe first, otherwise in the order given. */
export function bySeverity(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}
