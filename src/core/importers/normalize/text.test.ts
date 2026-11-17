import { describe, expect, it } from 'vitest';
import {
  clean,
  normalizeAirport,
  normalizeTail,
  parseBool,
  parseClock,
  parseCount,
  parseDate,
  parseHours,
  parseNumber,
} from './text';

describe('clean', () => {
  it('trims and collapses whitespace', () => {
    expect(clean('  a \t b\n c  ')).toBe('a b c');
  });
  it('returns undefined for empty', () => {
    expect(clean(undefined)).toBeUndefined();
    expect(clean('')).toBeUndefined();
    expect(clean(' \n\t ')).toBeUndefined();
  });
});

describe('normalizeTail', () => {
  it('upper-cases', () => {
    expect(normalizeTail(' n123ab ')).toBe('N123AB');
    expect(normalizeTail('n 1')).toBe('N 1');
    expect(normalizeTail('  ')).toBeUndefined();
    expect(normalizeTail(undefined)).toBeUndefined();
  });
});

describe('normalizeAirport', () => {
  it('normalises idents', () => {
    expect(normalizeAirport(' ksea ')).toEqual({ ident: 'KSEA', local: false });
  });
  it('recognises LOCAL', () => {
    expect(normalizeAirport('LOCAL')).toEqual({ local: true });
    expect(normalizeAirport(' Local ')).toEqual({ local: true });
  });
  it('handles blank', () => {
    expect(normalizeAirport('')).toEqual({ local: false });
    expect(normalizeAirport(undefined)).toEqual({ local: false });
  });
  it('does not treat idents containing local as the placeholder', () => {
    expect(normalizeAirport('LOCALX')).toEqual({ ident: 'LOCALX', local: false });
  });
});

describe('parseDate', () => {
  it('accepts real dates', () => {
    expect(parseDate('2025-06-22')).toBe('2025-06-22');
    expect(parseDate(' 2024-02-29 ')).toBe('2024-02-29');
  });
  it('rejects impossible and malformed dates', () => {
    expect(parseDate('2025-02-29')).toBeUndefined();
    expect(parseDate('2025-13-01')).toBeUndefined();
    expect(parseDate('2025-00-10')).toBeUndefined();
    expect(parseDate('2025-04-31')).toBeUndefined();
    expect(parseDate('2025-6-2')).toBeUndefined();
    expect(parseDate('06/22/2025')).toBeUndefined();
    expect(parseDate('2025-06-22T10:00')).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
    expect(parseDate(undefined)).toBeUndefined();
  });
  it('handles year 0099 without 1900 offset', () => {
    expect(parseDate('0099-01-01')).toBe('0099-01-01');
  });
  it('rejects century non-leap day', () => {
    expect(parseDate('1900-02-29')).toBeUndefined();
    expect(parseDate('2000-02-29')).toBe('2000-02-29');
  });
});

describe('parseClock', () => {
  it('parses HH:MM and H:MM', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('9:05')).toBe(545);
    expect(parseClock('23:59')).toBe(1439);
    expect(parseClock(' 17:31 ')).toBe(1051);
  });
  it('rejects bad input', () => {
    expect(parseClock('24:00')).toBeUndefined();
    expect(parseClock('12:60')).toBeUndefined();
    expect(parseClock('12:5')).toBeUndefined();
    expect(parseClock('1231')).toBeUndefined();
    expect(parseClock('12:30:00')).toBeUndefined();
    expect(parseClock('-1:30')).toBeUndefined();
    expect(parseClock('')).toBeUndefined();
    expect(parseClock(undefined)).toBeUndefined();
  });
});

describe('parseCount', () => {
  it('parses integers', () => {
    expect(parseCount('0')).toBe(0);
    expect(parseCount('3')).toBe(3);
    expect(parseCount(' 12 ')).toBe(12);
  });
  it('tolerates .0 and thousands commas', () => {
    expect(parseCount('2.0')).toBe(2);
    expect(parseCount('2.00')).toBe(2);
    expect(parseCount('1,684')).toBe(1684);
    expect(parseCount('1,684.0')).toBe(1684);
  });
  it('rejects everything else', () => {
    for (const bad of ['', '  ', '-1', '1.5', '2.01', 'x', '1,68', '1,6840', ',5', '1e3', '.5']) {
      expect(parseCount(bad), bad).toBeUndefined();
    }
    expect(parseCount(undefined)).toBeUndefined();
  });
});

describe('parseNumber', () => {
  it('parses non-negative decimals', () => {
    expect(parseNumber('1,684.0')).toBe(1684);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('0')).toBe(0);
    expect(parseNumber('12,345,678.25')).toBe(12345678.25);
  });
  it('rejects bad input', () => {
    for (const bad of ['', '-1.5', '1.', 'abc', '1,2', '1.2.3', '1e3']) {
      expect(parseNumber(bad), bad).toBeUndefined();
    }
    expect(parseNumber(undefined)).toBeUndefined();
  });
});

describe('parseBool', () => {
  it('maps true and false spellings', () => {
    for (const t of ['1', 'true', 'TRUE', 'yes', 'Yes', 'x', 'X', ' true ']) {
      expect(parseBool(t), t).toBe(true);
    }
    for (const f of ['0', 'false', 'FALSE', 'no', 'No']) expect(parseBool(f), f).toBe(false);
  });
  it('returns undefined otherwise', () => {
    for (const o of ['', ' ', 'maybe', '2', 'y']) expect(parseBool(o), o).toBeUndefined();
    expect(parseBool(undefined)).toBeUndefined();
  });
});

describe('parseHours', () => {
  it('converts decimal hours to minutes', () => {
    expect(parseHours('1.6')).toBe(96);
    expect(parseHours('0.0')).toBe(0);
    expect(parseHours(' 2 ')).toBe(120);
    expect(parseHours('1.05')).toBe(63);
  });
  it('strips thousands commas', () => {
    expect(parseHours('1,684.0')).toBe(101040);
    expect(parseHours('1,000')).toBe(60000);
  });
  it('accepts H:MM via parseDuration', () => {
    expect(parseHours('1:36')).toBe(96);
  });
  it('rejects blank and invalid', () => {
    for (const bad of ['', ' ', 'abc', '-1', '1,5', '1.2.3', ',5']) {
      expect(parseHours(bad), bad).toBeUndefined();
    }
    expect(parseHours(undefined)).toBeUndefined();
  });
});
