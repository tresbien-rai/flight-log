/** Airport reference data. See docs/DESIGN.md §4.4. */

export interface Airport {
  /** The identifier pilots log: ICAO where one exists (`KLAX`), otherwise the local code. */
  ident: string;
  iata?: string;
  name?: string;
  /** Degrees; north and east positive. */
  lat: number;
  lon: number;
  /** IANA time zone, e.g. `America/Los_Angeles`. */
  tz: string;
}

/** Looks an airport up by any identifier it is known by (ICAO, IATA, local). Case-insensitive. */
export type AirportLookup = (ident: string) => Airport | undefined;
