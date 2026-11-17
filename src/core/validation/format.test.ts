import { describe, expect, it } from 'vitest';
import { clock, hours, instantMs, minutesBetween } from './format';

describe('format', () => {
  it('shows hours as one-place decimals', () => {
    expect(hours(96)).toBe('1.6');
    expect(hours(0)).toBe('0.0');
    expect(hours(-90)).toBe('-1.5');
  });
  it('does not throw on odd input', () => {
    expect(hours(NaN)).toBe('NaN');
    expect(hours(61.4)).toBe('1.0');
  });
  it('shows UTC clock times', () => {
    expect(clock('2025-06-22T17:31Z')).toBe('17:31Z');
    expect(clock('2025-06-22T07:05:30Z')).toBe('07:05Z');
    expect(clock('garbage')).toBe('garbage');
  });
  it('parses instants and measures minutes', () => {
    expect(instantMs(undefined)).toBeUndefined();
    expect(instantMs('nope')).toBeUndefined();
    expect(minutesBetween('2025-06-22T17:00Z', '2025-06-22T18:30Z')).toBe(90);
    expect(minutesBetween('2025-06-22T18:00Z', '2025-06-22T17:00Z')).toBe(-60);
    expect(minutesBetween(undefined, '2025-06-22T17:00Z')).toBeUndefined();
  });
});
