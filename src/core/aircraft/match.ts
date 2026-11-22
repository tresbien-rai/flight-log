/** Maps a source's description of an aircraft onto the built-in type list. Pure. */
import type { SourceAircraft } from '../importers/types';
import { CATALOG, type CatalogType } from './catalog';

const norm = (text: string | undefined): string =>
  (text ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

const byCode = new Map<string, CatalogType>();
const byIcao = new Map<string, CatalogType[]>();
for (const type of CATALOG) {
  for (const code of [type.id, ...type.codes]) byCode.set(norm(code), type);
  const list = byIcao.get(type.icaoDesignator) ?? [];
  list.push(type);
  byIcao.set(type.icaoDesignator, list);
}

export function catalogType(id: string): CatalogType | undefined {
  return CATALOG.find((t) => t.id === id);
}

/**
 * The listed type an aircraft is, or undefined when it is not in the list.
 * 1. Its type code names exactly one type (`C-172S`, `CRJ-700`, `C72R`).
 * 2. Its type code is an ICAO designator: the one type whose model pattern the source's model
 *    text matches, else the designator's default type (`CRJ7` → CRJ-700), else nothing.
 */
export function matchType(
  aircraft: Pick<SourceAircraft, 'typeCode' | 'model'>,
): CatalogType | undefined {
  const code = norm(aircraft.typeCode);
  if (code === '') return undefined;
  const icao = byIcao.get(code);
  if (icao) {
    if (icao.length === 1) return icao[0];
    const model = (aircraft.model ?? '').toUpperCase();
    const hits = icao.filter((t) => t.modelPattern?.test(model));
    if (hits.length === 1) return hits[0];
    return icao.find((t) => t.isDefaultForIcao);
  }
  return byCode.get(code);
}
