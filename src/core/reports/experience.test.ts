import { describe, expect, it } from 'vitest';
import type { CustomFieldDef } from '../importers/presets';
import type { Entry, Logbook } from '../model';
import { indexLogbook } from '../query';
import { makeAirframe, makeEntry, makeLogbook, makeType } from '../validation/testing';
import { experienceReport } from './experience';
import { FULL_LAYOUT } from './layouts';
import type {
  ColumnId,
  Report,
  ReportLayout,
  ReportSection,
  SectionId,
  SectionLayout,
} from './types';
import { SECTION_IDS } from './types';

const CUSTOM: CustomFieldDef[] = [
  { id: 'dgPpl', label: 'Dual given, private', short: 'DG-PPL', kind: 'duration' },
  { id: 'pax', label: 'Passengers', short: 'Pax', kind: 'count' },
  { id: 'flag', label: 'Flagged', short: 'Flag', kind: 'toggle' },
  { id: 'note', label: 'Note', short: 'Note', kind: 'text' },
];

const C172 = makeType({ id: 'C-172S', icaoDesignator: 'C172', class: 'ASEL', engine: 'piston' });
const C172R = makeType({ id: 'C-172R', icaoDesignator: 'C172', class: 'ASEL', engine: 'piston' });
const ARROW = makeType({
  id: 'PA-28R',
  icaoDesignator: 'P28R',
  complex: true,
  retractable: true,
});
const CRJ7 = makeType({
  id: 'CRJ-700',
  icaoDesignator: 'CRJ7',
  class: 'AMEL',
  engine: 'turbofan',
  typeRating: 'CL-65',
  multiPilot: true,
  pressurized: true,
  retractable: true,
});
const CRJ5 = { ...CRJ7, id: 'CRJ-550', variantOf: 'CRJ-700' };
const CRJ2 = { ...CRJ7, id: 'CRJ-200', icaoDesignator: 'CRJ2' };

