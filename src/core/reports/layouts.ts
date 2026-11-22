/** Built-in report layouts and reading a stored one back safely. */
import type { OperatingRule } from '../model';
import { isIsoDate } from './periods';
import type {
  ColumnId,
  LookBack,
  NamedLayout,
  ReportLayout,
  ReportPeriod,
  SectionId,
  SectionLayout,
} from './types';
import { SECTION_IDS } from './types';

const on = (columns: ColumnId[]): SectionLayout => ({ on: true, columns, hiddenRows: [] });
const off = (columns: ColumnId[]): SectionLayout => ({ ...on(columns), on: false });

const STANDARD_LOOK_BACKS: LookBack[] = [
  { unit: 'days', count: 90 },
  { unit: 'months', count: 6 },
  { unit: 'months', count: 12 },
  { unit: 'months', count: 24 },
  { unit: 'months', count: 36 },
  { unit: 'months', count: 60 },
];

/** Everything ForeFlight's report has, plus recent experience and the operating rule. */
export const FULL_LAYOUT: ReportLayout = {
  period: { kind: 'all' },
  rules: [],
  rounding: 'total',
  showEmpty: false,
  typeGrouping: 'type',
  familyLines: false,
  lookBacks: STANDARD_LOOK_BACKS,
  sections: {
    recent: on([
      'total',
      'pic',
      'sic',
      'night',
      'actualInstrument',
      'approaches',
      'dayLandings',
      'nightLandings',
    ]),
    characteristics: on(['total', 'pic']),
    categoryClass: on(['total', 'pic']),
    engine: on(['total', 'pic']),
    rule: on(['total', 'pic', 'sic']),
    types: on([
      'total',
      'dayLandings',
      'nightLandings',
      'pic',
      'sic',
      'crossCountry',
      'actualInstrument',
      'simulatedInstrument',
      'night',
      'dualGiven',
      'dualReceived',
    ]),
    simulatorLevels: on(['simulator', 'simulatedInstrument']),
    simulatorTypes: on(['simulator', 'simulatedInstrument', 'dualGiven', 'dualReceived']),
  },
};

/** What an airline application usually asks for. */
export const AIRLINE_LAYOUT: ReportLayout = {
  ...FULL_LAYOUT,
  familyLines: true,
  lookBacks: [
    { unit: 'days', count: 90 },
    { unit: 'months', count: 12 },
    { unit: 'months', count: 24 },
    { unit: 'months', count: 36 },
  ],
  sections: {
    recent: on(['total', 'pic', 'sic', 'picTurbine', 'picMultiEngine']),
    characteristics: on(['total', 'pic']),
    categoryClass: on(['total', 'pic', 'sic']),
    engine: off(['total', 'pic']),
    rule: on(['total', 'pic', 'sic']),
    types: on([
      'total',
      'pic',
      'sic',
      'crossCountry',
      'night',
      'actualInstrument',
      'simulatedInstrument',
      'dayLandings',
      'nightLandings',
    ]),
    simulatorLevels: on(['simulator']),
    simulatorTypes: off(['simulator', 'simulatedInstrument']),
  },
};

/**
 * ForeFlight's own figures: grouped by ICAO designator, each flight rounded to a tenth, day
 * and night landings full-stop only. For checking against ForeFlight's Experience Report.
 */
export const FOREFLIGHT_LAYOUT: ReportLayout = {
  ...FULL_LAYOUT,
  rounding: 'perFlight',
  typeGrouping: 'icao',
  sections: {
    ...FULL_LAYOUT.sections,
    recent: off(FULL_LAYOUT.sections.recent.columns),
    rule: off(FULL_LAYOUT.sections.rule.columns),
    types: on([
      'total',
      'dayFullStop',
      'nightFullStop',
      'allLandings',
      'pic',
      'sic',
      'crossCountry',
      'actualInstrument',
      'simulatedInstrument',
      'night',
      'dualGiven',
      'dualReceived',
    ]),
  },
};

export const BUILT_IN_LAYOUTS: readonly NamedLayout[] = [
  { id: 'builtin:full', name: 'Everything', layout: FULL_LAYOUT },
  { id: 'builtin:airline', name: 'Airline application', layout: AIRLINE_LAYOUT },
  { id: 'builtin:foreflight', name: 'Like ForeFlight', layout: FOREFLIGHT_LAYOUT },
];

const RULES: readonly OperatingRule[] = ['91', '121', '135', 'other'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

function readPeriod(v: unknown): ReportPeriod {
  if (!isRecord(v) || v.kind !== 'range') return { kind: 'all' };
  const period: ReportPeriod = { kind: 'range' };
  if (isIsoDate(v.from)) period.from = v.from;
  if (isIsoDate(v.to)) period.to = v.to;
  return period;
}

function readLookBacks(v: unknown, fallback: LookBack[]): LookBack[] {
  if (!Array.isArray(v)) return fallback;
  return v.flatMap((lb): LookBack[] =>
    isRecord(lb) &&
    (lb.unit === 'days' || lb.unit === 'months') &&
    typeof lb.count === 'number' &&
    Number.isInteger(lb.count) &&
    lb.count > 0
      ? [{ unit: lb.unit, count: lb.count }]
      : [],
  );
}

function readSection(v: unknown, fallback: SectionLayout): SectionLayout {
  if (!isRecord(v)) return fallback;
  return {
    on: typeof v.on === 'boolean' ? v.on : fallback.on,
    columns: Array.isArray(v.columns) ? (strings(v.columns) as ColumnId[]) : fallback.columns,
    hiddenRows: strings(v.hiddenRows),
  };
}

/**
 * A layout from storage, with anything missing or malformed taken from `fallback`. Unknown
 * column ids are kept: the report ignores them, and a custom field may be defined again later.
 */
export function completeLayout(
  stored: unknown,
  fallback: ReportLayout = FULL_LAYOUT,
): ReportLayout {
  if (!isRecord(stored)) return fallback;
  const sections = isRecord(stored.sections) ? stored.sections : {};
  const layout: ReportLayout = {
    period: readPeriod(stored.period),
    rules: RULES.filter((r) => strings(stored.rules).includes(r)),
    rounding: stored.rounding === 'perFlight' ? 'perFlight' : 'total',
    showEmpty: stored.showEmpty === true,
    typeGrouping:
      stored.typeGrouping === 'icao' || stored.typeGrouping === 'typeRating'
        ? stored.typeGrouping
        : 'type',
    familyLines: stored.familyLines === true,
    lookBacks: readLookBacks(stored.lookBacks, fallback.lookBacks),
    sections: Object.fromEntries(
      SECTION_IDS.map((id) => [id, readSection(sections[id], fallback.sections[id])]),
    ) as Record<SectionId, SectionLayout>,
  };
  if (isIsoDate(stored.asOf)) layout.asOf = stored.asOf;
  return layout;
}

/** Named layouts from storage; malformed ones are dropped. */
export function completeNamedLayouts(stored: unknown): NamedLayout[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((v): NamedLayout[] =>
    isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string'
      ? [{ id: v.id, name: v.name, layout: completeLayout(v.layout) }]
      : [],
  );
}

/** The same layout with no row hidden, for listing every row a section could show. */
export function showAllRows(layout: ReportLayout): ReportLayout {
  const sections = { ...layout.sections };
  for (const id of SECTION_IDS) sections[id] = { ...sections[id], hiddenRows: [] };
  return { ...layout, sections };
}
