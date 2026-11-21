import { describe, expect, it } from 'vitest';
import { isNight, isNightForLandings, solarElevation } from './sun';

const at = (iso: string) => Date.parse(iso);
// Los Angeles, and a high-latitude airport.
const LAX = { lat: 33.9425, lon: -118.4081 };
const ANC = { lat: 61.1744, lon: -149.9964 };

/** The first minute in [from, from + span) at which the sun crosses the horizon. */
function crossing(fromIso: string, spanMinutes: number, pos: { lat: number; lon: number }) {
  const start = at(fromIso);
  const up = (ms: number) => solarElevation(ms, pos.lat, pos.lon) > -0.833;
  const first = up(start);
  for (let i = 1; i < spanMinutes; i++) {
    const ms = start + i * 60_000;
    if (up(ms) !== first) return new Date(ms).toISOString().slice(11, 16);
  }
  return undefined;
}

describe('solarElevation', () => {
  it('puts the sun near the zenith at the equator at noon on an equinox', () => {
    expect(solarElevation(at('2025-03-20T12:07Z'), 0, 0)).toBeGreaterThan(88);
  });

  it('puts the sun well below the horizon at local midnight', () => {
    expect(solarElevation(at('2025-06-22T07:50Z'), LAX.lat, LAX.lon)).toBeLessThan(-20);
  });

  // Published times (US Naval Observatory), to within two minutes.
  it.each([
    ['sunset at Los Angeles, 21 June 2025', '2025-06-22T02:00Z', LAX, '03:08'],
    ['sunrise at Los Angeles, 21 December 2025', '2025-12-21T14:00Z', LAX, '14:55'],
    ['sunset at Anchorage, 21 December 2025', '2025-12-22T00:00Z', ANC, '00:42'],
  ])('finds %s', (_, from, pos, expected) => {
    const found = crossing(from, 180, pos)!;
    const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    expect(Math.abs(minutes(found) - minutes(expected))).toBeLessThanOrEqual(2);
  });
});

describe('night', () => {
  // Sunset at Los Angeles on 21 June 2025 is about 03:08Z on the 22nd.
  it('counts a landing as night only from an hour after sunset', () => {
    expect(isNightForLandings(at('2025-06-22T03:30Z'), LAX.lat, LAX.lon)).toBe(false);
    expect(isNightForLandings(at('2025-06-22T04:20Z'), LAX.lat, LAX.lon)).toBe(true);
    expect(isNightForLandings(at('2025-06-22T19:00Z'), LAX.lat, LAX.lon)).toBe(false);
  });

  it('starts night flight time at the end of civil twilight', () => {
    expect(isNight(at('2025-06-22T03:20Z'), LAX.lat, LAX.lon)).toBe(false);
    expect(isNight(at('2025-06-22T03:50Z'), LAX.lat, LAX.lon)).toBe(true);
  });
});
