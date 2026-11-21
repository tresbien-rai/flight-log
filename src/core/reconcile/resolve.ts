/**
 * Applies the pilot's decisions to two matched imports. See docs/DESIGN.md §7.1 (stage 5)
 * and §7.2.
 *
 * Pure and deterministic. Nothing here picks a winner on its own: a difference is settled
 * only when it is `equivalent`, or a decision (the pair's own, or a bulk rule) covers it.
 * Everything else is reported as open and provisionally shows side `a`'s value.
 */
import type { SourceCounts, SourcePerson, SourceRecord } from '../importers';
import { DURATION_FIELDS } from '../model';
import { nameKey } from '../importers/normalize/names';
import { diffRecords } from './diff';
import type {
  BulkDecision,
  Decision,
  DecisionField,
  DiffClass,
  DiffPattern,
  FieldChoice,
  FieldDiff,
  Fingerprint,
  MatchResult,
  MatchTier,
  OrphanDecision,
  PairDecision,
  Resolution,
  ResolvedField,
  ResolvedOrphan,
  ResolvedPair,
  Side,
} from './types';

// --- fingerprints ----------------------------------------------------------------------------

/** cyrb53: a well-mixed 53-bit string hash. Not cryptographic; it only has to tell rows apart. */
function hash53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function rowHash(rec: SourceRecord): string {
  const cells = Object.keys(rec.raw)
    .sort()
    .map((key) => `${key}\u0002${rec.raw[key]}`);
  const text = `${rec.source}\u0001${cells.join('\u0001')}`;
  const part = (seed: number) => hash53(text, seed).toString(36).padStart(11, '0');
  return part(1) + part(2);
}

/** A fingerprint for every record of one import. Order of the input does not matter. */
export function fingerprintRecords(
  records: readonly SourceRecord[],
): Map<SourceRecord, Fingerprint> {
  const out = new Map<SourceRecord, Fingerprint>();
  const seen = new Map<string, number>();
  for (const rec of [...records].sort((x, y) => x.line - y.line)) {
    const hash = rowHash(rec);
    const n = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, n);
    out.set(rec, n === 1 ? hash : `${hash}#${n}`);
  }
  return out;
}

// --- decisions -------------------------------------------------------------------------------

/** The stable key a decision is stored under; a newer decision with the same key replaces it. */
export function decisionKey(d: Decision): string {
  switch (d.kind) {
    case 'pair':
      return `pair:${d.a}|${d.b}`;
    case 'orphan':
      return `orphan:${d.side}:${d.record}`;
    case 'bulk':
      return `bulk:${d.pattern}:${d.field ?? '*'}`;
  }
}

const LANDING_DIFFS = new Set([
  'counts.allLandings',
  'counts.fullStopLandings',
  'counts.nightLandings',
]);

export function decisionField(diffField: string): DecisionField {
  return LANDING_DIFFS.has(diffField) ? 'landings' : diffField;
}

export function diffSignature(diffs: readonly FieldDiff[]): string {
  return JSON.stringify(diffs.map((d) => [d.field, d.a ?? null, d.b ?? null]));
}

/**
 * The decision to store after the pilot changes something about a pair. Starts from the
 * decision currently applied (dropping field choices that no longer fit the rows), keyed to
 * the rows as they are now.
 *
 * `fields`: a choice sets that field's decision, `undefined` clears it.
 */
export function amendPairDecision(
  pair: ResolvedPair,
  change: {
    match?: PairDecision['match'] | null;
    fields?: Record<DecisionField, FieldChoice | undefined>;
  },
  decidedAt: string,
): PairDecision {
  const fields: PairDecision['fields'] = {};
  for (const f of pair.fields) {
    const prior = pair.decision?.fields[f.field];
    if (f.by === 'pair' && prior) fields[f.field] = prior;
  }
  for (const [field, choice] of Object.entries(change.fields ?? {})) {
    const resolved = pair.fields.find((f) => f.field === field);
    if (choice === undefined || !resolved) delete fields[field];
    else fields[field] = { choice, seen: diffSignature(resolved.diffs) };
  }
  const out: PairDecision = { kind: 'pair', a: pair.fa, b: pair.fb, fields, decidedAt };
  const match = change.match === undefined ? pair.decision?.match : change.match;
  if (match) out.match = match;
  return out;
}

// --- applying a choice to a record -----------------------------------------------------------

const TOP_LEVEL = new Set([
  'kind',
  'date',
  'tail',
  'from',
  'to',
  'localFlight',
  'route',
  'flightNumber',
  'rule',
  'pilotFlying',
  'remarks',
]);

