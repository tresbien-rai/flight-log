import { describe, expect, it } from 'vitest';
import { makeEntry } from '../validation/testing';
import { sortEntries } from './sort';

const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('sortEntries', () => {
  it('orders by date and does not mutate the input', () => {
    const input = [
      makeEntry({ id: 'b', date: '2025-02-01' }),
      makeEntry({ id: 'a', date: '2025-01-01' }),
      makeEntry({ id: 'c', date: '2025-03-01' }),
    ];
    const copy = [...input];
    const out = sortEntries(input, 'oldest');
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
    expect(ids(sortEntries(input, 'newest'))).toEqual(['c', 'b', 'a']);
  });

  it('orders same-date entries by out, with out-less entries after, in input order', () => {
    const input = [
      makeEntry({ id: 'z2', date: '2025-01-01' }),
      makeEntry({ id: 'late', date: '2025-01-01', out: '2025-01-01T15:00Z' }),
      makeEntry({ id: 'z1', date: '2025-01-01' }),
      makeEntry({ id: 'early', date: '2025-01-01', out: '2025-01-01T08:00Z' }),
    ];
    expect(ids(sortEntries(input, 'oldest'))).toEqual(['early', 'late', 'z2', 'z1']);
  });

  it('breaks out ties by id', () => {
    const input = [
      makeEntry({ id: 'b', out: '2025-06-22T10:00Z' }),
      makeEntry({ id: 'a', out: '2025-06-22T10:00Z' }),
    ];
    expect(ids(sortEntries(input, 'oldest'))).toEqual(['a', 'b']);
  });

  it('sorts a mixed date/out set consistently', () => {
    const input = [
      makeEntry({ id: 'n1', date: '2025-01-02' }),
      makeEntry({ id: 'o1', date: '2025-01-01', out: '2025-01-01T09:00Z' }),
      makeEntry({ id: 'n0', date: '2025-01-01' }),
    ];
    expect(ids(sortEntries(input, 'oldest'))).toEqual(['o1', 'n0', 'n1']);
  });

  it('newest is the exact reverse of oldest', () => {
    const input = [
      makeEntry({ id: 'x', date: '2025-01-01' }),
      makeEntry({ id: 'y', date: '2025-01-01' }),
      makeEntry({ id: 'q', date: '2025-01-01', out: '2025-01-01T01:00Z' }),
      makeEntry({ id: 'r', date: '2024-01-01' }),
    ];
    expect(ids(sortEntries(input, 'newest'))).toEqual(ids(sortEntries(input, 'oldest')).reverse());
  });

  it('handles empty input', () => {
    expect(sortEntries([], 'newest')).toEqual([]);
  });
});
