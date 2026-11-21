/**
 * Matching and diffing two imports of the same logbook. See docs/DESIGN.md §7.
 *
 * Side `a` and side `b` are any two ImportResults; nothing here knows which app is which.
 * Everything is a pure function of its inputs and deterministic: the same two files always
 * produce the same pairs in the same order.
 */
import type { SourceRecord } from '../importers';
import type { OperatingRule } from '../model';

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
  /**
   * One side has no value and the other has one; or, for crew and remarks, one side says
   * everything the other says and more. The named side is the one that lacks something.
   */
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

// ---------------------------------------------------------------------------------------------
// Decisions and resolution. See docs/DESIGN.md §7.1 (stage 5) and §7.2.
// ---------------------------------------------------------------------------------------------

/**
 * A stable name for one raw row: a hash of its source and every non-empty cell. The same row
 * in a later export of the same logbook has the same fingerprint; an edited row does not.
 * Identical rows in one file are told apart by a `#2`, `#3`… suffix in file order.
 */
export type Fingerprint = string;

export type Side = 'a' | 'b';

/**
 * What a decision is made about. Usually a diff field (`durations.night`, `tail`), but the
 * takeoffs and landings are decided together as `takeoffsLandings`, because every takeoff
 * needs a landing and because the two apps count landings
 * differently and the individual numbers cannot be mixed.
 */
export type DecisionField = string;

/**
 * - `a` / `b`: that side's value.
 * - `both`: `people` (union) and `remarks` (both texts) only.
 * - `{ value }`: typed by the pilot, in the record's own units (minutes for durations and
 *   clock times). Not available for `kind`, `localFlight`, `takeoffsLandings`, `approaches`, `people`.
 */
export type FieldChoice = Side | 'both' | { value: string | number | boolean };

export interface FieldDecision {
  choice: FieldChoice;
  /**
   * Signature of the difference the pilot was looking at (see `diffSignature`). The decision
   * applies only while the difference is still that one, so a value corrected in either app
   * is asked about again instead of being silently overridden.
   */
  seen: string;
}

/** Everything decided about one pair of rows. */
export interface PairDecision {
  kind: 'pair';
  a: Fingerprint;
  b: Fingerprint;
  /**
   * - `confirmed`: the matcher's less-than-exact pairing is right.
   * - `rejected`: the matcher paired two different flights; treat both as unmatched.
   * - `manual`: the pilot paired these two rows by hand.
   */
  match?: 'confirmed' | 'rejected' | 'manual';
  fields: Record<DecisionField, FieldDecision>;
  /** UTC ISO instant, supplied by the caller. */
  decidedAt: string;
}

/** What to do with a row that exists in one app only. */
export interface OrphanDecision {
  kind: 'orphan';
  side: Side;
  record: Fingerprint;
  action: 'keep' | 'drop';
  decidedAt: string;
}

/**
 * - `a` / `b`: always that side.
 * - `more-precise`: for `rounding`, the value that is not a whole tenth of an hour.
 * - `present`: for `missing-a` / `missing-b`, the side that has a value.
 * - `both`: for `people` and `remarks`, as in FieldChoice.
 * - `suggested`: the side `ResolvedField.suggested` names; fields with no suggestion stay open.
 */
export type BulkChoice = Side | 'both' | 'more-precise' | 'present' | 'suggested';

/**
 * One rule for every difference of a pattern, optionally limited to one field. A pair's own
 * decision wins over a field's rule, which wins over the pattern's rule.
 */
export interface BulkDecision {
  kind: 'bulk';
  /**
   * `real` is a rule for every real difference in one field ("crew names: keep LogTen's").
   * It must name its `field`, and may choose `a`, `b` or `both`.
   */
  pattern: DiffPattern | 'real';
  field?: DecisionField;
  choice: BulkChoice;
  decidedAt: string;
}