const LANDING_KEYS: readonly (keyof SourceCounts)[] = [
  'dayLandings',
  'nightLandings',
  'dayFullStopLandings',
  'nightFullStopLandings',
  'fullStopLandings',
  'touchAndGoes',
  'allLandings',
];

const PLAIN_COUNTS = new Set(['dayTakeoffs', 'nightTakeoffs', 'holds', 'goArounds']);
const CLOCK_KEYS = new Set(['out', 'off', 'on', 'in', 'scheduledOut', 'scheduledIn']);
const DURATION_KEYS = new Set<string>(DURATION_FIELDS);
const RULES = new Set(['91', '121', '135', 'other']);
const CLEARABLE = new Set(['route', 'flightNumber', 'remarks']);

type Bag = Record<string, unknown>;

function put(target: object, key: string, value: unknown): void {
  if (value === undefined) delete (target as Bag)[key];
  else (target as Bag)[key] = value;
}

function cloneRecord(r: SourceRecord): SourceRecord {
  return {
    ...r,
    clock: { ...r.clock },
    durations: { ...r.durations },
    counts: { ...r.counts },
    approaches: r.approaches.map((x) => ({ ...x })),
    people: r.people.map((p) => ({ ...p })),
    custom: { ...r.custom },
  };
}

/** `clock.out` → [`clock`, `out`]; `tail` → [undefined, `tail`]. */
function split(field: string): [string | undefined, string] {
  const dot = field.indexOf('.');
  return dot < 0 ? [undefined, field] : [field.slice(0, dot), field.slice(dot + 1)];
}

/** Makes `target` say what `src` says about `field`. */
function copyField(target: SourceRecord, src: SourceRecord, field: DecisionField): void {
  if (field === 'landings') {
    for (const key of LANDING_KEYS) put(target.counts, key, src.counts[key]);
    return;
  }
  if (field === 'approaches') {
    target.approaches = src.approaches.map((x) => ({ ...x }));
    return;
  }
  if (field === 'people') {
    target.people = src.people.map((p) => ({ ...p }));
    return;
  }
  const [group, key] = split(field);
  if (group === undefined) {
    if (TOP_LEVEL.has(key)) put(target, key, (src as unknown as Bag)[key]);
  } else if (
    group === 'clock' ||
    group === 'durations' ||
    group === 'counts' ||
    group === 'custom'
  ) {
    put(target[group], key, (src[group] as Bag)[key]);
  }
}

function unionPeople(a: readonly SourcePerson[], b: readonly SourcePerson[]): SourcePerson[] {
  const out = a.map((p) => ({ ...p }));
  const have = new Set(out.map((p) => `${p.role}:${nameKey(p.name)}`));
  for (const p of b) {
    const key = `${p.role}:${nameKey(p.name)}`;
    if (have.has(key)) continue;
    have.add(key);
    out.push({ ...p });
  }
  return out;
}

