/** Display and input helpers for the audit screen. Pure; no DOM. */
import { COLUMN_PRESETS, formatFlightNumber, type SourceRecord } from '@core/importers';
import type {
  BulkDecision,
  Decision,
  DecisionField,
  DiffPattern,
  Resolution,
  ResolvedOrphan,
  RuleProposal,
  RuleStatus,
  SuggestReason,
  ResolvedPair,
  Side,
} from '@core/reconcile';
import { tolCounts } from '@core/reconcile';
import { formatDecimal, parseDuration } from '@core/time/duration';
import { formatHours, formatInt, shortDate } from './format';
import { writtenName } from './names';
import { DEFAULT_PREFS, type DisplayPrefs } from './prefs';

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
  takeoffsLandings: 'Takeoffs and landings',
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
export const RULE_TEXT: Record<string, string> = {
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

const dayNight = (day: number, night: number): string =>
  day > 0 && night > 0 ? `${day} day, ${night} night` : night > 0 ? `${night} night` : `${day} day`;

/** `Takeoffs 2 day · Landings 5 day (2 touch-and-go)`, with a warning when they do not add up. */
export function takeoffsLandingsText(r: SourceRecord): string {
  const t = tolCounts(r);
  const takeoffs = t.dayTakeoffs + t.nightTakeoffs;
  if (takeoffs === 0 && t.landings === 0) return 'None';
  const tg = t.touchAndGoes ? ` (${t.touchAndGoes} touch-and-go)` : '';
  const text = `Takeoffs ${dayNight(t.dayTakeoffs, t.nightTakeoffs)} · Landings ${dayNight(t.dayLandings, t.nightLandings)}${tg}`;
  return takeoffs === t.landings
    ? text
    : `${text} · ${takeoffs} takeoffs for ${t.landings} landings`;
}

const SUGGEST_TEXT: Record<SuggestReason, string> = {
  'pilot-flying-day':
    'You were pilot flying, and the times put the takeoff and landing in daylight.',
  'pilot-flying-night':
    'You were pilot flying, and the times put the takeoff or landing at night (from an hour after sunset).',
  'pilot-monitoring': 'You were pilot monitoring, so there should be none.',
  balanced: 'Its takeoffs and landings add up; the other app’s do not.',
  'pilot-flying': 'You were pilot flying, and the other app has none.',
};

export function suggestionText(reason: SuggestReason): string {
  return SUGGEST_TEXT[reason];
}

/** A typed value shown the way a side's value would be. */
export function displayTyped(field: DecisionField, value: string | number | boolean): string {
  if (typeof value === 'boolean') return yesNo(value);
  if (typeof value === 'string') return value === '' ? BLANK : value;
  const kind = typedKind(field);
  return kind === 'hours' ? hours(value) : kind === 'clock' ? clock(value) : String(value);
}

/** What one app says about a field, for people to read. */
export function displayValue(
  r: SourceRecord,
  field: DecisionField,
  prefs: DisplayPrefs = DEFAULT_PREFS,
): string {
  if (field === 'flightNumber') {
    return r.flightNumber ? formatFlightNumber(r.flightNumber, prefs.flightNumberStyle) : BLANK;
  }
  switch (field) {
    case 'takeoffsLandings':
      return takeoffsLandingsText(r);
    case 'approaches':
      return r.approaches.length === 0
        ? BLANK
        : r.approaches
            .map((x) => [x.type, x.runway, x.airport].filter((part) => part).join(' '))
            .join(', ');
    case 'people':
      return r.people.length === 0
        ? BLANK
        : r.people.map((p) => `${writtenName(p.name, prefs.nameOrder)} (${p.role})`).join('; ');
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
  /** Where the operating rule comes from, and the key a rule decision for it uses. */
  rule: RuleStatus;
  anchor: string;
}

/**
 * Everything worth showing: pairs that differ in meaning or need confirming, and all orphans.
 * `only` instead lists exactly those entries, whether or not anything differs.
 */
export function auditItems(resolution: Resolution, only?: ReadonlySet<string>): AuditItem[] {
  const items: AuditItem[] = [];
  for (const pair of resolution.pairs) {
    const live = pair.fields.filter(isShown);
    if (only ? !only.has(pair.entryId) : live.length === 0 && pair.match === 'exact') continue;
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
      rule: pair.rule,
      anchor: pair.fa,
    });
  }
  for (const orphan of resolution.orphans) {
    if (only && !only.has(orphan.entryId)) continue;
    items.push({
      id: orphan.entryId,
      date: orphan.record.date,
      tail: orphan.record.tail ?? '',
      route: routeText(orphan.record),
      orphan,
      openFields: [],
      openItself: orphan.action === 'undecided',
      touched: orphan.action !== 'undecided',
      rule: orphan.rule,
      anchor: orphan.fingerprint,
    });
  }
  return items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** A field worth showing the pilot: not the same fact written twice, not settled without asking. */
export function isShown(f: ResolvedPair['fields'][number]): boolean {
  return f.by === 'pair' || (f.class !== 'equivalent' && f.by !== 'automatic');
}

export const isOpen = (item: AuditItem): boolean => item.openItself || item.openFields.length > 0;

// --- operating rule -------------------------------------------------------------------------

const ENGINE_WORDS: Record<string, string> = {
  piston: 'piston-engine',
  turbine: 'turbine',
  'no aircraft': 'no-aircraft',
};

/** `66 CRJ7 flights, 2 Dec 2022 – 15 Jul 2023` */
export function proposalTitle(p: RuleProposal): string {
  const n = p.entries.length;
  const what = p.basis === 'airline' ? p.label : (ENGINE_WORDS[p.label] ?? p.label);
  const span = p.from === p.to ? shortDate(p.from) : `${shortDate(p.from)} – ${shortDate(p.to)}`;
  return `${formatInt(n)} ${what} ${n === 1 ? 'flight' : 'flights'}, ${span}`;
}

/** Why the rule is proposed, in a sentence. */
export function proposalReason(p: RuleProposal): string {
  const n = p.entries.length;
  const of = (count: number) =>
    count === n ? (n === 1 ? 'it has' : 'all have') : `${formatInt(count)} have`;
  if (p.basis === 'airline') {
    return `Turbine aircraft; ${of(p.evidence.flightNumber)} a flight number, ${of(p.evidence.sicTime)} SIC time, ${of(p.evidence.crewNamed)} a captain or first officer named.`;
  }
  return p.label === 'turbine'
    ? 'Turbine aircraft, but no flight number with SIC time or flight-deck crew.'
    : 'Nothing marks these as airline flying.';
}

/** How many merged flights the pilot gave each rule. */
export function decidedRules(resolution: Resolution): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (rule: string | undefined, anchor: string) => {
    if (rule === undefined) return;
    const list = out.get(rule);
    if (list) list.push(anchor);
    else out.set(rule, [anchor]);
  };
  for (const p of resolution.pairs) if (p.rule === 'decided') add(p.record.rule, p.fa);
  for (const o of resolution.orphans) if (o.rule === 'decided') add(o.record.rule, o.fingerprint);
  return out;
}

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
      if (f.class === 'equivalent' || f.by === 'pair' || f.by === 'automatic') continue;
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

