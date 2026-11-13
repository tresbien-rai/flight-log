import { describe, expect, it } from 'vitest';
import { formatDecimal, formatHM, parseDuration } from './duration';

describe('parseDuration', () => {
  it('parses decimal hours', () => {
    expect(parseDuration('1.6')).toBe(96);
    expect(parseDuration('.5')).toBe(30);
    expect(parseDuration('2')).toBe(120);
    expect(parseDuration('0')).toBe(0);
    expect(parseDuration('2.')).toBe(120);
  });

  it('parses H:MM and H+MM', () => {
    expect(parseDuration('1:36')).toBe(96);
    expect(parseDuration('0:05')).toBe(5);
    expect(parseDuration('1+36')).toBe(96);
    expect(parseDuration('12:00')).toBe(720);
    expect(parseDuration('1:5')).toBe(65);
  });

  it('trims whitespace', () => {
    expect(parseDuration('  1.6 ')).toBe(96);
  });

  it('rounds decimal hours to the nearest minute despite float noise', () => {
    expect(parseDuration('1.05')).toBe(63);
    expect(parseDuration('0.7')).toBe(42);
    expect(parseDuration('0.1')).toBe(6);
    expect(parseDuration('1.01')).toBe(61); // 60.6 -> 61
    expect(parseDuration('0.008')).toBe(0); // 0.48 -> 0
    expect(parseDuration('0.0083')).toBe(0); // 0.498 -> 0
    expect(parseDuration('0.0084')).toBe(1); // 0.504 -> 1
  });

  it('returns null for blank, invalid or negative input', () => {
    for (const bad of [
      '',
      '   ',
      'abc',
      '-1',
      '-0.5',
      '-1:30',
      '1:60',
      '1:360',
      ':30',
      '1:',
      '1.2.3',
      '1,5',
      '.',
      '1e3',
      '+5',
    ]) {
      expect(parseDuration(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('formatDecimal', () => {
  it('formats minutes as decimal hours', () => {
    expect(formatDecimal(96)).toBe('1.6');
    expect(formatDecimal(0)).toBe('0.0');
    expect(formatDecimal(63)).toBe('1.1');
    expect(formatDecimal(63, 2)).toBe('1.05');
    expect(formatDecimal(90, 0)).toBe('2');
  });

  it('rejects invalid minutes', () => {
    expect(() => formatDecimal(-1)).toThrow(RangeError);
    expect(() => formatDecimal(1.5)).toThrow(RangeError);
    expect(() => formatDecimal(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatHM', () => {
  it('formats minutes as H:MM', () => {
    expect(formatHM(96)).toBe('1:36');
    expect(formatHM(5)).toBe('0:05');
    expect(formatHM(0)).toBe('0:00');
    expect(formatHM(6000)).toBe('100:00');
  });

  it('rejects invalid minutes', () => {
    expect(() => formatHM(-5)).toThrow(RangeError);
  });

  it('round-trips with parseDuration', () => {
    for (const m of [0, 1, 59, 60, 61, 96, 1439]) {
      expect(parseDuration(formatHM(m))).toBe(m);
    }
  });
});
