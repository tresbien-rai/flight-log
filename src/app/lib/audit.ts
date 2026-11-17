/** Display and input helpers for the audit screen. Pure; no DOM. */
import { COLUMN_PRESETS, type SourceRecord } from '@core/importers';
import type {
  BulkDecision,
  Decision,
  DecisionField,
  DiffPattern,
  Resolution,
  ResolvedOrphan,
  ResolvedPair,
  Side,
} from '@core/reconcile';
import { formatDecimal, parseDuration } from '@core/time/duration';
import { formatHours, formatInt } from './format';

export const SIDE_LABEL: Record<Side, string> = { a: 'LogTen', b: 'ForeFlight' };

const FIELD_LABELS: Record<string, string> = {
  kind: 'Kind of entry',
  date: 'Date',
  tail: 'Aircraft',
  from: 'From',
  to: 'To',
  localFlight: 'Local flight',
  route: 'Route',
  flightNumber: 'Flight number',
  rule: 'Operating rule',
  pilotFlying: 'Pilot flying',
  people: 'Crew',
  remarks: 'Remarks',
  approaches: 'Approaches',
  landings: 'Landings',
  'clock.out': 'Out',
  'clock.off': 'Off',
  'clock.on': 'On',
  'clock.in': 'In',
  'clock.scheduledOut': 'Scheduled out',
  'clock.scheduledIn': 'Scheduled in',
  'durations.total': 'Total time',
  'durations.pic': 'PIC',
  'durations.sic': 'SIC',
  'durations.solo': 'Solo',
  'durations.night': 'Night',
  'durations.crossCountry': 'Cross-country',
  'durations.crossCountry50': 'Cross-country over 50 NM',
  'durations.actualInstrument': 'Actual instrument',
  'durations.simulatedInstrument': 'Simulated instrument',
  'durations.dualReceived': 'Dual received',
  'durations.dualGiven': 'Dual given',
  'durations.simulator': 'Simulator',
  'durations.groundTraining': 'Ground training',
  'counts.dayTakeoffs': 'Day takeoffs',
  'counts.nightTakeoffs': 'Night takeoffs',
  'counts.holds': 'Holds',
  'counts.goArounds': 'Go-arounds',
  'custom.dualGivenPPL': 'Dual given, private',
  'custom.dualGivenIRA': 'Dual given, instrument',
  'custom.dualGivenCPL': 'Dual given, commercial',
  'custom.passengerCount': 'Passengers',
  'custom.flag': 'Flag',
};

export function fieldLabel(field: DecisionField): string {
  return FIELD_LABELS[field] ?? field.replace(/^custom\./, '');
}

/** How a user-defined field is stored, from the column presets. */
const CUSTOM_TYPES = new Map<string, 'duration' | 'count' | 'toggle' | 'text'>();
for (const columns of Object.values(COLUMN_PRESETS)) {
  for (const mapping of Object.values(columns)) {
    if ('custom' in mapping) CUSTOM_TYPES.set(mapping.custom, mapping.type);
  }
}

export type TypedKind = 'hours' | 'clock' | 'count' | 'date' | 'text';

/** What the pilot may type for a field, or undefined when only the two sides are offered. */
export function typedKind(field: DecisionField): TypedKind | undefined {
  if (field.startsWith('durations.')) return 'hours';
  if (field.startsWith('clock.')) return 'clock';
  if (field.startsWith('counts.')) return 'count';
  if (field.startsWith('custom.')) {
    const type = CUSTOM_TYPES.get(field.slice(7));
    return type === 'duration' ? 'hours' : type === 'count' ? 'count' : undefined;
  }
  if (field === 'date') return 'date';
  if (['tail', 'from', 'to', 'route', 'flightNumber', 'remarks'].includes(field)) return 'text';
  return undefined;
}

export const TYPED_HINT: Record<TypedKind, string> = {
  hours: 'Hours, such as 1.5 or 1:30',
  clock: 'UTC time, such as 14:05',
  count: 'A whole number',
  date: 'Date as YYYY-MM-DD',
  text: 'Text',
};

/** The value to store for typed text, or undefined when it is not valid for the field. */
export function parseTyped(field: DecisionField, text: string): string | number | undefined {
  const input = text.trim();
  switch (typedKind(field)) {
    case 'hours': {
      if (input === '') return undefined;
      const minutes = parseDuration(input);
      return minutes === null || minutes < 0 ? undefined : minutes;
    }
    case 'clock': {
      const m = /^(\d{1,2}):?(\d{2})\s*z?$/i.exec(input);
      if (!m) return undefined;
      const [h, min] = [Number(m[1]), Number(m[2])];
      return h > 23 || min > 59 ? undefined : h * 60 + min;
    }
    case 'count':
      return /^\d+$/.test(input) ? Number(input) : undefined;
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
      if (!m) return undefined;
      const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      return at.getUTCMonth() === Number(m[2]) - 1 ? input : undefined;
    }
    case 'text':
      if (input === '' && !['route', 'flightNumber', 'remarks'].includes(field)) return undefined;
      return input;
    default:
      return undefined;
  }
}

