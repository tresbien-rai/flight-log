import { describe, expect, it } from 'vitest';
import { makeEntry } from '../validation/testing';
import { byMonth, byYear, groupEntries } from './group';

const ids = (list: { id: string }[] | undefined) => list?.map((e) => e.id);

describe('groupEntries', () => {
  const entries = [
    makeEntry({ id: 'a', date: '2025-03-01' }),
    makeEntry({ id: 'b', date: '2024-12-31' }),
    makeEntry({ id: 'c', date: '' }),
    makeEntry({ id: 'd', date: '2025-03-15' }),
  ];

  it('groups in order of first appearance, preserving entry order', () => {
    const g = groupEntries(entries, byYear);
    expect([...g.keys()]).toEqual(['2025', '2024']);
    expect(ids(g.get('2025'))).toEqual(['a', 'd']);
    expect(ids(g.get('2024'))).toEqual(['b']);
  });

  it('skips entries with an undefined key', () => {
    const g = groupEntries(entries, byMonth);
    expect([...g.keys()]).toEqual(['2025-03', '2024-12']);
    expect([...g.values()].flat()).toHaveLength(3);
  });

  it('supports custom key functions and empty input', () => {
    expect(groupEntries([], byYear).size).toBe(0);
    const g = groupEntries(entries, (e) => (e.id < 'c' ? 'early' : undefined));
    expect(ids(g.get('early'))).toEqual(['a', 'b']);
  });
});

describe('byYear / byMonth', () => {
  it('derive keys from the date', () => {
    expect(byYear(makeEntry({ date: '2025-06-22' }))).toBe('2025');
    expect(byMonth(makeEntry({ date: '2025-06-22' }))).toBe('2025-06');
  });
  it('are undefined for an empty date', () => {
    expect(byYear(makeEntry({ date: '' }))).toBeUndefined();
    expect(byMonth(makeEntry({ date: '' }))).toBeUndefined();
  });
});
