/**
 * Flight numbers. Stored in one canonical form, `DL3939`: the airline designator (two
 * characters IATA with at least one letter, e.g. `DL` or `9E`, or three letters ICAO, e.g.
 * `SKW`) followed directly
 * by the number. How they are shown is a display setting.
 */

export type FlightNumberStyle = 'spaced' | 'joined';

const PATTERN = /^([A-Z]{3}|[A-Z][A-Z0-9]|[0-9][A-Z])[\s-]*(\d{1,4}[A-Z]?)$/;

/** `dl 3939`, `DL-3939` and `DL3939` all give `DL3939`. Anything else is only tidied. */
export function canonicalFlightNumber(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const text = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  if (text === '') return undefined;
  const m = PATTERN.exec(text);
  return m ? `${m[1]}${m[2]}` : text;
}

/** `DL 3939` (spaced) or `DL3939` (joined). A number without a designator is shown as it is. */
export function formatFlightNumber(value: string, style: FlightNumberStyle): string {
  const m = PATTERN.exec(value.toUpperCase());
  if (!m) return value;
  return style === 'spaced' ? `${m[1]} ${m[2]}` : `${m[1]}${m[2]}`;
}
