/**
 * Matching and diffing two imports of the same logbook. See docs/DESIGN.md §7.
 *
 * Side `a` and side `b` are any two ImportResults; nothing here knows which app is which.
 * Everything is a pure function of its inputs and deterministic: the same two files always
 * produce the same pairs in the same order.
 */
import type { SourceRecord } from '../importers';

/**
 * How confidently two records were paired. Tiers are tried in this order; a record matched
 * in an earlier tier is never reconsidered.
 */
export const MATCH_TIERS = [
  /** Same date, tail, departure and destination. */
  'exact',
  /** Same tail and route, date one day apart, with the same out time or the same total. */
  'date-adjacent',
  /** Same date, route and out time (or total, when neither has clock times); tail differs. */
  'tail-differs',
  /** Same date and tail, same out time or total; departure or destination differs. */
  'route-differs',
  /** Same tail, route, out time and in time; dates more than a day apart (a mistyped date). */
  'date-differs',
  /** Simulator or ground rows: same date and kind, closest session length. */
  'session',
] as const;

export type MatchTier = (typeof MATCH_TIERS)[number];

export interface Pair {
  a: SourceRecord;
  b: SourceRecord;
  tier: MatchTier;
}

export interface MatchResult {
  /** In the order of side `a`. */
  pairs: Pair[];
  /** Records with no counterpart, in their original order. */
  onlyA: SourceRecord[];
  onlyB: SourceRecord[];
}

/**
 * - `equivalent`: the same fact written two ways (blank vs zero, `6` vs `06`). Not shown.
 * - `systematic`: explained by a known difference in how the two apps store things. Can be
 *   resolved in bulk. `pattern` names the explanation.
 * - `real`: the two logbooks say different things. A person must choose.
 */
export type DiffClass = 'equivalent' | 'systematic' | 'real';

export const DIFF_PATTERNS = [
  /** One side is the other rounded to a tenth of an hour. */
  'rounding',
  /** One side has no value (undefined) and the other has a non-zero one. */
  'missing-a',
  'missing-b',
] as const;

export type DiffPattern = (typeof DIFF_PATTERNS)[number];

export type DiffValue = string | number | boolean | undefined;

export interface FieldDiff {
  /**
   * Dotted path of the compared fact, e.g. `durations.total`, `clock.out`, `tail`,
   * `counts.allLandings`, `approaches`, `people`, `custom.passengerCount`.
   */
  field: string;
  a: DiffValue;
  b: DiffValue;
  class: DiffClass;
  pattern?: DiffPattern;
}

export interface PairDiff {
  pair: Pair;
  /** Only fields that differ in some way, `equivalent` ones included. */
  diffs: FieldDiff[];
}
