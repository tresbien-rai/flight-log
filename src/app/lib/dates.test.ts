import { describe, expect, it } from 'vitest';
import { addDays, addMonths, matchingQuickRange, quickRanges, todayIso } from './dates';

describe('date helpers', () => {
  it('formats a local date', () => {
    expect(todayIso(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
  });

  it('moves by months and clamps to a shorter month', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11-17', -12)).toBe('2025-11-17');
    expect(addMonths('2024-02-29', -12)).toBe('2023-02-28');
  });
});

describe('quick ranges', () => {
  const today = '2026-11-17';
  const byId = Object.fromEntries(quickRanges(today).map((r) => [r.id, r]));

  it('computes every pick from today', () => {
    expect(byId['all']).toMatchObject({ from: '', to: '' });
    expect(byId['year']).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(byId['12m']).toMatchObject({ from: '2025-11-18', to: '2026-11-17' });
    expect(byId['90d']).toMatchObject({ from: '2026-08-20', to: '2026-11-17' });
  });

  it('finds the pick that matches a range', () => {
    expect(matchingQuickRange('2026-08-20', today, today)?.id).toBe('90d');
    expect(matchingQuickRange('', '', today)?.id).toBe('all');
    expect(matchingQuickRange('2026-08-21', today, today)).toBeUndefined();
  });
});
