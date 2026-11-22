import { formatFlightNumber } from '../importers/normalize/flightNumber';
import type { Entry } from '../model';
import type { EntryFilter, LogbookIndex } from './types';

const hasAny = <T>(list: readonly T[] | undefined): list is readonly T[] =>
  list !== undefined && list.length > 0;

const words = (text: string | undefined): string[] =>
  (text ?? '').toLowerCase().split(/\s+/).filter(Boolean);

/** True when the filter would keep every non-deleted entry. */
export function isEmptyFilter(filter: EntryFilter): boolean {
  return (
    words(filter.text).length === 0 &&
    !filter.dateFrom &&
    !filter.dateTo &&
    !hasAny(filter.rules) &&
    !hasAny(filter.kinds) &&
    !hasAny(filter.typeIds) &&
    !hasAny(filter.seats) &&
    !filter.onlyFlagged
  );
}

function searchText(entry: Entry, index: LogbookIndex): string {
  const type = index.typeOf(entry);
  return [
    index.tailOf(entry),
    entry.from,
    entry.to,
    entry.route,
    entry.flightNumber,
    // Found whether the query is typed `DL3939` or `DL 3939`.
    entry.flightNumber && formatFlightNumber(entry.flightNumber, 'spaced'),
    type?.id,
    type?.model,
    ...entry.crew.map((c) => index.person(c.personId)?.name),
    entry.remarks,
  ]
    .filter((s): s is string => !!s)
    .join(' ')
    .toLowerCase();
}

/** Entries matching every part of `filter`, in input order. Deleted entries never match. */
export function filterEntries(
  entries: readonly Entry[],
  filter: EntryFilter,
  index: LogbookIndex,
  flagged?: ReadonlySet<string>,
): Entry[] {
  const needles = words(filter.text);
  const { dateFrom, dateTo, rules, kinds, typeIds, aircraftIds, seats, onlyFlagged } = filter;

  return entries.filter((entry) => {
    if (entry.deletedAt !== undefined) return false;
    if (hasAny(kinds) && !kinds.includes(entry.kind)) return false;
    if (hasAny(rules) && !rules.includes(entry.rule)) return false;
    if (hasAny(seats) && (entry.seat === undefined || !seats.includes(entry.seat))) return false;
    if (dateFrom || dateTo) {
      if (entry.date === '') return false;
      if (dateFrom && entry.date < dateFrom) return false;
      if (dateTo && entry.date > dateTo) return false;
    }
    if (onlyFlagged && !(flagged?.has(entry.id) ?? false)) return false;
    if (hasAny(aircraftIds)) {
      const id = entry.airframeId ?? entry.deviceId;
      if (id === undefined || !aircraftIds.includes(id)) return false;
    }
    if (hasAny(typeIds)) {
      const id = index.typeOf(entry)?.id;
      if (id === undefined || !typeIds.includes(id)) return false;
    }
    if (needles.length > 0) {
      const haystack = searchText(entry, index);
      if (!needles.every((w) => haystack.includes(w))) return false;
    }
    return true;
  });
}
