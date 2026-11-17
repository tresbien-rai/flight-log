/**
 * One-to-one matching of two lists of SourceRecords. See docs/DESIGN.md §7.1 (step 3).
 *
 * Tiers (MATCH_TIERS) are tried in order; each only sees records no earlier tier took. Inside
 * a tier every plausible (a, b) pair becomes an edge with a cost, and edges are taken greedily
 * from cheapest. Candidates are found through hash indexes, so work is proportional to the
 * number of plausible pairs, not to n * m.
 */
import type { SourceRecord } from '../importers';
import { MATCH_TIERS } from './types';
import type { MatchResult, MatchTier, Pair } from './types';

/** Totals this close (minutes) count as the same flight when out times cannot decide. */
const TOTAL_TOLERANCE = 3;
const DAY_DIFFERS_MIN = 2;
const DAY_DIFFERS_MAX = 45;
const MS_PER_DAY = 86_400_000;

interface Edge {
  ai: number;
  bi: number;
  cost: number;
  /** 1 when kinds differ (tier 1 only); same-kind candidates win equal-cost ties. */
  kindMismatch: number;
}

/** A tier's way of finding candidate b records for an a record. */
interface TierSpec {
  tier: MatchTier;
  /** Records of this kind combination may be paired at all. */
  eligible: (a: SourceRecord, b: SourceRecord) => boolean;
  /** Index key for a b record (undefined = not indexed). */
  bKeys: (b: SourceRecord) => string[];
  /** Index keys to probe for an a record. */
  aKeys: (a: SourceRecord) => string[];
  /** Final check on a candidate that came out of the index. */
  accept: (a: SourceRecord, b: SourceRecord) => boolean;
}

const blank = (s: string | undefined): string => s ?? '';

function routeKey(r: SourceRecord): string {
  return `${blank(r.from)}>${blank(r.to)}>${r.localFlight ? 1 : 0}`;
}

function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return NaN;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

/** Out times decide when both sides have one; otherwise totals must be close. */
function timesAgree(a: SourceRecord, b: SourceRecord): boolean {
  const ao = a.clock.out;
  const bo = b.clock.out;
  if (ao !== undefined && bo !== undefined) return ao === bo;
  return Math.abs((a.durations.total ?? 0) - (b.durations.total ?? 0)) <= TOTAL_TOLERANCE;
}

function sessionLength(r: SourceRecord): number {
  const d = r.durations;
  return (d.simulator ?? 0) + (d.groundTraining ?? 0) + (d.total ?? 0);
}

function cost(a: SourceRecord, b: SourceRecord, session: boolean): number {
  const ao = a.clock.out;
  const bo = b.clock.out;
  const out = ao !== undefined && bo !== undefined ? Math.abs(ao - bo) : 0;
  const len = session
    ? Math.abs(sessionLength(a) - sessionLength(b))
    : Math.abs((a.durations.total ?? 0) - (b.durations.total ?? 0));
  return out + len;
}

const bothFlights = (a: SourceRecord, b: SourceRecord): boolean =>
  a.kind === 'flight' && b.kind === 'flight';

const TIER_SPECS: Record<MatchTier, TierSpec> = {
  exact: {
    tier: 'exact',
    // A kind mismatch is tolerated only when the tail is present: one app may class a row
    // differently, but a tail-less pair on the same day and route proves little.
    eligible: (a, b) => bothFlights(a, b) || (a.kind !== b.kind && a.tail !== undefined),
    bKeys: (b) => [`${b.date}|${blank(b.tail)}|${routeKey(b)}`],
    aKeys: (a) => [`${a.date}|${blank(a.tail)}|${routeKey(a)}`],
    accept: () => true,
  },
  'date-adjacent': {
    tier: 'date-adjacent',
    eligible: bothFlights,
    bKeys: (b) => {
      const d = dayNumber(b.date);
      return Number.isNaN(d) ? [] : [`${blank(b.tail)}|${routeKey(b)}|${d}`];
    },
    aKeys: (a) => {
      const d = dayNumber(a.date);
      if (Number.isNaN(d)) return [];
      const k = `${blank(a.tail)}|${routeKey(a)}|`;
      return [`${k}${d - 1}`, `${k}${d + 1}`];
    },
    accept: timesAgree,
  },
  'tail-differs': {
    tier: 'tail-differs',
    eligible: bothFlights,
    bKeys: (b) => [`${b.date}|${routeKey(b)}`],
    aKeys: (a) => [`${a.date}|${routeKey(a)}`],
    accept: (a, b) => blank(a.tail) !== blank(b.tail) && timesAgree(a, b),
  },
  'route-differs': {
    tier: 'route-differs',
    eligible: bothFlights,
    bKeys: (b) => [`${b.date}|${blank(b.tail)}`],
    aKeys: (a) => [`${a.date}|${blank(a.tail)}`],
    accept: (a, b) => routeKey(a) !== routeKey(b) && timesAgree(a, b),
  },
  'date-differs': {
    tier: 'date-differs',
    eligible: (a, b) =>
      bothFlights(a, b) &&
      a.clock.out !== undefined &&
      a.clock.in !== undefined &&
      b.clock.out !== undefined &&
      b.clock.in !== undefined,
    bKeys: (b) => [`${blank(b.tail)}|${routeKey(b)}|${b.clock.out}|${b.clock.in}`],
    aKeys: (a) => [`${blank(a.tail)}|${routeKey(a)}|${a.clock.out}|${a.clock.in}`],
    accept: (a, b) => {
      const gap = Math.abs(dayNumber(a.date) - dayNumber(b.date));
      return gap >= DAY_DIFFERS_MIN && gap <= DAY_DIFFERS_MAX;
    },
  },
  session: {
    tier: 'session',
    eligible: (a, b) => a.kind === b.kind && (a.kind === 'simulator' || a.kind === 'ground'),
    bKeys: (b) => [`${b.date}|${b.kind}`],
    aKeys: (a) => [`${a.date}|${a.kind}`],
    accept: (a, b) => a.tail === undefined || b.tail === undefined || a.tail === b.tail,
  },
};

