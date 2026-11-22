import { describe, expect, it } from 'vitest';
import { hoursText, reportToCsv } from './csv';
import type { Report } from './types';

describe('hoursText', () => {
  it('rounds minutes to tenths of an hour, half up', () => {
    expect(hoursText(0)).toBe('0.0');
    expect(hoursText(90)).toBe('1.5');
    expect(hoursText(93)).toBe('1.6');
    expect(hoursText(92)).toBe('1.5');
    expect(hoursText(173964)).toBe('2899.4');
  });
});

describe('reportToCsv', () => {
  const cell = (value: number) => ({ value, entryIds: [] });
  const report: Report = {
    period: { kind: 'all' },
    asOf: '2025-06-30',
    rounding: 'total',
    rules: [],
    sections: [
      {
        id: 'types',
        title: 'Experience by aircraft type',
        rowHeading: 'Aircraft type',
        countNoun: { one: 'flight', many: 'flights' },
        columns: [
          { id: 'total', label: 'Total time', short: 'Total', unit: 'minutes' },
          { id: 'dayLandings', label: 'Day landings, "all"', short: 'Day', unit: 'count' },
        ],
        rows: [
          {
            id: 'a',
            label: 'CRJ-700',
            depth: 0,
            count: 2,
            entryIds: [],
            cells: [cell(125), cell(1)],
          },
          {
            id: 'b',
            label: 'CRJ-550',
            depth: 1,
            count: 1,
            entryIds: [],
            cells: [cell(60), cell(0)],
          },
        ],
        total: {
          id: 'total',
          label: 'Total',
          depth: 0,
          count: 3,
          entryIds: [],
          cells: [cell(185), cell(1)],
        },
      },
    ],
  };

  it('writes a header, then each section with its column labels, rows and total', () => {
    expect(reportToCsv(report, { lines: ['Pilot, A.', 'All time'] }).split('\r\n')).toEqual([
      '"Pilot, A."',
      'All time',
      '',
      'Experience by aircraft type',
      'Aircraft type,Flights,Total time,"Day landings, ""all"""',
      'CRJ-700,2,2.1,1',
      '  CRJ-550,1,1.0,0',
      'Total,3,3.1,1',
      '',
    ]);
  });
});
