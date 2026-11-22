/**
 * The experience report. See docs/DESIGN.md §8 and `types.ts` for the conventions. Pure.
 */
import { inEngineBucket } from '../aircraft/engines';
import type { CustomFieldDef } from '../importers/presets';
import type { AircraftClass, AircraftType, Entry, Logbook } from '../model';
import { totalLandings } from '../model';
import type { LogbookIndex } from '../query';
import { columnInfo, customFieldId, isSimulatorSection, SECTION_INFO } from './columns';
import { lookBackId, lookBackLabel, lookBackRange } from './periods';
import type {
  ColumnId,
  ColumnInfo,
  Report,
  ReportLayout,
  ReportOptions,
  ReportRow,
  ReportSection,
  SectionId,
} from './types';
import { SECTION_IDS } from './types';

type Flag = 'complex' | 'highPerformance' | 'retractable' | 'taa' | 'pressurized';

/** What a report needs to know about the aircraft an entry was flown in. */
interface Aircraft {
  type: AircraftType | undefined;
  flag(name: Flag): boolean;
}

function aircraftOf(entry: Entry, index: LogbookIndex): Aircraft {
  const type = index.typeOf(entry);
  const overrides = index.airframeOf(entry)?.overrides;
  return { type, flag: (name) => overrides?.[name] ?? type?.[name] ?? false };
}

const MULTI_ENGINE: ReadonlySet<AircraftClass> = new Set(['AMEL', 'AMES']);
const isTurbine = (a: Aircraft) => a.type !== undefined && inEngineBucket(a.type.engine, 'turbine');
const isMultiEngine = (a: Aircraft) => a.type !== undefined && MULTI_ENGINE.has(a.type.class);

/** One entry's amount in one column, before rounding. */
function amount(entry: Entry, column: ColumnId, aircraft: Aircraft): number {
  const d = entry.durations;
  const l = entry.landings;
  switch (column) {
    case 'picNight':
      return Math.min(d.pic, d.night);
    case 'picCrossCountry':
      return Math.min(d.pic, d.crossCountry);
    case 'picInstrument':
      return Math.min(d.pic, d.actualInstrument + d.simulatedInstrument);
    case 'picTurbine':
      return isTurbine(aircraft) ? d.pic : 0;
    case 'picMultiEngine':
      return isMultiEngine(aircraft) ? d.pic : 0;
    case 'dayTakeoffs':
      return entry.dayTakeoffs;
    case 'nightTakeoffs':
      return entry.nightTakeoffs;
    case 'dayLandings':
      return l.dayFullStop + l.dayTouchAndGo;
    case 'nightLandings':
      return l.nightFullStop + l.nightTouchAndGo;
    case 'dayFullStop':
      return l.dayFullStop;
    case 'nightFullStop':
      return l.nightFullStop;
    case 'allLandings':
      return totalLandings(l);
    case 'approaches':
      return entry.approaches.length;
    case 'holds':
      return entry.holds;
    case 'total':
    case 'pic':
    case 'sic':
    case 'crossCountry':
    case 'crossCountry50':
    case 'night':
    case 'actualInstrument':
    case 'simulatedInstrument':
    case 'dualGiven':
    case 'dualReceived':
    case 'solo':
    case 'simulator':
      return d[column];
    default: {
      const value = entry.custom[customFieldId(column) ?? ''];
      if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
      return value === true ? 1 : 0;
    }
  }
}

/** Running sums for one row. */
interface Acc {
  ids: string[];
  values: number[];
  cellIds: string[][];
  /** Flight time (or session length) for ordering rows. */
  weight: number;
}

const newAcc = (n: number): Acc => ({
  ids: [],
  values: new Array<number>(n).fill(0),
  cellIds: Array.from({ length: n }, () => []),
  weight: 0,
});

interface Accumulator {
  add(key: string, entry: Entry, aircraft: Aircraft): void;
  get(key: string): Acc | undefined;
  keys(): string[];
}

function accumulator(
  columns: readonly ColumnInfo[],
  layout: ReportLayout,
  sim: boolean,
): Accumulator {
  const rows = new Map<string, Acc>();
  const perFlight = layout.rounding === 'perFlight';
  return {
    add(key, entry, aircraft) {
      let acc = rows.get(key);
      if (!acc) {
        acc = newAcc(columns.length);
        rows.set(key, acc);
      }
      acc.ids.push(entry.id);
      acc.weight += sim ? entry.durations.simulator : entry.durations.total;
      columns.forEach((c, i) => {
        let v = amount(entry, c.id, aircraft);
        if (perFlight && c.unit === 'minutes') v = Math.round(v / 6) * 6;
        if (v === 0) return;
        (acc.values[i] as number) += v;
        acc.cellIds[i]?.push(entry.id);
      });
    },
    get: (key) => rows.get(key),
    keys: () => [...rows.keys()],
  };
}