/**
 * Which way a file runs in time: -1 when it starts with the newest records, else 1.
 * Decided once from its first and last dated records.
 */
function direction(records: readonly SourceRecord[]): 1 | -1 {
  let first: string | undefined;
  let last: string | undefined;
  for (const r of records) {
    if (r.date) {
      first ??= r.date;
      last = r.date;
    }
  }
  return first !== undefined && last !== undefined && first > last ? -1 : 1;
}

export function matchRecords(a: readonly SourceRecord[], b: readonly SourceRecord[]): MatchResult {
  // Same-day records are paired in time order. A file listed newest-first has its same-day
  // records in reverse time order, so when the two files disagree, b is ranked backwards.
  const bSign = direction(a) === direction(b) ? 1 : -1;

  const matchedA: (number | undefined)[] = new Array<number | undefined>(a.length).fill(undefined);
  const matchedB: (number | undefined)[] = new Array<number | undefined>(b.length).fill(undefined);
  const tierOf: (MatchTier | undefined)[] = new Array<MatchTier | undefined>(a.length).fill(
    undefined,
  );

  for (const tier of MATCH_TIERS) {
    const spec = TIER_SPECS[tier];
    const isSession = tier === 'session';

    const index = new Map<string, number[]>();
    for (let bi = 0; bi < b.length; bi++) {
      if (matchedB[bi] !== undefined) continue;
      for (const key of spec.bKeys(b[bi]!)) {
        const list = index.get(key);
        if (list) list.push(bi);
        else index.set(key, [bi]);
      }
    }
    if (index.size === 0) continue;

    const edges: Edge[] = [];
    for (let ai = 0; ai < a.length; ai++) {
      if (matchedA[ai] !== undefined) continue;
      const ra = a[ai]!;
      for (const key of spec.aKeys(ra)) {
        const candidates = index.get(key);
        if (!candidates) continue;
        for (const bi of candidates) {
          const rb = b[bi]!;
          if (!spec.eligible(ra, rb) || !spec.accept(ra, rb)) continue;
          edges.push({
            ai,
            bi,
            cost: cost(ra, rb, isSession),
            kindMismatch: ra.kind === rb.kind ? 0 : 1,
          });
        }
      }
    }

    edges.sort(
      (x, y) =>
        x.cost - y.cost ||
        x.kindMismatch - y.kindMismatch ||
        a[x.ai]!.line - a[y.ai]!.line ||
        bSign * (b[x.bi]!.line - b[y.bi]!.line) ||
        x.ai - y.ai ||
        x.bi - y.bi,
    );
    for (const e of edges) {
      if (matchedA[e.ai] !== undefined || matchedB[e.bi] !== undefined) continue;
      matchedA[e.ai] = e.bi;
      matchedB[e.bi] = e.ai;
      tierOf[e.ai] = tier;
    }
  }

  const pairs: Pair[] = [];
  const onlyA: SourceRecord[] = [];
  for (let ai = 0; ai < a.length; ai++) {
    const bi = matchedA[ai];
    const tier = tierOf[ai];
    if (bi === undefined || tier === undefined) onlyA.push(a[ai]!);
    else pairs.push({ a: a[ai]!, b: b[bi]!, tier });
  }
  const onlyB = b.filter((_, bi) => matchedB[bi] === undefined);
  return { pairs, onlyA, onlyB };
}
