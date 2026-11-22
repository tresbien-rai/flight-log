/**
 * The logbook filter as it lives in the URL query string. Pure functions only:
 * `parseFilterState(serializeFilterState(s))` gives back `s` for any valid state.
 */
import type { EntryFilter, SortOrder } from '@core/query';
import type { EntryKind, OperatingRule } from '@core/model';

/** The rule toggles shown on screen. "other" covers every rule that is not 91 or 121. */
export type RuleKey = '91' | '121' | 'other';

export interface FilterState {
  text: string;
  rules: RuleKey[];
  kinds: EntryKind[];
  typeIds: string[];
  /** Airframe or device ids, set by following a link from the aircraft screen. */
  aircraftIds: string[];
  /** `YYYY-MM-DD` or empty. */
  dateFrom: string;
  dateTo: string;
  withFindings: boolean;
  order: SortOrder;
}

export const RULE_KEYS: readonly RuleKey[] = ['91', '121', 'other'];
export const KINDS: readonly EntryKind[] = ['flight', 'simulator', 'ground'];

export const DEFAULT_FILTER: FilterState = {
  text: '',
  rules: [],
  kinds: [],
  typeIds: [],
  aircraftIds: [],
  dateFrom: '',
  dateTo: '',
  withFindings: false,
  order: 'newest',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Keeps only known values, de-duplicated, in canonical order. */
function pick<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return allowed.filter((a) => values.includes(a));
}

export function parseFilterState(params: URLSearchParams): FilterState {
  const date = (key: string) => {
    const v = params.get(key) ?? '';
    return DATE.test(v) ? v : '';
  };
  return {
    text: params.get('q') ?? '',
    rules: pick(params.getAll('rule'), RULE_KEYS),
    kinds: pick(params.getAll('kind'), KINDS),
    typeIds: [...new Set(params.getAll('type').filter((t) => t !== ''))].sort(),
    aircraftIds: [...new Set(params.getAll('aircraft').filter((t) => t !== ''))].sort(),
    dateFrom: date('from'),
    dateTo: date('to'),
    withFindings: params.get('findings') === '1',
    order: params.get('order') === 'oldest' ? 'oldest' : 'newest',
  };
}

/** Only non-default values are written, so a clean URL means an unfiltered logbook. */
export function serializeFilterState(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.text !== '') params.set('q', state.text);
  for (const r of state.rules) params.append('rule', r);
  for (const k of state.kinds) params.append('kind', k);
  for (const t of state.typeIds) params.append('type', t);
  for (const a of state.aircraftIds) params.append('aircraft', a);
  if (state.dateFrom !== '') params.set('from', state.dateFrom);
  if (state.dateTo !== '') params.set('to', state.dateTo);
  if (state.withFindings) params.set('findings', '1');
  if (state.order === 'oldest') params.set('order', 'oldest');
  return params;
}

/** How many separate filters are on (text, rule, kind, type, aircraft, dates, findings). */
export function countActiveFilters(state: FilterState): number {
  return [
    state.text.trim() !== '',
    state.rules.length > 0,
    state.kinds.length > 0,
    state.typeIds.length > 0,
    state.aircraftIds.length > 0,
    state.dateFrom !== '' || state.dateTo !== '',
    state.withFindings,
  ].filter(Boolean).length;
}

/** True when any narrowing filter is on. The sort order is not a filter. */
export function isFiltered(state: FilterState): boolean {
  return countActiveFilters(state) > 0;
}

/** Everything cleared; the sort order is kept. */
export function clearedFilter(state: FilterState): FilterState {
  return { ...DEFAULT_FILTER, order: state.order };
}

const RULE_VALUES: Record<RuleKey, OperatingRule[]> = {
  '91': ['91'],
  '121': ['121'],
  other: ['135', 'other'],
};

/** The core filter for this state. `onlyFlagged` is applied with the set of flagged ids. */
export function toEntryFilter(state: FilterState): EntryFilter {
  return {
    text: state.text,
    dateFrom: state.dateFrom || undefined,
    dateTo: state.dateTo || undefined,
    rules: state.rules.flatMap((r) => RULE_VALUES[r]),
    kinds: state.kinds,
    typeIds: state.typeIds,
    aircraftIds: state.aircraftIds,
    onlyFlagged: state.withFindings,
  };
}
