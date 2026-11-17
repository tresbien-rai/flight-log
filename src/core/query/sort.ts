import type { Entry } from '../model';
import type { SortOrder } from './types';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Ascending: date, then `out` (entries without one follow, in input order), then id. */
function oldestFirst(a: Entry, b: Entry): number {
  if (a.date !== b.date) return cmp(a.date, b.date);
  if (a.out !== undefined && b.out !== undefined) {
    return a.out !== b.out ? cmp(a.out, b.out) : cmp(a.id, b.id);
  }
  if (a.out !== undefined) return -1;
  if (b.out !== undefined) return 1;
  return 0;
}

/** A new array sorted by date and time; 'newest' is the exact reverse of 'oldest'. */
export function sortEntries(entries: readonly Entry[], order: SortOrder): Entry[] {
  const sorted = [...entries].sort(oldestFirst);
  return order === 'newest' ? sorted.reverse() : sorted;
}