const BLANK = '—';
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}Z`;
const hours = (minutes: number) => formatDecimal(minutes, 2);
const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
const RULE_TEXT: Record<string, string> = {
  '91': 'Part 91',
  '121': 'Part 121',
  '135': 'Part 135',
  other: 'Other',
};
const KIND_TEXT: Record<string, string> = {
  flight: 'Flight',
  simulator: 'Simulator session',
  ground: 'Ground training',
};

function landingsText(r: SourceRecord): string {
  const c = r.counts;
  const parts: string[] = [];
  const add = (label: string, n: number | undefined) => {
    if (n !== undefined) parts.push(`${label} ${n}`);
  };
  add('day', c.dayLandings);
  add('night', c.nightLandings);
  add('day full-stop', c.dayFullStopLandings);
  add('night full-stop', c.nightFullStopLandings);
  add('full-stop', c.fullStopLandings);
  add('touch-and-go', c.touchAndGoes);
  add('all', c.allLandings);
  return parts.length > 0 ? parts.join(' · ') : BLANK;
}

/** A typed value shown the way a side's value would be. */
export function displayTyped(field: DecisionField, value: string | number | boolean): string {
  if (typeof value === 'boolean') return yesNo(value);
  if (typeof value === 'string') return value === '' ? BLANK : value;
  const kind = typedKind(field);
  return kind === 'hours' ? hours(value) : kind === 'clock' ? clock(value) : String(value);
}

/** What one app says about a field, for people to read. */
export function displayValue(r: SourceRecord, field: DecisionField): string {
  switch (field) {
    case 'landings':
      return landingsText(r);
    case 'approaches':
      return r.approaches.length === 0
        ? BLANK
        : r.approaches
            .map((x) => [x.type, x.runway, x.airport].filter((part) => part).join(' '))
            .join(', ');
    case 'people':
      return r.people.length === 0
        ? BLANK
        : r.people.map((p) => `${p.name} (${p.role})`).join(', ');
    case 'kind':
      return KIND_TEXT[r.kind] ?? r.kind;
    case 'rule':
      return r.rule === undefined ? BLANK : (RULE_TEXT[r.rule] ?? r.rule);
    case 'pilotFlying':
    case 'localFlight': {
      const v = r[field];
      return v === undefined ? BLANK : yesNo(v);
    }
  }
  const dot = field.indexOf('.');
  if (dot < 0) {
    const v = (r as unknown as Record<string, unknown>)[field];
    return typeof v === 'string' && v !== '' ? v : BLANK;
  }
  const group = field.slice(0, dot);
  const key = field.slice(dot + 1);
  const v = (r as unknown as Record<string, Record<string, unknown>>)[group]?.[key];
  if (v === undefined) return BLANK;
  if (typeof v === 'boolean') return yesNo(v);
  if (typeof v === 'number') return displayTyped(field, v);
  return String(v);
}

/** `KAAA → KBBB`, `KAAA local`, or the kind of session when there is no route. */
export function routeText(r: SourceRecord): string {
  if (r.from === undefined && r.to === undefined) return KIND_TEXT[r.kind] ?? r.kind;
  if (r.localFlight === true || r.to === undefined) return `${r.from ?? '?'} local`;
  return `${r.from ?? '?'} → ${r.to}`;
}

const TIER_TEXT: Record<string, string> = {
  'date-adjacent': 'dates a day apart',
  'tail-differs': 'different aircraft',
  'route-differs': 'different airports',
  'date-differs': 'different dates',
  session: 'sessions on the same day',
  manual: 'paired by hand',
};

export function tierText(tier: string): string {
  return TIER_TEXT[tier] ?? tier;
}

// --- list ------------------------------------------------------------------------------------

export interface AuditItem {
  /** The entry id: also the URL key. */
  id: string;
  date: string;
  tail: string;
  route: string;
  pair?: ResolvedPair;
  orphan?: ResolvedOrphan;
  /** Decision fields still undecided. */
  openFields: DecisionField[];
  /** The pairing itself needs confirming, or the orphan needs keep / drop. */
  openItself: boolean;
  /** The pilot has decided something here (not counting bulk rules). */
  touched: boolean;
}

/** Everything worth showing: pairs that differ in meaning or need confirming, and all orphans. */
export function auditItems(resolution: Resolution): AuditItem[] {
  const items: AuditItem[] = [];
  for (const pair of resolution.pairs) {
    const live = pair.fields.filter((f) => f.class !== 'equivalent' || f.by === 'pair');
    if (live.length === 0 && pair.match === 'exact') continue;
    items.push({
      id: pair.entryId,
      date: pair.a.date,
      tail: pair.a.tail ?? '',
      route: routeText(pair.a),
      pair,
      openFields: live.filter((f) => f.by === 'undecided').map((f) => f.field),
      openItself: pair.match === 'unconfirmed',
      touched:
        live.some((f) => f.by === 'pair') || pair.match === 'confirmed' || pair.match === 'manual',
    });
  }
  for (const orphan of resolution.orphans) {
    items.push({
      id: orphan.entryId,
      date: orphan.record.date,
      tail: orphan.record.tail ?? '',
      route: routeText(orphan.record),
      orphan,
      openFields: [],
      openItself: orphan.action === 'undecided',
      touched: orphan.action !== 'undecided',
    });
  }
  return items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

export const isOpen = (item: AuditItem): boolean => item.openItself || item.openFields.length > 0;

// --- rules -----------------------------------------------------------------------------------

export interface RuleStat {
  /** Fields this rule would settle if switched on. */
  open: number;
  /** Fields it settles now. */
  settled: number;
}

/** Counts per bulk-rule key (`decisionKey` form, pattern-wide rules as `bulk:<pattern>:*`). */
export function ruleStats(resolution: Resolution): Map<string, RuleStat> {
  const stats = new Map<string, RuleStat>();
  const bump = (key: string, what: keyof RuleStat) => {
    const stat = stats.get(key) ?? { open: 0, settled: 0 };
    stat[what]++;
    stats.set(key, stat);
  };
  for (const pair of resolution.pairs) {
    for (const f of pair.fields) {
      if (f.class === 'equivalent' || f.by === 'pair') continue;
      const what = f.by === 'bulk' ? 'settled' : 'open';
      if (f.pattern) {
        bump(`bulk:${f.pattern}:*`, what);
        bump(`bulk:${f.pattern}:${f.field}`, what);
      } else {
        bump(`bulk:real:${f.field}`, what);
      }
    }
  }
  return stats;
}

export function findBulk(
  decisions: readonly Decision[],
  pattern: DiffPattern | 'real',
  field?: DecisionField,
): BulkDecision | undefined {
  return decisions.find(
    (d): d is BulkDecision => d.kind === 'bulk' && d.pattern === pattern && d.field === field,
  );
}

// --- totals ----------------------------------------------------------------------------------

export interface TotalsRow {
  label: string;
  a: string;
  b: string;
  merged: string;
}

function sums(records: readonly SourceRecord[]) {
  const out = { flights: 0, total: 0, pic: 0, sic: 0, night: 0, actual: 0, sim: 0, landings: 0 };
  for (const r of records) {
    const d = r.durations;
    if (r.kind === 'flight') {
      out.flights++;
      out.total += d.total ?? 0;
    }
    out.pic += d.pic ?? 0;
    out.sic += d.sic ?? 0;
    out.night += d.night ?? 0;
    out.actual += d.actualInstrument ?? 0;
    out.sim += d.simulator ?? 0;
    const c = r.counts;
    out.landings +=
      c.allLandings ??
      (c.dayLandings !== undefined || c.nightLandings !== undefined
        ? (c.dayLandings ?? 0) + (c.nightLandings ?? 0)
        : (c.fullStopLandings ?? (c.dayFullStopLandings ?? 0) + (c.nightFullStopLandings ?? 0)));
  }
  return out;
}

/** The merged rows: every pair's record and every orphan that is not dropped. */
export function mergedRecords(resolution: Resolution): SourceRecord[] {
  return [
    ...resolution.pairs.map((p) => p.record),
    ...resolution.orphans.filter((o) => o.action !== 'drop').map((o) => o.record),
  ];
}

/** Grand totals per source and for the merged logbook. Flight time excludes simulator sessions. */
export function auditTotals(
  a: readonly SourceRecord[],
  b: readonly SourceRecord[],
  resolution: Resolution,
): TotalsRow[] {
  const [sa, sb, sm] = [sums(a), sums(b), sums(mergedRecords(resolution))];
  const row = (label: string, key: keyof typeof sa, fmt: (n: number) => string): TotalsRow => ({
    label,
    a: fmt(sa[key]),
    b: fmt(sb[key]),
    merged: fmt(sm[key]),
  });
  return [
    row('Flights', 'flights', formatInt),
    row('Total time', 'total', formatHours),
    row('PIC', 'pic', formatHours),
    row('SIC', 'sic', formatHours),
    row('Night', 'night', formatHours),
    row('Actual instrument', 'actual', formatHours),
    row('Simulator', 'sim', formatHours),
    row('Landings', 'landings', formatInt),
  ];
}