function applyBoth(target: SourceRecord, a: SourceRecord, b: SourceRecord, field: string): boolean {
  if (field === 'people') {
    target.people = unionPeople(a.people, b.people);
    return true;
  }
  if (field === 'remarks') {
    const texts = [a.remarks, b.remarks].filter((t) => t !== undefined && t.trim() !== '');
    put(target, 'remarks', texts.length > 0 ? texts.join('\n') : undefined);
    return true;
  }
  return false;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Writes a typed value. False when the value is not valid for the field. */
function applyValue(
  target: SourceRecord,
  field: string,
  value: string | number | boolean,
): boolean {
  const [group, key] = split(field);
  if (group === 'clock') {
    if (!CLOCK_KEYS.has(key) || !isCount(value) || value > 1439) return false;
  } else if (group === 'durations') {
    if (!DURATION_KEYS.has(key) || !isCount(value)) return false;
  } else if (group === 'counts') {
    if (!PLAIN_COUNTS.has(key) || !isCount(value)) return false;
  } else if (group === 'custom') {
    if (typeof value === 'number' && !isCount(value)) return false;
  }
  if (group !== undefined) {
    if (group !== 'clock' && group !== 'durations' && group !== 'counts' && group !== 'custom') {
      return false;
    }
    (target[group] as Bag)[key] = value;
    return true;
  }

  if (key === 'pilotFlying') {
    if (typeof value !== 'boolean') return false;
    target.pilotFlying = value;
    return true;
  }
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (CLEARABLE.has(key)) {
    put(target, key, text === '' ? undefined : text);
    return true;
  }
  if (text === '') return false;
  switch (key) {
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
      target.date = text;
      return true;
    case 'tail':
    case 'from':
    case 'to':
      target[key] = text.toUpperCase();
      return true;
    case 'rule':
      if (!RULES.has(text)) return false;
      target.rule = text as SourceRecord['rule'];
      return true;
    default:
      return false;
  }
}

function applyChoice(
  target: SourceRecord,
  a: SourceRecord,
  b: SourceRecord,
  field: DecisionField,
  choice: FieldChoice,
): boolean {
  if (choice === 'a' || choice === 'b') {
    copyField(target, choice === 'a' ? a : b, field);
    return true;
  }
  if (choice === 'both') return applyBoth(target, a, b, field);
  return applyValue(target, field, choice.value);
}

// --- classifying a group of diffs ------------------------------------------------------------

function groupClass(diffs: readonly FieldDiff[]): { class: DiffClass; pattern?: DiffPattern } {
  const live = diffs.filter((d) => d.class !== 'equivalent');
  if (live.length === 0) return { class: 'equivalent' };
  const pattern = live[0]!.pattern;
  if (
    pattern !== undefined &&
    live.every((d) => d.class === 'systematic' && d.pattern === pattern)
  ) {
    return { class: 'systematic', pattern };
  }
  return { class: 'real' };
}

/** With `equivalent` values either side will do; prefer the one that says more. */
function settleEquivalent(
  target: SourceRecord,
  b: SourceRecord,
  field: DecisionField,
  diffs: readonly FieldDiff[],
): void {
  if (field === 'approaches') {
    const runways = (r: SourceRecord) => r.approaches.filter((x) => x.runway !== undefined).length;
    if (runways(b) > runways(target)) copyField(target, b, field);
    return;
  }
  if (field === 'people') {
    // The app that gives people more roles says more.
    if (b.people.length > target.people.length) copyField(target, b, field);
    return;
  }
  if (field !== 'landings' && diffs.length === 1 && diffs[0]!.a === undefined) {
    copyField(target, b, field);
  }
}

function bulkChoice(
  rule: BulkDecision,
  field: DecisionField,
  diffs: readonly FieldDiff[],
): Side | 'both' | undefined {
  if (rule.choice === 'a' || rule.choice === 'b') return rule.choice;
  if (rule.choice === 'both') return field === 'people' || field === 'remarks' ? 'both' : undefined;
  if (rule.choice === 'present') {
    if (rule.pattern === 'missing-a') return 'b';
    if (rule.pattern === 'missing-b') return 'a';
    return undefined;
  }
  // more-precise: of two durations, the one that is not a whole tenth of an hour.
  const d = diffs.length === 1 ? diffs[0] : undefined;
  if (rule.pattern !== 'rounding' || !d || typeof d.a !== 'number' || typeof d.b !== 'number') {
    return undefined;
  }
  return d.a % 6 !== 0 ? 'a' : 'b';
}

// --- resolve ---------------------------------------------------------------------------------

interface WorkingPair {
  a: SourceRecord;
  b: SourceRecord;
  tier: MatchTier | 'manual';
}

export function resolve(match: MatchResult, decisions: readonly Decision[]): Resolution {
  const fpA = fingerprintRecords([...match.pairs.map((p) => p.a), ...match.onlyA]);
  const fpB = fingerprintRecords([...match.pairs.map((p) => p.b), ...match.onlyB]);
  const recordA = new Map([...fpA].map(([rec, fp]) => [fp, rec]));
  const recordB = new Map([...fpB].map(([rec, fp]) => [fp, rec]));

  // Later decisions with the same key replace earlier ones.
  const byKey = new Map<string, Decision>();
  for (const d of decisions) byKey.set(decisionKey(d), d);
  const pairDecisions: PairDecision[] = [];
  const orphanDecisions = new Map<string, OrphanDecision>();
  const bulk = new Map<string, BulkDecision>();
  for (const [key, d] of byKey) {
    if (d.kind === 'pair') pairDecisions.push(d);
    else if (d.kind === 'orphan') orphanDecisions.set(key, d);
    else bulk.set(key, d);
  }
  const exact = new Map(pairDecisions.map((d) => [`${d.a}|${d.b}`, d]));
  const used = new Set<Decision>();

  // 1. Pairing: the matcher's pairs, minus rejected ones, plus hand-made ones.
  let working: WorkingPair[] = [];
  const loose = { a: new Set(match.onlyA), b: new Set(match.onlyB) };
  for (const p of match.pairs) {
    const d = exact.get(`${fpA.get(p.a)}|${fpB.get(p.b)}`);
    if (d?.match === 'rejected') {
      used.add(d);
      loose.a.add(p.a);
      loose.b.add(p.b);
    } else {
      working.push(p);
    }
  }
  for (const d of pairDecisions) {
    if (d.match !== 'manual') continue;
    const a = recordA.get(d.a);
    const b = recordB.get(d.b);
    if (!a || !b) continue;
    if (working.some((p) => p.a === a && p.b === b)) continue;
    working = working.filter((p) => {
      if (p.a !== a && p.b !== b) return true;
      if (p.a !== a) loose.a.add(p.a);
      if (p.b !== b) loose.b.add(p.b);
      return false;
    });
    loose.a.delete(a);
    loose.b.delete(b);
    working.push({ a, b, tier: 'manual' });
  }

  // A decision made when one of the two rows read differently still applies to the pair, as
  // long as the other row is unchanged and the decision's own partner row is gone.
  const fallback = (fa: Fingerprint, fb: Fingerprint): PairDecision | undefined => {
    const live = (d: PairDecision) => d.match !== 'rejected';
    const sameA = pairDecisions.filter((d) => live(d) && d.a === fa && !recordB.has(d.b));
    if (sameA.length === 1) return sameA[0];
    const sameB = pairDecisions.filter((d) => live(d) && d.b === fb && !recordA.has(d.a));
    return sameB.length === 1 ? sameB[0] : undefined;
  };

  const open = { matches: 0, fields: 0, orphans: 0 };

  // 2. Fields.
  const pairs: ResolvedPair[] = working.map(({ a, b, tier }) => {
    const fa = fpA.get(a)!;
    const fb = fpB.get(b)!;
    const own = exact.get(`${fa}|${fb}`);
    const decision = own ?? fallback(fa, fb);
    if (own) used.add(own);

    const groups = new Map<DecisionField, FieldDiff[]>();
    for (const d of diffRecords(a, b)) {
      const field = decisionField(d.field);
      const list = groups.get(field);
      if (list) list.push(d);
      else groups.set(field, [d]);
    }

    const record = cloneRecord(a);
    const fields: ResolvedField[] = [];
    for (const [field, diffs] of groups) {
      const cls = groupClass(diffs);
      const resolved: ResolvedField = { field, diffs, class: cls.class, by: 'undecided' };
      if (cls.pattern) resolved.pattern = cls.pattern;

      const mine = decision?.fields[field];
      if (
        mine &&
        mine.seen === diffSignature(diffs) &&
        applyChoice(record, a, b, field, mine.choice)
      ) {
        resolved.by = 'pair';
        resolved.choice = mine.choice;
        used.add(decision!);
      } else if (cls.class === 'equivalent') {
        settleEquivalent(record, b, field, diffs);
        resolved.by = 'equivalent';
      } else {
        // A rule for real differences always names its field.
        const rule = cls.pattern
          ? (bulk.get(`bulk:${cls.pattern}:${field}`) ?? bulk.get(`bulk:${cls.pattern}:*`))
          : bulk.get(`bulk:real:${field}`);
        const choice = rule ? bulkChoice(rule, field, diffs) : undefined;
        if (choice && applyChoice(record, a, b, field, choice)) {
          resolved.by = 'bulk';
          resolved.choice = choice;
        }
      }
      if (resolved.by === 'undecided') open.fields++;
      fields.push(resolved);
    }

    let status: ResolvedPair['match'];
    if (tier === 'manual') status = 'manual';
    else if (tier === 'exact') status = 'exact';
    else if (decision?.match === 'confirmed' || decision?.match === 'manual') {
      status = 'confirmed';
      used.add(decision);
    } else {
      status = 'unconfirmed';
      open.matches++;
    }

    const out: ResolvedPair = {
      a,
      b,
      fa,
      fb,
      tier,
      match: status,
      fields,
      record,
      entryId: `main:${fa}`,
    };
    if (decision && used.has(decision)) out.decision = decision;
    return out;
  });

  // 3. Orphans.
  const orphans: ResolvedOrphan[] = [];
  for (const side of ['a', 'b'] as const) {
    const fps = side === 'a' ? fpA : fpB;
    for (const record of [...loose[side]].sort((x, y) => x.line - y.line)) {
      const fingerprint = fps.get(record)!;
      const d = orphanDecisions.get(`orphan:${side}:${fingerprint}`);
      if (d) used.add(d);
      else open.orphans++;
      orphans.push({
        side,
        record,
        fingerprint,
        action: d?.action ?? 'undecided',
        entryId: `main:${fingerprint}`,
      });
    }
  }

  const stale = [...byKey.values()].filter((d) => d.kind !== 'bulk' && !used.has(d));
  return { pairs, orphans, open, stale };
}
