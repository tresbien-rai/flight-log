import { describe, expect, it } from 'vitest';
import {
  clearedFilter,
  countActiveFilters,
  DEFAULT_FILTER,
  isFiltered,
  parseFilterState,
  serializeFilterState,
  toEntryFilter,
  type FilterState,
} from './filterState';

const parse = (query: string) => parseFilterState(new URLSearchParams(query));

describe('filter state in the URL', () => {
  it('reads an empty query as the default filter', () => {
    expect(parse('')).toEqual(DEFAULT_FILTER);
  });

  it('writes nothing for the default filter', () => {
    expect(serializeFilterState(DEFAULT_FILTER).toString()).toBe('');
  });

  it('round-trips a fully populated state', () => {
    const state: FilterState = {
      text: 'ZZ 1001 / OKC & more',
      rules: ['91', '121', 'other'],
      kinds: ['flight', 'simulator', 'ground'],
      typeIds: ['C172', 'CRJ-700'],
      aircraftIds: ['af:N1', 'dev:SIM'],
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      withFindings: true,
      fromReport: true,
      order: 'oldest',
    };
    expect(parse(serializeFilterState(state).toString())).toEqual(state);
  });

  it('round-trips each field on its own', () => {
    const cases: Partial<FilterState>[] = [
      { text: 'kxyz' },
      { rules: ['121'] },
      { kinds: ['ground'] },
      { typeIds: ['PA-28R-200'] },
      { dateFrom: '2020-02-29' },
      { dateTo: '2020-03-01' },
      { withFindings: true },
      { fromReport: true },
      { order: 'oldest' },
    ];
    for (const patch of cases) {
      const state = { ...DEFAULT_FILTER, ...patch };
      expect(parse(serializeFilterState(state).toString())).toEqual(state);
    }
  });

  it('keeps type ids that contain punctuation', () => {
    const state = { ...DEFAULT_FILTER, typeIds: ['A,B', 'C&D=E'] };
    expect(parse(serializeFilterState(state).toString())).toEqual({
      ...state,
      typeIds: ['A,B', 'C&D=E'],
    });
  });

  it('ignores unknown values and malformed dates', () => {
    const state = parse('rule=91&rule=77&kind=balloon&from=yesterday&to=2024-13&order=sideways');
    expect(state.rules).toEqual(['91']);
    expect(state.kinds).toEqual([]);
    expect(state.dateFrom).toBe('');
    expect(state.order).toBe('newest');
  });

  it('puts repeated values in a fixed order so equal states give equal URLs', () => {
    expect(serializeFilterState(parse('rule=other&rule=91')).toString()).toBe('rule=91&rule=other');
  });
});

describe('filter helpers', () => {
  it('counts each active filter once', () => {
    expect(countActiveFilters(DEFAULT_FILTER)).toBe(0);
    expect(
      countActiveFilters({
        ...DEFAULT_FILTER,
        text: 'a',
        rules: ['91', '121'],
        dateFrom: '2024-01-01',
        dateTo: '2024-02-01',
      }),
    ).toBe(3);
  });

  it('does not count the sort order as a filter', () => {
    expect(isFiltered({ ...DEFAULT_FILTER, order: 'oldest' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTER, text: '  ' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTER, withFindings: true })).toBe(true);
    expect(isFiltered({ ...DEFAULT_FILTER, fromReport: true })).toBe(true);
  });

  it('clears filters but keeps the sort order', () => {
    const cleared = clearedFilter({
      ...DEFAULT_FILTER,
      text: 'a',
      withFindings: true,
      order: 'oldest',
    });
    expect(cleared).toEqual({ ...DEFAULT_FILTER, order: 'oldest' });
  });

  it('maps "other" to every rule that is not 91 or 121', () => {
    const filter = toEntryFilter({ ...DEFAULT_FILTER, rules: ['121', 'other'] });
    expect(filter.rules).toEqual(['121', '135', 'other']);
  });

  it('turns empty date strings into absent bounds', () => {
    const filter = toEntryFilter({ ...DEFAULT_FILTER, dateFrom: '2024-01-01' });
    expect(filter.dateFrom).toBe('2024-01-01');
    expect(filter.dateTo).toBeUndefined();
  });
});
