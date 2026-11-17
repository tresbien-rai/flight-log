import type { Entry, Logbook } from '../model';
import { createContext } from './context';
import { instantMs } from './format';
import { ALL_RULES } from './rules';
import type { Finding, Rule, ValidateOptions } from './types';

/** Entries sorted by date, then `out`; entries without a usable `out` follow those with one. */
export function sortEntries(entries: readonly Entry[]): Entry[] {
  const keyed = entries.map((entry) => ({ entry, out: instantMs(entry.out) }));
  keyed.sort((a, b) => {
    if (a.entry.date !== b.entry.date) return a.entry.date < b.entry.date ? -1 : 1;
    if (a.out === undefined || b.out === undefined) {
      return a.out === b.out ? 0 : a.out === undefined ? 1 : -1;
    }
    return a.out - b.out;
  });
  return keyed.map((k) => k.entry);
}

function crashed(rule: Rule, error: unknown, entryIds: string[]): Finding {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    ruleId: 'rule-crashed',
    severity: 'error',
    entryIds,
    fields: [],
    message: `The rule "${rule.id}" failed to run (${reason}).`,
  };
}

/**
 * Runs every rule over the logbook. Deleted entries are skipped, disabled rules do not run,
 * findings the pilot has acknowledged on every entry they name are dropped, and a rule that
 * throws becomes a `rule-crashed` finding instead of breaking the run.
 */
export function validate(
  logbook: Logbook,
  options: ValidateOptions = {},
  rules: readonly Rule[] = ALL_RULES,
): Finding[] {
  const disabled = new Set(options.disabled ?? []);
  const ctx = createContext(logbook, options);
  const entries = sortEntries(logbook.entries.filter((e) => e.deletedAt === undefined));
  const byId = new Map<string, Entry>();
  for (const e of entries) if (!byId.has(e.id)) byId.set(e.id, e);

  const active = rules.filter((r) => !disabled.has(r.id));
  const found: Finding[] = [];

  for (const rule of active) {
    if (rule.scope === 'entry') {
      for (const entry of entries) {
        try {
          found.push(...rule.check(entry, ctx));
        } catch (error) {
          found.push(crashed(rule, error, [entry.id]));
        }
      }
    } else {
      try {
        found.push(...rule.check(entries, ctx));
      } catch (error) {
        found.push(crashed(rule, error, []));
      }
    }
  }

  const kept = found.filter((f) => {
    if (disabled.has(f.ruleId)) return false;
    if (f.entryIds.length === 0) return true;
    return !f.entryIds.every((id) => byId.get(id)?.acknowledged.includes(f.ruleId));
  });

  const keyed = kept.map((finding) => {
    const first = finding.entryIds[0];
    return {
      finding,
      id: first ?? '',
      date: first === undefined ? undefined : byId.get(first)?.date,
    };
  });
  keyed.sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === undefined) return 1;
      if (b.date === undefined) return -1;
      return a.date < b.date ? -1 : 1;
    }
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if (a.finding.ruleId !== b.finding.ruleId) return a.finding.ruleId < b.finding.ruleId ? -1 : 1;
    return 0;
  });
  return keyed.map((k) => k.finding);
}