function toRow(id: string, label: string, acc: Acc | undefined, n: number): ReportRow {
  const a = acc ?? newAcc(n);
  return {
    id,
    label,
    depth: 0,
    count: a.ids.length,
    entryIds: a.ids,
    cells: a.values.map((value, i) => ({ value, entryIds: a.cellIds[i] ?? [] })),
  };
}

const byWeight =
  (acc: Accumulator) =>
  (a: { id: string; label: string }, b: { id: string; label: string }): number =>
    (acc.get(b.id)?.weight ?? 0) - (acc.get(a.id)?.weight ?? 0) ||
    (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

const TOTAL = '\u0000total';
const UNKNOWN = '\u0000unknown';

/** How one section sorts entries into rows. */
interface SectionPlan {
  /** Row keys an entry counts under; may be several (characteristics) or none. */
  keysOf(entry: Entry, aircraft: Aircraft): string[];
  /** Rows to print, in order, built once every entry has been added. */
  rows(acc: Accumulator, n: number): ReportRow[];
  hasTotal: boolean;
}

const CHARACTERISTICS: { id: string; label: string; test: (a: Aircraft) => boolean }[] = [
  { id: 'complex', label: 'Complex', test: (a) => a.flag('complex') },
  { id: 'highPerformance', label: 'High performance', test: (a) => a.flag('highPerformance') },
  { id: 'retractable', label: 'Retractable', test: (a) => a.flag('retractable') },
  { id: 'taa', label: 'TAA', test: (a) => a.flag('taa') },
  { id: 'pressurized', label: 'Pressurized', test: (a) => a.flag('pressurized') },
  { id: 'tailwheel', label: 'Tailwheel', test: (a) => a.type?.tailwheel ?? false },
  { id: 'multiEngine', label: 'Multi-engine', test: isMultiEngine },
  { id: 'multiPilot', label: 'Multi-pilot', test: (a) => a.type?.multiPilot ?? false },
  { id: 'turbine', label: 'Turbine', test: isTurbine },
  {
    id: 'turbojetPowered',
    label: 'Turbojet-powered',
    test: (a) => a.type !== undefined && inEngineBucket(a.type.engine, 'turbojet-powered'),
  },
];

const CLASS_LABELS: Record<AircraftClass, string> = {
  ASEL: 'ASEL',
  AMEL: 'AMEL',
  ASES: 'ASES',
  AMES: 'AMES',
  helicopter: 'Helicopter',
  gyroplane: 'Gyroplane',
  other: 'Other',
};

const ENGINE_LABELS: Record<string, string> = {
  piston: 'Piston',
  turboprop: 'Turboprop',
  turbofan: 'Turbofan',
  turbojet: 'Turbojet',
  turboshaft: 'Turboshaft',
  electric: 'Electric',
  none: 'None',
};

const RULE_ROWS = [
  { id: '121', label: 'Part 121' },
  { id: '135', label: 'Part 135' },
  { id: '91', label: 'Part 91' },
  { id: 'other', label: 'Other' },
];

const LEVELS = ['FFS', 'FTD', 'AATD', 'BATD'];

/** Rows in a fixed order, skipping ones with no entries. */
function fixedRows(list: { id: string; label: string }[]) {
  return (acc: Accumulator, n: number): ReportRow[] =>
    list.flatMap((r) => (acc.get(r.id) ? [toRow(r.id, r.label, acc.get(r.id), n)] : []));
}

/** Rows sorted by time, largest first, labelled by `labelOf`. */
function weightedRows(labelOf: (key: string) => string) {
  return (acc: Accumulator, n: number): ReportRow[] =>
    acc
      .keys()
      .filter((k) => k !== TOTAL)
      .map((id) => ({ id, label: labelOf(id) }))
      .sort(byWeight(acc))
      .map((r) => toRow(r.id, r.label, acc.get(r.id), n));
}

/** The type key under the layout's grouping. */
function groupKey(type: AircraftType | undefined, layout: ReportLayout): string {
  if (!type) return UNKNOWN;
  if (layout.typeGrouping === 'icao') return type.icaoDesignator ?? type.id;
  if (layout.typeGrouping === 'typeRating') return type.typeRating ?? type.id;
  return type.id;
}

function typePlan(logbook: Logbook, layout: ReportLayout, unknownLabel: string): SectionPlan {
  const types = new Map(logbook.aircraftTypes.map((t) => [t.id, t]));
  const byVariant = layout.typeGrouping === 'type';
  /** The type a variant was converted from, if it is in the book. */
  const parentOf = (id: string): string | undefined => {
    const parent = types.get(id)?.variantOf;
    return byVariant && parent !== undefined && types.has(parent) ? parent : undefined;
  };
  const familyKey = (id: string) => `family:${id}`;
  const label = (key: string) => (key === UNKNOWN ? unknownLabel : key);

  return {
    hasTotal: true,
    keysOf(_entry, aircraft) {
      const key = groupKey(aircraft.type, layout);
      if (!layout.familyLines || key === UNKNOWN) return [key];
      return [key, familyKey(parentOf(key) ?? key)];
    },
    rows(acc, n) {
      const keys = acc.keys().filter((k) => k !== TOTAL && !k.startsWith('family:'));
      // A type and its converted variants form one group, under the type they came from.
      const groups = new Map<string, string[]>();
      for (const k of keys) {
        const root = parentOf(k) ?? k;
        groups.set(root, [...(groups.get(root) ?? []), k]);
      }
      const weightOf = (members: string[]) =>
        members.reduce((s, m) => s + (acc.get(m)?.weight ?? 0), 0);
      const ordered = [...groups].sort(
        ([a, am], [b, bm]) => weightOf(bm) - weightOf(am) || (a < b ? -1 : a > b ? 1 : 0),
      );

      const rows: ReportRow[] = [];
      for (const [root, members] of ordered) {
        const sorted = [...members].sort((a, b) =>
          a === root
            ? -1
            : b === root
              ? 1
              : byWeight(acc)({ id: a, label: a }, { id: b, label: b }),
        );
        const hasVariants = sorted.some((m) => m !== root);
        const rootFlown = sorted[0] === root;
        if (layout.familyLines && hasVariants) {
          const family = toRow(familyKey(root), `${root} family`, acc.get(familyKey(root)), n);
          rows.push({ ...family, family: true });
        }
        for (const m of sorted) {
          const row = toRow(m, label(m), acc.get(m), n);
          const sub = (layout.familyLines && hasVariants) || (m !== root && rootFlown);
          rows.push(sub ? { ...row, depth: 1 } : row);
        }
      }
      return rows;
    },
  };
}

function planFor(
  section: SectionId,
  logbook: Logbook,
  index: LogbookIndex,
  layout: ReportLayout,
): SectionPlan {
  switch (section) {
    case 'characteristics':
      return {
        hasTotal: false,
        keysOf: (_e, a) => CHARACTERISTICS.filter((c) => c.test(a)).map((c) => c.id),
        rows: fixedRows(CHARACTERISTICS),
      };
    case 'categoryClass':
      return {
        hasTotal: true,
        keysOf: (_e, a) => [a.type?.class ?? UNKNOWN],
        rows: weightedRows((k) =>
          k === UNKNOWN ? 'Not known' : (CLASS_LABELS[k as AircraftClass] ?? k),
        ),
      };
    case 'engine':
      return {
        hasTotal: true,
        keysOf: (_e, a) => [a.type?.engine ?? UNKNOWN],
        rows: weightedRows((k) => (k === UNKNOWN ? 'Not known' : (ENGINE_LABELS[k] ?? k))),
      };
    case 'rule':
      return { hasTotal: true, keysOf: (e) => [e.rule], rows: fixedRows(RULE_ROWS) };
    case 'types':
      return typePlan(logbook, layout, 'Type not known');
    case 'simulatorLevels':
      return {
        hasTotal: true,
        keysOf: (e) => [index.deviceOf(e)?.level ?? UNKNOWN],
        rows: fixedRows([
          ...LEVELS.map((l) => ({ id: l, label: l })),
          { id: UNKNOWN, label: 'Level not stated' },
        ]),
      };
    case 'simulatorTypes':
      return {
        hasTotal: true,
        // A device may name a type the book has no record of (ForeFlight's bare `C172`).
        keysOf: (e, a) => [
          a.type === undefined
            ? (index.deviceOf(e)?.represents ?? UNKNOWN)
            : groupKey(a.type, layout),
        ],
        rows: weightedRows((k) => (k === UNKNOWN ? 'Type not stated' : k)),
      };
    case 'recent':
      throw new Error('recent is built separately');
  }
}

/**
 * Removes zero rows and columns unless the layout asks for them. Look-backs keep every row
 * and their first column: "none in the last 90 days" is an answer.
 */
function trim(section: ReportSection, isRecent: boolean): ReportSection {
  const all = section.total ? [...section.rows, section.total] : section.rows;
  const keep = section.columns.map(
    (_, i) => (isRecent && i === 0) || all.some((r) => (r.cells[i]?.value ?? 0) !== 0),
  );
  const pick = (r: ReportRow): ReportRow => ({ ...r, cells: r.cells.filter((_, i) => keep[i]) });
  const rows = section.rows.map(pick).filter((r) => isRecent || r.cells.some((c) => c.value !== 0));
  return {
    ...section,
    columns: section.columns.filter((_, i) => keep[i]),
    rows,
    total: section.total && pick(section.total),
  };
}

function resolveColumns(
  section: SectionId,
  layout: ReportLayout,
  customFields: readonly CustomFieldDef[],
): ColumnInfo[] {
  const sim = isSimulatorSection(section);
  const seen = new Set<ColumnId>();
  return layout.sections[section].columns.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const info = columnInfo(id, customFields);
    if (!info) return [];
    const simOnly = id === 'simulator';
    const simAllowed =
      simOnly ||
      id === 'simulatedInstrument' ||
      id === 'dualGiven' ||
      id === 'dualReceived' ||
      id === 'approaches' ||
      id === 'holds';
    if (sim ? !simAllowed : simOnly) return [];
    return [info];
  });
}

