import { describe, expect, it } from 'vitest';
import { canonicalFlightNumber, formatFlightNumber } from './flightNumber';

describe('canonicalFlightNumber', () => {
  it.each([
    ['DL 3939', 'DL3939'],
    ['dl3939', 'DL3939'],
    ['  DL-3939 ', 'DL3939'],
    ['SKW 5123', 'SKW5123'],
    ['9E 5123', '9E5123'],
    ['AA 1', 'AA1'],
    ['UA 123A', 'UA123A'],
    ['3939', '3939'],
    ['ferry  flight', 'FERRY FLIGHT'],
  ])('%j → %j', (raw, expected) => {
    expect(canonicalFlightNumber(raw)).toBe(expected);
  });

  it('gives nothing for a blank', () => {
    expect(canonicalFlightNumber('  ')).toBeUndefined();
    expect(canonicalFlightNumber(undefined)).toBeUndefined();
  });
});

describe('formatFlightNumber', () => {
  it('writes either style', () => {
    expect(formatFlightNumber('DL3939', 'spaced')).toBe('DL 3939');
    expect(formatFlightNumber('DL3939', 'joined')).toBe('DL3939');
    expect(formatFlightNumber('SKW5123', 'spaced')).toBe('SKW 5123');
    expect(formatFlightNumber('9E5123', 'spaced')).toBe('9E 5123');
  });

  it('leaves anything else alone', () => {
    expect(formatFlightNumber('3939', 'spaced')).toBe('3939');
    expect(formatFlightNumber('FERRY FLIGHT', 'spaced')).toBe('FERRY FLIGHT');
  });
});
