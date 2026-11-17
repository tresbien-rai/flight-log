import { describe, expect, it } from 'vitest';
import { normalizeApproachType, normalizeRunway, parseApproachCell } from './approach';

describe('normalizeApproachType', () => {
  const cases: [string, string][] = [
    ['ILS', 'ILS'],
    ['ils', 'ILS'],
    ['ILS OR LOC RWY 24R', 'ILS'],
    ['ILS OR LOC/DME RWY 7', 'ILS'],
    ['ILS Y RWY 25L', 'ILS'],
    ['ILS PRM', 'ILS'],
    ['  ils   or  loc  rwy 1 ', 'ILS'],
    ['LOC', 'LOC'],
    ['LOC/DME', 'LOC'],
    ['LOC RWY 12', 'LOC'],
    ['LOC BC', 'LOC-BC'],
    ['LOC/DME BC', 'LOC-BC'],
    ['loc/dme bc rwy 19', 'LOC-BC'],
    ['LOCALIZER BACK COURSE', 'LOC-BC'],
    ['LOCALIZER', 'LOC'],
    ['LDA', 'LDA'],
    ['LDA RWY 5', 'LDA'],
    ['SDF', 'SDF'],
    ['RNAV (GPS)', 'RNAV-GPS'],
    ['RNAV (GPS) Y RWY 28L', 'RNAV-GPS'],
    ['RNAV(GPS) RWY 4', 'RNAV-GPS'],
    ['GPS', 'RNAV-GPS'],
    ['RNAV', 'RNAV-GPS'],
    ['GPS RWY 6', 'RNAV-GPS'],
    ['RNAV (RNP)', 'RNAV-RNP'],
    ['RNP', 'RNAV-RNP'],
    ['RNAV (RNP) Z RWY 13', 'RNAV-RNP'],
    ['GLS', 'GLS'],
    ['VOR', 'VOR'],
    ['VOR/DME', 'VOR'],
    ['VOR-A', 'VOR'],
    ['VOR/DME-B', 'VOR'],
    ['VOR OR TACAN', 'VOR'],
    ['NDB', 'NDB'],
    ['NDB RWY 3', 'NDB'],
    ['TACAN', 'TACAN'],
    ['PAR', 'PAR'],
    ['ASR', 'ASR'],
    ['VISUAL', 'VISUAL'],
    ['VISUAL RWY 28R', 'VISUAL'],
    ['CONTACT', 'VISUAL'],
  ];
  it.each(cases)('%s -> %s', (input, expected) => {
    expect(normalizeApproachType(input)).toBe(expected);
  });
  it('returns undefined for blank or unknown', () => {
    for (const s of ['', '   ', 'FOO', 'PARTIAL PANEL', 'ASRX', 'ILSX', 'SPACE SHUTTLE']) {
      expect(normalizeApproachType(s), s).toBeUndefined();
    }
  });
});

describe('normalizeRunway', () => {
  it.each([
    ['6', '06'],
    ['06', '06'],
    ['24r', '24R'],
    ['RWY 7L', '07L'],
    ['rwy7l', '07L'],
    ['Runway 9', '09'],
    ['28L', '28L'],
    ['18C', '18C'],
    ['36', '36'],
    ['01', '01'],
    [' 7 l ', '07L'],
  ])('%s -> %s', (i, o) => expect(normalizeRunway(i)).toBe(o));
  it('rejects invalid', () => {
    for (const s of ['A', '', ' ', '37', '00', '0', '7X', '123', 'RWY', '-5', '7LL']) {
      expect(normalizeRunway(s), s).toBeUndefined();
    }
  });
});

