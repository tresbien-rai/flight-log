import { formatName, parseName, type NameOrder } from '@core/importers';
import type { Person } from '@core/model';

/** A person's name in the chosen order. Records stored before names were split are parsed. */
export function personName(person: Person, order: NameOrder): string {
  const parts =
    person.familyName !== undefined || person.givenName !== undefined
      ? { given: person.givenName ?? '', family: person.familyName ?? '' }
      : parseName(person.name);
  return formatName(parts, order) || person.name;
}

/** A name as an export wrote it, in the chosen order. */
export function writtenName(raw: string, order: NameOrder): string {
  return formatName(parseName(raw), order) || raw;
}
