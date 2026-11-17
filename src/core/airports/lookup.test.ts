import { describe, expect, it } from 'vitest';
import realData from './airports.data.json';
import { createAirportLookup, distanceNm } from './lookup';
import type { AirportData } from './lookup';

const tiny: AirportData = {
  zones: ['America/Los_Angeles', 'Europe/London'],
  airports: [
    ['EGLL', 'LHR', 0, 51.4706, -0.4619, 1, 'London Heathrow'],
    ['KLAX', 'LAX', 0, 33.9425, -118.4081, 0, 'Los Angeles Intl'],
    ['KFRG', 0, 'FRG', 40.7288, -73.4134, 0, 'Republic'],
    ['XYZ1', 'ZZZ', 'ABC', 1, 2, 0, ''],
    ['KABC', 0, 0, 3, 4, 0, 'Other ABC'],
  ],
};

describe('createAirportLookup (inline data)', () => {
  const lookup = createAirportLookup(tiny);

  it('resolves an exact ident', () => {
    expect(lookup('KLAX')).toEqual({
      ident: 'KLAX',
      iata: 'LAX',
      name: 'Los Angeles Intl',
      lat: 33.9425,
      lon: -118.4081,
      tz: 'America/Los_Angeles',
    });
  });

  it('resolves by IATA', () => {
    expect(lookup('LHR')?.ident).toBe('EGLL');
    expect(lookup('LHR')?.tz).toBe('Europe/London');
  });

  it('resolves by local code', () => {
    expect(lookup('FRG')?.ident).toBe('KFRG');
  });

  it('falls back to K + 3 characters', () => {
    expect(lookup('LAX')?.ident).toBe('KLAX');
    expect(lookup('FRG')?.ident).toBe('KFRG');
  });

  it('prefers ident, then IATA, then local, then K-prefix', () => {
    expect(lookup('ABC')?.ident).toBe('XYZ1'); // local code beats K-prefix (KABC)
    expect(lookup('ZZZ')?.ident).toBe('XYZ1');
    expect(lookup('KABC')?.ident).toBe('KABC');
  });

  it('is case-insensitive and trims', () => {
    expect(lookup(' klax ')?.ident).toBe('KLAX');
    expect(lookup('lhr')?.ident).toBe('EGLL');
  });

  it('returns undefined for unknown or empty input', () => {
    expect(lookup('NOPE')).toBeUndefined();
    expect(lookup('QQQ')).toBeUndefined();
    expect(lookup('')).toBeUndefined();
    expect(lookup('   ')).toBeUndefined();
  });
});

describe('distanceNm', () => {
  const klax = { lat: 33.9425, lon: -118.4081 };
  const kjfk = { lat: 40.6398, lon: -73.7789 };

  it('KLAX to KJFK is about 2,145 NM', () => {
    expect(distanceNm(klax, kjfk)).toBeGreaterThan(2140);
    expect(distanceNm(klax, kjfk)).toBeLessThan(2150);
  });

  it('is symmetric', () => {
    expect(distanceNm(klax, kjfk)).toBeCloseTo(distanceNm(kjfk, klax), 9);
  });

  it('is zero for the same point', () => {
    expect(distanceNm(klax, klax)).toBe(0);
  });

  it('takes the short way across the antimeridian', () => {
    // 2 degrees of longitude at the equator = 2 * 60 NM, give or take earth radius.
    const d = distanceNm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 });
    expect(d).toBeCloseTo((2 * Math.PI * 3440.065) / 180, 6);
  });
});

describe('bundled airport data', () => {
  const data = realData as AirportData;
  const lookup = createAirportLookup(data);

  const expected: [string, string, number, number][] = [
    ['KLAX', 'America/Los_Angeles', 33.94, -118.41],
    ['KJFK', 'America/New_York', 40.64, -73.78],
    ['KORD', 'America/Chicago', 41.98, -87.9],
    ['KDEN', 'America/Denver', 39.86, -104.67],
    ['KSEA', 'America/Los_Angeles', 47.45, -122.31],
    ['KPHX', 'America/Phoenix', 33.43, -112.01],
    ['KASE', 'America/Denver', 39.22, -106.87],
    ['KFRG', 'America/New_York', 40.73, -73.41],
    ['KISP', 'America/New_York', 40.8, -73.1],
    ['PANC', 'America/Anchorage', 61.17, -150.0],
    ['PHNL', 'Pacific/Honolulu', 21.32, -157.92],
    ['CYVR', 'America/Vancouver', 49.19, -123.18],
    ['EGLL', 'Europe/London', 51.47, -0.46],
  ];

  it.each(expected)('%s has the right zone and position', (ident, tz, lat, lon) => {
    const a = lookup(ident);
    expect(a).toBeDefined();
    expect(a?.tz).toBe(tz);
    expect(a?.lat).toBeCloseTo(lat, 0);
    expect(a?.lon).toBeCloseTo(lon, 0);
  });

  it('resolves LAX, lax and padded KLAX to KLAX', () => {
    expect(lookup('LAX')?.ident).toBe('KLAX');
    expect(lookup('lax')?.ident).toBe('KLAX');
    expect(lookup(' KLAX ')?.ident).toBe('KLAX');
  });

  it('has a zone and sane coordinates on every row', () => {
    for (const [ident, , , lat, lon, zoneIndex] of data.airports) {
      const tz = data.zones[zoneIndex];
      expect(tz, ident).toBeTruthy();
      expect(Math.abs(lat), ident).toBeLessThanOrEqual(90);
      expect(Math.abs(lon), ident).toBeLessThanOrEqual(180);
    }
  });

  it('has unique idents', () => {
    const idents = data.airports.map((r) => r[0]);
    expect(new Set(idents).size).toBe(idents.length);
  });
});
