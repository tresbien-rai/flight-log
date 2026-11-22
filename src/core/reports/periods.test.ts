import { describe, expect, it } from 'vitest';
import { addDays, addMonths, isIsoDate, lookBackId, lookBackLabel, lookBackRange } from './periods';

describe('periods', () => {
  it('recognises real dates only', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('2024-2-1')).toBe(false);
    expect(isIsoDate(20240101)).toBe(false);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('adds months, keeping the day where the month has it', () => {
    expect(addMonths('2025-03-31', -1)).toBe('2025-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2025-01-15', -12)).toBe('2024-01-15');
    expect(addMonths('2025-11-30', 3)).toBe('2026-02-28');
  });

  it('counts 90 days as the as-of date and the 89 before it', () => {
    expect(lookBackRange('2025-04-01', { unit: 'days', count: 90 })).toEqual({
      from: '2025-01-02',
      to: '2025-04-01',
    });
  });

  it('starts a months look-back the day after the same date that many months earlier', () => {
    expect(lookBackRange('2026-11-22', { unit: 'months', count: 12 })).toEqual({
      from: '2025-11-23',
      to: '2026-11-22',
    });
    expect(lookBackRange('2025-03-31', { unit: 'months', count: 1 })).toEqual({
      from: '2025-03-01',
      to: '2025-03-31',
    });
  });

  it('names look-backs', () => {
    expect(lookBackLabel({ unit: 'days', count: 90 })).toBe('Last 90 days');
    expect(lookBackLabel({ unit: 'months', count: 1 })).toBe('Last 1 month');
    expect(lookBackLabel({ unit: 'months', count: 24 })).toBe('Last 24 months');
    expect(lookBackLabel({ unit: 'months', count: 60 })).toBe('Last 5 years');
    expect(lookBackLabel({ unit: 'months', count: 18 })).toBe('Last 18 months');
    expect(lookBackId({ unit: 'months', count: 6 })).toBe('m6');
    expect(lookBackId({ unit: 'days', count: 30 })).toBe('d30');
  });
});
