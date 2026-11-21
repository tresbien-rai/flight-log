/**
 * People's names. The two apps write them differently (`Example; Pat`, `Example, Pat`,
 * `Pat Example`), so a name is split into given and family parts once, here, and compared by
 * a key that does not depend on the order it was written in.
 */

export interface NameParts {
  /** Given name(s), possibly empty. */
  given: string;
  /** Family name. Empty only when the whole name is blank. */
  family: string;
}

export type NameOrder = 'family-first' | 'given-first';

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * - `Family; Given` and `Family, Given`: split at the first separator.
 * - No separator: the last word is the family name (`Pat Lee Example` → given `Pat Lee`).
 * - One word: a family name.
 */
export function parseName(raw: string): NameParts {
  const text = tidy(raw);
  const at = text.search(/[;,]/);
  if (at >= 0) {
    return {
      family: tidy(text.slice(0, at)),
      given: tidy(text.slice(at + 1).replace(/[;,]/g, ' ')),
    };
  }
  const cut = text.lastIndexOf(' ');
  return cut < 0
    ? { given: '', family: text }
    : { given: text.slice(0, cut), family: text.slice(cut + 1) };
}

/** `Example, Pat` or `Pat Example`. A name with one part is just that part. */
export function formatName(parts: NameParts, order: NameOrder): string {
  if (parts.given === '') return parts.family;
  if (parts.family === '') return parts.given;
  return order === 'family-first'
    ? `${parts.family}, ${parts.given}`
    : `${parts.given} ${parts.family}`;
}

/**
 * Identifies a person whatever order and punctuation the name was written with: the name's
 * words, lower-cased and sorted. `Example; Pat`, `Pat Example` and `EXAMPLE PAT` are one
 * person. (So are `Scott James` and `James Scott`; that trade is deliberate.)
 */
export function nameKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.;,]/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '')
    .sort()
    .join(' ');
}