// --- settled without asking ------------------------------------------------------------------

/** How many differences were settled automatically, by kind. */
export function automaticCounts(resolution: Resolution): {
  rounding: number;
  flightNumber: number;
} {
  const out = { rounding: 0, flightNumber: 0 };
  for (const p of resolution.pairs) {
    for (const f of p.fields) {
      if (f.by !== 'automatic') continue;
      if (f.pattern === 'rounding') out.rounding++;
      else if (f.field === 'flightNumber') out.flightNumber++;
    }
  }
  return out;
}

// --- fixing the source apps ------------------------------------------------------------------

export interface FixChange {
  field: DecisionField;
  label: string;
  /** What the app says now. */
  now: string;
  /** What it should say. */
  should: string;
}

export interface FixItem {
  /** The audit entry to open for this flight. */
  entryId: string;
  /** The app's own row, for finding it there: the app's date, tail, route and times. */
  record: SourceRecord;
  kind: 'change' | 'add' | 'delete';
  changes: FixChange[];
}

/**
 * What to correct in each app so it agrees with the pilot's decisions. Only differences the
 * pilot decided (a choice on the flight, or a rule for one field's real differences) are
 * listed; rounding and blanks are how the apps store things, not mistakes. One-app-only
 * entries are listed as an entry to add to the other app (kept) or delete (left out).
 */
