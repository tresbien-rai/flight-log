import { describe, expect, it } from 'vitest';
import { EMPTY_PILOT } from '@core/model';
import { FULL_LAYOUT } from '@core/reports';
import type { Report } from '@core/reports';
import {
  headerLines,
  lookBackOptions,
  periodText,
  reportHours,
  reportValue,
  rulesText,
  sameLayout,
  toggleLookBack,
} from './report';

const report = (over: Partial<Report>): Report => ({
  period: { kind: 'all' },
  asOf: '2026-11-22',
  rounding: 'total',
  rules: [],
  sections: [],
  ...over,
});

describe('report text', () => {
  it('writes hours with one place and thousands separators, rounding half up', () => {
    expect(reportHours(173964)).toBe('2,899.4');
    expect(reportHours(9)).toBe('0.2');
    expect(reportValue(1266, 'count')).toBe('1,266');
  });

  it('describes the period', () => {
    expect(periodText(report({}))).toBe('All time');
    expect(periodText(report({ period: { kind: 'range' } }))).toBe('All time');
    expect(periodText(report({ period: { kind: 'range', from: '2024-01-01' } }))).toBe(
      'Since 1 Jan 2024',
    );
    expect(periodText(report({ period: { kind: 'range', to: '2024-06-02' } }))).toBe(
      'Up to 2 Jun 2024',
    );
    expect(
      periodText(report({ period: { kind: 'range', from: '2024-01-01', to: '2024-06-02' } })),
    ).toBe('1 Jan 2024 to 2 Jun 2024');
  });

  it('names the rules only when some are left out', () => {
    expect(rulesText(report({}))).toBeUndefined();
    expect(rulesText(report({ rules: ['121', '135'] }))).toBe(
      'Flights under Part 121 and Part 135 only',
    );
  });

  it('heads the report with the pilot’s name, or a title when there is none', () => {
    expect(headerLines(report({}), EMPTY_PILOT, 'LogTen')[0]).toBe('Experience report');
    const lines = headerLines(
      report({ rounding: 'perFlight' }),
      { ...EMPTY_PILOT, name: 'Pat' },
      'LogTen',
    );
    expect(lines[0]).toBe('Pat');
    expect(lines).toContain('Each flight rounded to a tenth of an hour before adding');
  });
});

describe('look-backs', () => {
  it('offers the standard choices plus any the layout holds, shortest first', () => {
    const layout = { ...FULL_LAYOUT, lookBacks: [{ unit: 'months' as const, count: 18 }] };
    const labels = lookBackOptions(layout).map((o) => o.label);
    expect(labels.indexOf('Last 18 months')).toBeGreaterThan(labels.indexOf('Last 12 months'));
    expect(labels.indexOf('Last 18 months')).toBeLessThan(labels.indexOf('Last 24 months'));
    expect(labels[0]).toBe('Last 30 days');
  });

  it('toggles a look-back, keeping them in order', () => {
    const layout = { ...FULL_LAYOUT, lookBacks: [{ unit: 'months' as const, count: 12 }] };
    expect(toggleLookBack(layout, { unit: 'days', count: 90 })).toEqual([
      { unit: 'days', count: 90 },
      { unit: 'months', count: 12 },
    ]);
    expect(toggleLookBack(layout, { unit: 'months', count: 12 })).toEqual([]);
  });

  it('compares layouts by content', () => {
    expect(sameLayout(FULL_LAYOUT, structuredClone(FULL_LAYOUT))).toBe(true);
    expect(sameLayout(FULL_LAYOUT, { ...FULL_LAYOUT, showEmpty: true })).toBe(false);
  });
});
