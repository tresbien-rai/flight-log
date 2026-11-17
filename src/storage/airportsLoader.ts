import { createAirportLookup, type AirportData, type AirportLookup } from '@core/airports';

let cached: Promise<AirportLookup> | undefined;

/** Loads the bundled airport table on first use (its own chunk) and memoises the lookup. */
export function loadAirports(): Promise<AirportLookup> {
  cached ??= import('@core/airports/airports.data.json')
    .then((module) => createAirportLookup(module.default as unknown as AirportData))
    .catch((error: unknown) => {
      cached = undefined; // allow a retry after a transient failure
      throw error;
    });
  return cached;
}
