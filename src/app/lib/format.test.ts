import { describe, expect, it } from 'vitest';
import {
  countOrBlank,
  dayAndWeekday,
  formatHours,
  hoursAndClock,
  hoursOrBlank,
  landingsText,
  longDate,
  minutesBetween,
  monthLabel,
  plural,
  utcClock,
} from './format';

describe('durations', () => {
  it('shows decimal hours with one place', () => {
    expect(formatHours(96)).toBe('1.6');
    expect(formatHours(0)).toBe('0.0');
  });

  it('groups thousands in large totals', () => {
    expect(formatHours(173964)).toBe('2,899.4');
    expect(formatHours(60 * 12345)).toBe('12,345.0');
  });

  it('leaves zero blank, not 0.0', () => {
    expect(hoursOrBlank(0)).toBe('');
    expect(hoursOrBlank(6)).toBe('0.1');
    expect(countOrBlank(0)).toBe('');
    expect(countOrBlank(1312)).toBe('1,312');
  });

  it('shows a duration both ways', () => {
    expect(hoursAndClock(174)).toBe('2.9 h (2:54)');
  });
});

describe('landings', () => {
  it('shows day and night as "2 / 1"', () => {
    expect(landingsText(2, 1)).toBe('2 / 1');
    expect(landingsText(0, 1)).toBe('0 / 1');
    expect(landingsText(1312, 219)).toBe('1,312 / 219');
  });

  it('is blank when there are no landings', () => {
    expect(landingsText(0, 0)).toBe('');
  });
});

describe('clock times', () => {
  it('shows a UTC instant as HH:MMZ', () => {
    expect(utcClock('2025-06-22T17:31Z')).toBe('17:31Z');
    expect(utcClock('2025-06-22T00:05:00Z')).toBe('00:05Z');
  });

  it('falls back to the raw text for an unusable instant', () => {
    expect(utcClock('soon')).toBe('soon');
  });

  it('measures the time between two instants', () => {
    expect(minutesBetween('2025-06-22T17:31Z', '2025-06-22T20:25Z')).toBe(174);
    expect(minutesBetween('2025-06-22T23:50Z', '2025-06-23T00:10Z')).toBe(20);
  });

  it('gives nothing when an instant is missing or the order is wrong', () => {
    expect(minutesBetween(undefined, '2025-06-22T17:31Z')).toBeUndefined();
    expect(minutesBetween('2025-06-22T20:00Z', '2025-06-22T17:31Z')).toBeUndefined();
  });
});

describe('dates', () => {
  it('labels months', () => {
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(monthLabel('2014-02')).toBe('February 2014');
    expect(monthLabel('')).toBe('No date');
  });

  it('gives the day number and weekday', () => {
    expect(dayAndWeekday('2026-11-07')).toEqual({ day: '7', weekday: 'Sat' });
    expect(dayAndWeekday('2024-02-29')).toEqual({ day: '29', weekday: 'Thu' });
    expect(dayAndWeekday('')).toEqual({ day: '', weekday: '' });
    expect(dayAndWeekday('2025-02-30')).toEqual({ day: '', weekday: '' });
  });

  it('writes a long date', () => {
    expect(longDate('2026-11-07')).toBe('Sat 7 Nov 2026');
    expect(longDate('')).toBe('No date');
  });

  it('pluralises', () => {
    expect(plural(1, 'entry', 'entries')).toBe('1 entry');
    expect(plural(1771, 'entry', 'entries')).toBe('1,771 entries');
    expect(plural(2, 'flight')).toBe('2 flights');
  });
});
