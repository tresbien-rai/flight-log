import type { Airport, AirportLookup } from './types';

/**
 * Shape of the bundled airport table (`airports.data.json`). Rows are tuples to keep the file
 * small: `[ident, iata | 0, local | 0, lat, lon, zoneIndex, name]`, where `0` means "none" and
 * `zoneIndex` indexes `zones`.
 */
export interface AirportData {
  zones: string[];
  airports: [
    ident: string,
    iata: string | 0,
    local: string | 0,
    lat: number,
    lon: number,
    zoneIndex: number,
    name: string,
  ][];
}

/**
 * Builds the lookup maps once. Resolution order for an input (trimmed, upper-cased):
 * exact ident, then IATA, then local code, then for a 3-character input `K` + input
 * (US convention: `LAX` → `KLAX`). The first airport to claim an IATA or local code keeps it.
 */
export function createAirportLookup(data: AirportData): AirportLookup {
  const byIdent = new Map<string, Airport>();
  const byIata = new Map<string, Airport>();
  const byLocal = new Map<string, Airport>();

  for (const [ident, iata, local, lat, lon, zoneIndex, name] of data.airports) {
    const airport: Airport = { ident, lat, lon, tz: data.zones[zoneIndex] ?? '' };
    if (name !== '') airport.name = name;
    if (iata !== 0) airport.iata = iata;
    if (!byIdent.has(ident)) byIdent.set(ident, airport);
    if (iata !== 0 && !byIata.has(iata)) byIata.set(iata, airport);
    if (local !== 0 && !byLocal.has(local)) byLocal.set(local, airport);
  }

  return (input) => {
    const key = input.trim().toUpperCase();
    if (key === '') return undefined;
    return (
      byIdent.get(key) ??
      byIata.get(key) ??
      byLocal.get(key) ??
      (key.length === 3 ? byIdent.get(`K${key}`) : undefined)
    );
  };
}

const EARTH_RADIUS_NM = 3440.065;

/** Great-circle (haversine) distance in nautical miles. */
export function distanceNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}