describe('parseApproachCell', () => {
  it('returns undefined for blank cells', () => {
    expect(parseApproachCell('')).toBeUndefined();
    expect(parseApproachCell('  \n ')).toBeUndefined();
    expect(parseApproachCell(';;;')).toBeUndefined();
  });
  it('parses the 4-field LogTen form', () => {
    expect(parseApproachCell('1;ILS;28L;KSFO')).toEqual({
      count: 1,
      approach: { type: 'ILS', runway: '28L', airport: 'KSFO' },
      problems: [],
    });
  });
  it('parses the 6-field ForeFlight form with circle and missed flags', () => {
    expect(parseApproachCell('2;RNAV (GPS);6;kpdx;circle;')).toEqual({
      count: 2,
      approach: { type: 'RNAV-GPS', runway: '06', airport: 'KPDX', circleToLand: true },
      problems: [],
    });
    expect(parseApproachCell('1;VOR;;KBFI;;Missed')?.approach).toEqual({
      type: 'VOR',
      airport: 'KBFI',
      missed: true,
    });
  });
  it('appends other comment fields to note', () => {
    const r = parseApproachCell('1;ILS;28L;KSFO;hand flown;to minimums');
    expect(r?.approach.note).toBe('hand flown; to minimums');
    expect(r?.problems).toEqual([]);
  });
  it('defaults the count and reports bad-count', () => {
    for (const c of ['', 'x', '-2', '1.5', '0']) {
      const r = parseApproachCell(`${c};ILS;28L;KSFO`);
      expect(r?.count, c).toBe(1);
      expect(r?.problems, c).toEqual(['bad-count']);
    }
    expect(parseApproachCell('2.0;ILS;28L;KSFO')?.count).toBe(2);
  });
  it('keeps chart titles in note and extracts the runway', () => {
    const r = parseApproachCell('1;ILS OR LOC RWY 24R;;KSEA');
    expect(r).toEqual({
      count: 1,
      approach: { type: 'ILS', runway: '24R', airport: 'KSEA', note: 'ILS OR LOC RWY 24R' },
      problems: [],
    });
  });
  it('prefers an explicit runway to the one in the title', () => {
    const r = parseApproachCell('1;ILS Y RWY 25L;25R;KSFO');
    expect(r?.approach.runway).toBe('25R');
    expect(r?.approach.note).toBe('ILS Y RWY 25L');
  });
  it('does not note canonical short names', () => {
    expect(parseApproachCell('1;LOC BC;;KSEA')?.approach).toEqual({
      type: 'LOC-BC',
      airport: 'KSEA',
    });
    expect(parseApproachCell('1;ils;;KSEA')?.approach.note).toBeUndefined();
  });
  it('notes suffixed chart names like VOR-A', () => {
    const r = parseApproachCell('1;VOR-A;;KSEA');
    expect(r?.approach.type).toBe('VOR');
    expect(r?.approach.note).toBe('VOR-A');
    expect(r?.approach.runway).toBeUndefined();
  });
  it('uses OTHER for unknown types and keeps the text', () => {
    expect(parseApproachCell('1;Foo Approach;6;KSEA')).toEqual({
      count: 1,
      approach: { type: 'OTHER', runway: '06', airport: 'KSEA', note: 'Foo Approach' },
      problems: ['unknown-approach-type'],
    });
  });
  it('handles a bad runway', () => {
    const r = parseApproachCell('1;ILS;99;KSEA');
    expect(r?.approach).toEqual({ type: 'ILS', airport: 'KSEA', note: '99' });
    expect(r?.problems).toEqual(['bad-runway']);
  });
  it('joins several note fragments with "; "', () => {
    const r = parseApproachCell('1;Weird;A;KSEA;extra');
    expect(r?.approach.note).toBe('Weird; A; extra');
    expect(r?.problems).toEqual(['unknown-approach-type', 'bad-runway']);
  });
  it('handles the position-shifted form', () => {
    expect(parseApproachCell('1;;KSEA')).toEqual({
      count: 1,
      approach: { type: 'OTHER', airport: 'KSEA' },
      problems: ['unknown-approach-type'],
    });
  });
  it('keeps a valid runway when only the type is blank', () => {
    expect(parseApproachCell('1;;24R;KSEA')).toEqual({
      count: 1,
      approach: { type: 'OTHER', runway: '24R', airport: 'KSEA' },
      problems: ['unknown-approach-type'],
    });
  });
  it('cleans fields containing embedded newlines', () => {
    const r = parseApproachCell(' 1 ;ILS OR\nLOC  RWY 24R;\n;ksea\n');
    expect(r?.approach).toEqual({
      type: 'ILS',
      runway: '24R',
      airport: 'KSEA',
      note: 'ILS OR LOC RWY 24R',
    });
  });
  it('omits optional keys rather than setting undefined', () => {
    const r = parseApproachCell('1;ILS;;');
    expect(Object.keys(r!.approach)).toEqual(['type']);
  });
  it('drops a LOCAL airport', () => {
    expect(parseApproachCell('1;ILS;28L;local')?.approach.airport).toBeUndefined();
  });
});