function inRange(date: string, from: string | undefined, to: string | undefined): boolean {
  if (from === undefined && to === undefined) return true;
  if (date === '') return false;
  return (from === undefined || date >= from) && (to === undefined || date <= to);
}

/**
 * Builds the experience report for `logbook` under `layout`.
 *
 * Flights are counted under the type their aircraft had on the day. Deleted entries and
 * ground sessions are never counted. Hidden rows still count toward totals.
 */
export function experienceReport(
  logbook: Logbook,
  index: LogbookIndex,
  layout: ReportLayout,
  options: ReportOptions & { customFields?: readonly CustomFieldDef[] },
): Report {
  const customFields = options.customFields ?? [];
  const from = layout.period.kind === 'range' ? layout.period.from : undefined;
  const to = layout.period.kind === 'range' ? layout.period.to : undefined;
  const asOf = layout.asOf ?? to ?? options.today;
  const ruleOk = (e: Entry) => layout.rules.length === 0 || layout.rules.includes(e.rule);

  const live = logbook.entries.filter((e) => e.deletedAt === undefined);
  const flightsAnyDate = live.filter((e) => e.kind === 'flight' && ruleOk(e));
  const flights = flightsAnyDate.filter((e) => inRange(e.date, from, to));
  const sessions = live.filter((e) => e.kind === 'simulator' && inRange(e.date, from, to));

  const aircraft = new Map<string, Aircraft>();
  const aircraftFor = (e: Entry): Aircraft => {
    let a = aircraft.get(e.id);
    if (!a) {
      a = aircraftOf(e, index);
      aircraft.set(e.id, a);
    }
    return a;
  };

  const sections: ReportSection[] = [];
  for (const id of SECTION_IDS) {
    const sectionLayout = layout.sections[id];
    if (!sectionLayout.on) continue;
    const columns = resolveColumns(id, layout, customFields);
    if (columns.length === 0) continue;
    const info = SECTION_INFO[id];
    const n = columns.length;
    let section: ReportSection;

    if (id === 'recent') {
      const rows = layout.lookBacks.map((lb): ReportRow => {
        const range = lookBackRange(asOf, lb);
        const acc = accumulator(columns, layout, false);
        for (const e of flightsAnyDate) {
          if (inRange(e.date, range.from, range.to)) acc.add(TOTAL, e, aircraftFor(e));
        }
        return { ...toRow(lookBackId(lb), lookBackLabel(lb), acc.get(TOTAL), n), range };
      });
      section = { id, ...info, columns, rows };
    } else {
      const sim = isSimulatorSection(id);
      const plan = planFor(id, logbook, index, layout);
      const acc = accumulator(columns, layout, sim);
      for (const e of sim ? sessions : flights) {
        const a = aircraftFor(e);
        for (const k of plan.keysOf(e, a)) acc.add(k, e, a);
        if (plan.hasTotal) acc.add(TOTAL, e, a);
      }
      const rows = plan.rows(acc, n);
      if (rows.length === 0) continue;
      section = { id, ...info, columns, rows };
      if (plan.hasTotal) section.total = toRow('total', 'Total', acc.get(TOTAL), n);
    }

    const hidden = new Set(sectionLayout.hiddenRows);
    section.rows = section.rows.filter((r) => !hidden.has(r.id));
    if (!layout.showEmpty) section = trim(section, id === 'recent');
    if (section.rows.length > 0 && section.columns.length > 0) sections.push(section);
  }

  let first: string | undefined;
  let last: string | undefined;
  for (const e of [...flights, ...sessions]) {
    if (e.date === '') continue;
    if (first === undefined || e.date < first) first = e.date;
    if (last === undefined || e.date > last) last = e.date;
  }

  const report: Report = {
    period: layout.period,
    asOf,
    rounding: layout.rounding,
    rules: layout.rules,
    sections,
  };
  if (first !== undefined && last !== undefined) report.covered = { from: first, to: last };
  return report;
}