const logbook: Logbook = makeLogbook({
  aircraftTypes: [C172, C172R, ARROW, CRJ7, CRJ5, CRJ2],
  airframes: [
    makeAirframe({ id: 'sky', configurations: [{ value: 'C-172S' }], overrides: { taa: true } }),
    makeAirframe({ id: 'old', configurations: [{ value: 'C-172R' }] }),
    makeAirframe({ id: 'arrow', configurations: [{ value: 'PA-28R' }] }),
    makeAirframe({
      id: 'crj',
      configurations: [
        { value: 'CRJ-700', to: '2025-03-09' },
        { value: 'CRJ-550', from: '2025-03-10' },
      ],
    }),
    makeAirframe({ id: 'crj2', configurations: [{ value: 'CRJ-200' }] }),
  ],
  devices: [
    { id: 'ffs', name: 'FFS', level: 'FFS', represents: 'CRJ-700' },
    { id: 'aatd', name: 'AATD', level: 'AATD', represents: 'C172' },
    { id: 'mystery', name: 'Box', level: 'BATD' },
  ],
  entries: [
    // Skyhawk (TAA by airframe): 1.04 h PIC, a night touch-and-go, custom fields.
    makeEntry({
      id: 'g1',
      date: '2024-01-10',
      airframeId: 'sky',
      durations: { total: 62, pic: 62, night: 20, crossCountry: 62, dualGiven: 62 },
      landings: { dayFullStop: 1, nightTouchAndGo: 2 },
      custom: { dgPpl: 62, pax: 2, flag: true, note: 'x' },
    }),
    makeEntry({
      id: 'g2',
      date: '2024-02-10',
      airframeId: 'old',
      durations: { total: 33, pic: 33 },
      custom: { pax: 1, flag: false },
    }),
    makeEntry({
      id: 'g3',
      date: '2024-03-10',
      airframeId: 'arrow',
      durations: { total: 90, pic: 0, dualReceived: 90 },
    }),
    // CRJ-700 before conversion, SIC; then the same airframe as a CRJ-550, PIC.
    makeEntry({
      id: 'j1',
      date: '2025-03-01',
      rule: '121',
      airframeId: 'crj',
      durations: { total: 125, pic: 0, sic: 125, night: 30, actualInstrument: 15 },
      approaches: [{ type: 'ILS', runway: '24R' }],
      landings: { dayFullStop: 0 },
      dayTakeoffs: 0,
    }),
    makeEntry({
      id: 'j2',
      date: '2025-03-20',
      rule: '121',
      airframeId: 'crj',
      durations: { total: 100, pic: 100, night: 40, crossCountry: 100 },
    }),
    makeEntry({
      id: 'j3',
      date: '2025-04-01',
      rule: '121',
      airframeId: 'crj2',
      durations: { total: 50, pic: 0, sic: 50 },
    }),
    // Simulators: one by a known type, one by a type the book has no record of, one unknown.
    makeEntry({
      id: 's1',
      kind: 'simulator',
      date: '2024-05-01',
      airframeId: undefined,
      deviceId: 'ffs',
      durations: { total: 0, pic: 0, simulator: 240, simulatedInstrument: 60, dualReceived: 240 },
      landings: { dayFullStop: 0 },
    }),
    makeEntry({
      id: 's2',
      kind: 'simulator',
      date: '2024-05-02',
      airframeId: undefined,
      deviceId: 'aatd',
      durations: { total: 0, pic: 0, simulator: 90, simulatedInstrument: 90 },
    }),
    makeEntry({
      id: 's3',
      kind: 'simulator',
      date: '2024-05-03',
      airframeId: undefined,
      deviceId: 'mystery',
      durations: { total: 0, pic: 0, simulator: 30 },
    }),
    // Never counted: ground training and a deleted flight.
    makeEntry({
      id: 'x1',
      kind: 'ground',
      date: '2024-06-01',
      airframeId: undefined,
      durations: { total: 0, pic: 0, groundTraining: 120 },
    }),
    makeEntry({
      id: 'x2',
      date: '2024-06-02',
      airframeId: 'sky',
      durations: { total: 600, pic: 600 },
      deletedAt: '2024-06-03T00:00Z',
    }),
  ],
});
const index = indexLogbook(logbook);

/** A layout with only `sections` on, each showing `columns`. */
function only(
  sections: Partial<Record<SectionId, ColumnId[]>>,
  extra: Partial<ReportLayout> = {},
): ReportLayout {
  return {
    ...FULL_LAYOUT,
    showEmpty: true,
    ...extra,
    sections: Object.fromEntries(
      SECTION_IDS.map((id): [SectionId, SectionLayout] => [
        id,
        { on: sections[id] !== undefined, columns: sections[id] ?? [], hiddenRows: [] },
      ]),
    ) as ReportLayout['sections'],
  };
}

const run = (layout: ReportLayout): Report =>
  experienceReport(logbook, index, layout, { today: '2025-06-30', customFields: CUSTOM });

function section(report: Report, id: SectionId): ReportSection {
  const s = report.sections.find((x) => x.id === id);
  if (!s) throw new Error(`no section ${id}`);
  return s;
}

/** `{ rowId: [values…] }`, total row as `total`. */
function table(s: ReportSection): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const r of [...s.rows, ...(s.total ? [s.total] : [])]) {
    out[r.family ? `family ${r.id}` : r.id] = r.cells.map((c) => c.value);
  }
  return out;
}