export function fixList(
  resolution: Resolution,
  prefs: DisplayPrefs = DEFAULT_PREFS,
): Record<Side, FixItem[]> {
  const out: Record<Side, FixItem[]> = { a: [], b: [] };
  for (const pair of resolution.pairs) {
    const decided = pair.fields.filter(
      (f) => f.by === 'pair' || (f.by === 'bulk' && f.pattern === undefined),
    );
    for (const side of ['a', 'b'] as const) {
      const changes: FixChange[] = [];
      for (const f of decided) {
        const now = displayValue(pair[side], f.field, prefs);
        const should = displayValue(pair.record, f.field, prefs);
        if (now !== should)
          changes.push({ field: f.field, label: fieldLabel(f.field), now, should });
      }
      if (changes.length > 0) {
        out[side].push({ entryId: pair.entryId, record: pair[side], kind: 'change', changes });
      }
    }
  }
  for (const orphan of resolution.orphans) {
    if (orphan.action === 'keep') {
      const other: Side = orphan.side === 'a' ? 'b' : 'a';
      out[other].push({ entryId: orphan.entryId, record: orphan.record, kind: 'add', changes: [] });
    } else if (orphan.action === 'drop') {
      out[orphan.side].push({
        entryId: orphan.entryId,
        record: orphan.record,
        kind: 'delete',
        changes: [],
      });
    }
  }
  const byDate = (x: FixItem, y: FixItem) =>
    x.record.date < y.record.date
      ? -1
      : x.record.date > y.record.date
        ? 1
        : x.record.line - y.record.line;
  out.a.sort(byDate);
  out.b.sort(byDate);
  return out;
}

// --- pairing by hand -------------------------------------------------------------------------

export interface PairCandidate {
  side: Side;
  record: SourceRecord;
  fingerprint: string;
  /** Whole days between the two rows' dates. */
  daysApart: number;
  /** The pair this row is in now, if any; pairing it here takes it out of that pair. */
  pairedWith?: ResolvedPair;
}

function dayNumber(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? NaN : Math.round(ms / 86_400_000);
}

/**
 * Rows from the other app that a one-app-only entry could be paired with: every unpaired row
 * there, and rows already in a pair within `pairedWithinDays` days (the matcher may have given
 * them the wrong partner). Nearest date first, then the same aircraft, then file order.
 */
export function pairCandidates(
  resolution: Resolution,
  orphan: ResolvedOrphan,
  pairedWithinDays = 1,
): PairCandidate[] {
  const other: Side = orphan.side === 'a' ? 'b' : 'a';
  const day = dayNumber(orphan.record.date);
  const apart = (r: SourceRecord) => {
    const d = Math.abs(dayNumber(r.date) - day);
    return Number.isNaN(d) ? Number.MAX_SAFE_INTEGER : d;
  };
  const out: PairCandidate[] = [];
  for (const o of resolution.orphans) {
    if (o.side !== other) continue;
    out.push({
      side: other,
      record: o.record,
      fingerprint: o.fingerprint,
      daysApart: apart(o.record),
    });
  }
  for (const p of resolution.pairs) {
    const record = p[other];
    const daysApart = apart(record);
    if (daysApart > pairedWithinDays) continue;
    out.push({
      side: other,
      record,
      fingerprint: other === 'a' ? p.fa : p.fb,
      daysApart,
      pairedWith: p,
    });
  }
  const sameTail = (c: PairCandidate) => (c.record.tail === orphan.record.tail ? 0 : 1);
  return out.sort(
    (x, y) =>
      x.daysApart - y.daysApart ||
      sameTail(x) - sameTail(y) ||
      (x.pairedWith ? 1 : 0) - (y.pairedWith ? 1 : 0) ||
      x.record.line - y.record.line,
  );
}
