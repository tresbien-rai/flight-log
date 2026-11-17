import type { Entry } from '../model';

/** Groups entries by key, in order of first appearance. Entries with an undefined key are skipped. */
export function groupEntries<K extends string>(
  entries: readonly Entry[],
  keyOf: (entry: Entry) => K | undefined,
): Map<K, Entry[]> {
  const groups = new Map<K, Entry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (key === undefined) continue;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

/** `YYYY`, or undefined when the entry has no date. */
export function byYear(entry: Entry): string | undefined {
  return entry.date === '' ? undefined : entry.date.slice(0, 4);
}

/** `YYYY-MM`, or undefined when the entry has no date. */
export function byMonth(entry: Entry): string | undefined {
  return entry.date === '' ? undefined : entry.date.slice(0, 7);
}