describe('experienceReport: by type', () => {
  const layout = only({ types: ['total', 'pic', 'sic', 'night'] });

  it('counts each flight under the type its airframe had that day, variants as sub-lines', () => {
    const s = section(run(layout), 'types');
    expect(s.rows.map((r) => [r.id, r.depth, r.count])).toEqual([
      ['CRJ-700', 0, 1],
      ['CRJ-550', 1, 1],
      ['PA-28R', 0, 1],
      ['C-172S', 0, 1],
      ['CRJ-200', 0, 1],
      ['C-172R', 0, 1],
    ]);
    expect(table(s)).toMatchObject({
      'CRJ-700': [125, 0, 125, 30],
      'CRJ-550': [100, 100, 0, 40],
      total: [460, 195, 175, 90],
    });
  });

  it('never counts simulator, ground or deleted entries as flight time', () => {
    const s = section(run(layout), 'types');
    expect(s.total?.count).toBe(6);
    expect(s.total?.entryIds).not.toContain('s1');
    expect(s.total?.entryIds).not.toContain('x1');
    expect(s.total?.entryIds).not.toContain('x2');
  });

  it('adds a family line above a type and its variants, kept out of the total', () => {
    const s = section(run({ ...layout, familyLines: true }), 'types');
    expect(s.rows.slice(0, 3).map((r) => [r.id, r.label, r.depth, r.family ?? false])).toEqual([
      ['family:CRJ-700', 'CRJ-700 family', 0, true],
      ['CRJ-700', 'CRJ-700', 1, false],
      ['CRJ-550', 'CRJ-550', 1, false],
    ]);
    expect(s.rows[0]?.cells[0]?.value).toBe(225);
    expect(s.total?.cells[0]?.value).toBe(460);
  });

  it('shows a variant flown without its parent at the top level, or under a family line', () => {
    const only550 = { ...logbook, entries: logbook.entries.filter((e) => e.id === 'j2') };
    const report = (familyLines: boolean) =>
      experienceReport(
        only550,
        indexLogbook(only550),
        { ...layout, familyLines },
        {
          today: '2025-06-30',
        },
      );
    expect(section(report(false), 'types').rows.map((r) => [r.id, r.depth])).toEqual([
      ['CRJ-550', 0],
    ]);
    expect(section(report(true), 'types').rows.map((r) => [r.id, r.depth])).toEqual([
      ['family:CRJ-700', 0],
      ['CRJ-550', 1],
    ]);
  });

  it('groups by ICAO designator or by type rating', () => {
    const icao = section(run({ ...layout, typeGrouping: 'icao' }), 'types');
    expect(table(icao)).toMatchObject({ CRJ7: [225, 100, 125, 70], C172: [95, 95, 0, 20] });
    expect(icao.rows.every((r) => r.depth === 0)).toBe(true);
    const rating = section(run({ ...layout, typeGrouping: 'typeRating' }), 'types');
    expect(table(rating)).toMatchObject({
      'CL-65': [275, 100, 175, 70],
      'C-172S': [62, 62, 0, 20],
    });
  });

  it('keeps the entry ids behind every cell, only where the entry adds something', () => {
    const s = section(run(layout), 'types');
    const crj7 = s.rows.find((r) => r.id === 'CRJ-700');
    expect(crj7?.entryIds).toEqual(['j1']);
    expect(crj7?.cells.map((c) => c.entryIds)).toEqual([['j1'], [], ['j1'], ['j1']]);
    expect(s.total?.cells[1]?.entryIds).toEqual(['g1', 'g2', 'j2']);
  });

  it('orders types by flight time, largest first', () => {
    const s = section(run(layout), 'types');
    const weights = s.rows.filter((r) => r.depth === 0).map((r) => r.cells[0]?.value ?? 0);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });
});