/**
 * The operating rule of one merged entry that neither app states. Keyed by the entry's
 * anchor row (side `a`'s row for a pair, the row itself for a one-app-only entry), so a
 * flight that first appears in a later export is asked about, never labelled silently.
 * It applies only while the merged entry has no rule from the apps themselves.
 */
export interface RuleDecision {
  kind: 'rule';
  entry: Fingerprint;
  rule: OperatingRule;
  decidedAt: string;
}

export type Decision = PairDecision | OrphanDecision | BulkDecision | RuleDecision;

/**
 * Where a merged entry's operating rule comes from.
 * - `stated`: one of the apps says it (and any disagreement is a `rule` field difference).
 * - `decided`: a RuleDecision supplies it.
 * - `open`: a flight with no rule yet. It becomes Part 91 if the logbook is built now.
 * - `none`: not a flight (simulator and ground sessions are not operated under a rule).
 */
export type RuleStatus = 'stated' | 'decided' | 'open' | 'none';

/** How a field of a pair got its value. `undecided` fields provisionally use side `a`. */
export type SettledBy = 'equivalent' | 'pair' | 'bulk' | 'undecided';

/**
 * Why one side looks right:
 * - `pilot-flying-day` / `pilot-flying-night`: a pilot-flying leg with clock times; this side
 *   has one takeoff and one landing, each by day or night as the sun was (night counted from
 *   an hour after sunset to an hour before sunrise, as for currency).
 * - `pilot-monitoring`: a pilot-monitoring leg; this side has no takeoffs or landings.
 * - `balanced`: only this side has as many takeoffs as landings.
 * - `pilot-flying`: a pilot-flying leg; only this side has any takeoffs or landings.
 */
export type SuggestReason =
  'pilot-flying-day' | 'pilot-flying-night' | 'pilot-monitoring' | 'balanced' | 'pilot-flying';

export interface Suggestion {
  side: Side;
  reason: SuggestReason;
}

export interface ResolvedField {
  field: DecisionField;
  /** The side that looks right, when the evidence points one way. */
  suggested?: Suggestion;
  /** The diffs behind it (several for `takeoffsLandings`). */
  diffs: FieldDiff[];
  class: DiffClass;
  pattern?: DiffPattern;
  by: SettledBy;
  /** The concrete choice applied; absent when undecided. */
  choice?: Side | 'both' | { value: string | number | boolean };
}

export interface ResolvedPair {
  a: SourceRecord;
  b: SourceRecord;
  fa: Fingerprint;
  fb: Fingerprint;
  tier: MatchTier | 'manual';
  /** `unconfirmed`: paired below the `exact` tier and not yet confirmed by the pilot. */
  match: 'exact' | 'confirmed' | 'manual' | 'unconfirmed';
  /** Every differing field, `equivalent` ones included, in diff order. */
  fields: ResolvedField[];
  /** The merged row. Carries side `a`'s `source`, `line` and `raw`. */
  record: SourceRecord;
  /** Id of the entry this pair becomes. */
  entryId: string;
  rule: RuleStatus;
  /**
   * The stored decision that was applied, if any. It may have been made against an earlier
   * version of one of the two rows; `amendPairDecision` re-keys it to the current rows.
   */
  decision?: PairDecision;
}

export interface ResolvedOrphan {
  side: Side;
  record: SourceRecord;
  fingerprint: Fingerprint;
  /** Undecided orphans are provisionally kept. */
  action: 'keep' | 'drop' | 'undecided';
  entryId: string;
  /** `none` also for an entry that is left out. */
  rule: RuleStatus;
}

export interface Resolution {
  /** In the order of side `a`, hand-made pairs last. */
  pairs: ResolvedPair[];
  /** Side `a`'s first, each in file order. */
  orphans: ResolvedOrphan[];
  /** What is still to decide. All zero means the merged logbook is final. */
  open: { matches: number; fields: number; orphans: number };
  /** Flights whose operating rule is still `open`. */
  openRules: number;
  /** Decisions that applied to nothing in these two files (their rows changed or went). */
  stale: Decision[];
}