describe('experienceReport: columns', () => {
  it('counts landings with and without touch-and-goes, takeoffs, approaches', () => {
    const s = section(
      run(
        only({
          types: [
            'dayLandings',
            'nightLandings',
            'dayFullStop',
            'nightFullStop',
            'allLandings',
            'dayTakeoffs',
            'approaches',
          ],
        }),
      ),
      'types',
    );
    expect(table(s)['C-172S']).toEqual([1, 2, 1, 0, 3, 1, 0]);
    expect(table(s)['CRJ-700']).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it('works out PIC night, PIC cross-country, PIC turbine and PIC multi-engine per flight', () => {
    const s = section(
      run(only({ types: ['picNight', 'picCrossCountry', 'picTurbine', 'picMultiEngine'] })),
      'types',
    );
    expect(table(s)['C-172S']).toEqual([20, 62, 0, 0]);
    expect(table(s)['CRJ-550']).toEqual([40, 100, 100, 100]);
    expect(table(s)['CRJ-700']).toEqual([0, 0, 0, 0]);
  });

  it('adds custom durations and counts, counts set toggles, and ignores text fields', () => {
    const s = section(
      run(only({ types: ['custom:dgPpl', 'custom:pax', 'custom:flag', 'custom:note'] })),
      'types',
    );
    expect(s.columns.map((c) => [c.short, c.unit])).toEqual([
      ['DG-PPL', 'minutes'],
      ['Pax', 'count'],
      ['Flag', 'count'],
    ]);
    expect(s.total?.cells.map((c) => c.value)).toEqual([62, 3, 1]);
  });

  it('ignores unknown, duplicate and wrong-section columns', () => {
    const s = section(
      run(only({ types: ['total', 'total', 'simulator', 'custom:gone' as ColumnId] })),
      'types',
    );
    expect(s.columns.map((c) => c.id)).toEqual(['total']);
    const sim = section(run(only({ simulatorLevels: ['simulator', 'pic'] })), 'simulatorLevels');
    expect(sim.columns.map((c) => c.id)).toEqual(['simulator']);
  });
});

describe('experienceReport: rounding', () => {
  const layout = only({ types: ['total', 'pic'] });

  it('adds exact minutes by default', () => {
    expect(section(run(layout), 'types').total?.cells[0]?.value).toBe(460);
  });

  it('rounds each flight to a tenth of an hour first when asked', () => {
    // 62 → 60, 33 → 36, 90, 125 → 126, 100 → 102, 50 → 48.
    const s = section(run({ ...layout, rounding: 'perFlight' }), 'types');
    expect(s.total?.cells[0]?.value).toBe(462);
    expect(table(s)['C-172S']).toEqual([60, 60]);
  });

  it('does not round counts', () => {
    const s = section(run(only({ types: ['custom:pax'] }, { rounding: 'perFlight' })), 'types');
    expect(s.total?.cells[0]?.value).toBe(3);
  });
});

describe('experienceReport: other sections', () => {
  it('lists aircraft characteristics, honouring per-airframe overrides, with no total', () => {
    const s = section(run(only({ characteristics: ['total'] })), 'characteristics');
    expect(table(s)).toEqual({
      complex: [90],
      retractable: [365],
      taa: [62],
      pressurized: [275],
      multiEngine: [275],
      multiPilot: [275],
      turbine: [275],
      turbojetPowered: [275],
    });
    expect(s.total).toBeUndefined();
  });

  it('adds up by class, by engine and by operating rule', () => {
    const report = run(
      only({ categoryClass: ['total', 'pic'], engine: ['total'], rule: ['total', 'sic'] }),
    );
    expect(table(section(report, 'categoryClass'))).toEqual({
      AMEL: [275, 100],
      ASEL: [185, 95],
      total: [460, 195],
    });
    expect(table(section(report, 'engine'))).toEqual({
      turbofan: [275],
      piston: [185],
      total: [460],
    });
    expect(table(section(report, 'rule'))).toEqual({
      '121': [275, 175],
      '91': [185, 0],
      total: [460, 175],
    });
  });

  it('lists simulators by device level and by the type they represent', () => {
    const report = run(
      only({
        simulatorLevels: ['simulator', 'simulatedInstrument'],
        simulatorTypes: ['simulator', 'dualReceived'],
      }),
    );
    const levels = section(report, 'simulatorLevels');
    expect(levels.rows.map((r) => r.label)).toEqual(['FFS', 'AATD', 'BATD']);
    expect(levels.total?.cells.map((c) => c.value)).toEqual([360, 150]);
    const types = section(report, 'simulatorTypes');
    expect(types.rows.map((r) => [r.label, r.count])).toEqual([
      ['CRJ-700', 1],
      ['C172', 1],
      ['Type not stated', 1],
    ]);
    expect(types.countNoun?.many).toBe('sessions');
  });
});

describe('experienceReport: period, rules and recent experience', () => {
  it('limits flights and sessions to the period, inclusive', () => {
    const report = run(
      only(
        { types: ['total'], simulatorLevels: ['simulator'] },
        { period: { kind: 'range', from: '2024-02-10', to: '2025-03-01' } },
      ),
    );
    expect(section(report, 'types').total?.entryIds).toEqual(['g2', 'g3', 'j1']);
    expect(section(report, 'simulatorLevels').total?.count).toBe(3);
    expect(report.covered).toEqual({ from: '2024-02-10', to: '2025-03-01' });
    expect(report.asOf).toBe('2025-03-01');
  });

  it('filters flights by rule but never simulator sessions', () => {
    const report = run(
      only({ types: ['total'], simulatorLevels: ['simulator'] }, { rules: ['121'] }),
    );
    expect(section(report, 'types').total?.entryIds).toEqual(['j1', 'j2', 'j3']);
    expect(section(report, 'simulatorLevels').total?.count).toBe(3);
  });

  it('counts look-backs from the as-of date, both ends inclusive, ignoring the period', () => {
    const report = run(
      only(
        { recent: ['total', 'pic'] },
        {
          period: { kind: 'range', from: '2025-01-01' },
          asOf: '2025-04-01',
          lookBacks: [
            { unit: 'days', count: 12 },
            { unit: 'months', count: 1 },
            { unit: 'months', count: 24 },
          ],
        },
      ),
    );
    const s = section(report, 'recent');
    expect(s.rows.map((r) => [r.id, r.label, r.range, r.cells[0]?.value])).toEqual([
      ['d12', 'Last 12 days', { from: '2025-03-21', to: '2025-04-01' }, 50],
      ['m1', 'Last 1 month', { from: '2025-03-02', to: '2025-04-01' }, 150],
      ['m24', 'Last 24 months', { from: '2023-04-02', to: '2025-04-01' }, 460],
    ]);
    expect(s.total).toBeUndefined();
  });

  it('defaults the as-of date to today, and keeps empty look-backs', () => {
    const report = run(
      only({ recent: ['total'] }, { showEmpty: false, lookBacks: [{ unit: 'days', count: 30 }] }),
    );
    expect(report.asOf).toBe('2025-06-30');
    expect(section(report, 'recent').rows[0]?.cells[0]?.value).toBe(0);
  });
});

describe('experienceReport: hiding', () => {
  it('drops zero rows and columns unless asked to show them', () => {
    const layout = only({ types: ['total', 'solo', 'dualReceived'] }, { showEmpty: false });
    const s = section(run(layout), 'types');
    expect(s.columns.map((c) => c.id)).toEqual(['total', 'dualReceived']);
    const dual = section(run(only({ types: ['dualReceived'] }, { showEmpty: false })), 'types');
    expect(dual.rows.map((r) => r.id)).toEqual(['PA-28R']);
  });

  it('leaves out a section with nothing to show', () => {
    const report = run(only({ types: ['solo'], rule: ['total'] }, { showEmpty: false }));
    expect(report.sections.map((s) => s.id)).toEqual(['rule']);
  });

  it('hides chosen rows but keeps them in the total', () => {
    const layout = only({ types: ['total'] });
    layout.sections.types.hiddenRows = ['CRJ-200'];
    const s = section(run(layout), 'types');
    expect(s.rows.map((r) => r.id)).not.toContain('CRJ-200');
    expect(s.total?.cells[0]?.value).toBe(460);
  });

  it('omits sections that are off', () => {
    const report = run(only({ engine: ['total'] }));
    expect(report.sections.map((s) => s.id)).toEqual(['engine']);
  });
});

describe('experienceReport: a book with nothing in it', () => {
  it('has no sections and no covered dates', () => {
    const empty: Logbook = { ...logbook, entries: [] as Entry[] };
    const report = experienceReport(empty, indexLogbook(empty), FULL_LAYOUT, {
      today: '2025-06-30',
    });
    expect(report.covered).toBeUndefined();
    expect(report.sections.map((s) => s.id)).toEqual(['recent']);
  });
});
