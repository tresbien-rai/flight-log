/**
 * Field-by-field comparison of two paired records. See docs/DESIGN.md §7.1 (stage 4).
 *
 * Pure and deterministic. Output is only the fields that differ in some way, in a fixed
 * field order. Privacy: `people` and `remarks` are reported as counts and lengths, never as
 * text, so a diff is safe to print.
 */
import type { Approach } from '../model';
import { DURATION_FIELDS } from '../model';
import type { SourceCounts, SourceRecord } from '../importers';
import type { DiffPattern, DiffValue, FieldDiff, Pair, PairDiff } from './types';

export function diffPair(pair: Pair): PairDiff {
  return { pair, diffs: diffRecords(pair.a, pair.b) };
}

export function diffRecords(a: SourceRecord, b: SourceRecord): FieldDiff[] {
  const out: FieldDiff[] = [];
  const push = (d: FieldDiff | undefined): void => {
    if (d) out.push(d);
  };

  // 1. Identity strings.
  push(scalar('kind', a.kind, b.kind));
  push(scalar('date', a.date, b.date));
  push(scalar('tail', a.tail, b.tail));
  push(scalar('from', a.from, b.from));
  push(scalar('to', a.to, b.to));
  push(scalar('localFlight', a.localFlight, b.localFlight));
  push(scalar('route', a.route, b.route, normRoute));
  push(scalar('flightNumber', a.flightNumber, b.flightNumber, normFlightNumber));

  // 2. Clock times.
  for (const f of ['out', 'off', 'on', 'in', 'scheduledOut', 'scheduledIn'] as const) {
    const x = a.clock[f];
    const y = b.clock[f];
    if (x === y) continue;
    // Midnight is a real time, so a blank clock is never equivalent to 00:00.
    const verdict: Verdict =
      x === undefined
        ? missing('missing-a')
        : y === undefined
          ? missing('missing-b')
          : { class: 'real' };
    push(
      make(
        `clock.${f}`,
        x === undefined ? undefined : hhmm(x),
        y === undefined ? undefined : hhmm(y),
        verdict,
      ),
    );
  }

  // 3. Durations.
  for (const f of DURATION_FIELDS) {
    push(scalar(`durations.${f}`, a.durations[f], b.durations[f], undefined, roundingRule));
  }

  // 4. Counts.
  for (const f of ['dayTakeoffs', 'nightTakeoffs', 'holds', 'goArounds'] as const) {
    push(countDiff(`counts.${f}`, a.counts[f], b.counts[f]));
  }
  const allA = sumOrValue(a.counts.allLandings, a.counts.dayLandings, a.counts.nightLandings);
  const allB = sumOrValue(b.counts.allLandings, b.counts.dayLandings, b.counts.nightLandings);
  if (allA !== undefined && allB !== undefined) {
    push(countDiff('counts.allLandings', allA, allB));
  }
  const fsA = sumOrValue(
    a.counts.fullStopLandings,
    a.counts.dayFullStopLandings,
    a.counts.nightFullStopLandings,
  );
  const fsB = sumOrValue(
    b.counts.fullStopLandings,
    b.counts.dayFullStopLandings,
    b.counts.nightFullStopLandings,
  );
  if (fsA !== undefined && fsB !== undefined) {
    push(countDiff('counts.fullStopLandings', fsA, fsB));
  }
  const nl = nightLandingPair(a.counts, b.counts);
  if (nl) push(countDiff('counts.nightLandings', nl[0], nl[1]));

  // 5. Approaches.
  push(approachDiff(a.approaches, b.approaches));

  // 6. Rule.
  push(scalar('rule', a.rule, b.rule));

  // 7. Pilot flying: blank is "not recorded", never false.
  push(pilotFlyingDiff(a.pilotFlying, b.pilotFlying));

  // 8. People.
  push(peopleDiff(a, b));

  // 9. Custom fields.
  const keys = [...new Set([...Object.keys(a.custom), ...Object.keys(b.custom)])].sort();
  for (const k of keys) {
    push(scalar(`custom.${k}`, a.custom[k], b.custom[k], undefined, roundingRule));
  }

  // 10. Remarks.
  push(remarksDiff(a.remarks, b.remarks));

  return out;
}

// ---------------------------------------------------------------------------------------------

type Scalar = string | number | boolean | undefined;
type Verdict = { class: FieldDiff['class']; pattern?: DiffPattern };

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isZeroish(v: Scalar): boolean {
  return v === 0 || v === false || v === '';
}

function make(field: string, a: DiffValue, b: DiffValue, v: Verdict): FieldDiff {
  const d: FieldDiff = { field, a, b, class: v.class };
  if (v.pattern) d.pattern = v.pattern;
  return d;
}

function missing(pattern: 'missing-a' | 'missing-b'): Verdict {
  return { class: 'systematic', pattern };
}

/** Two present, different numbers: rounding when one is a whole tenth of an hour and within 3. */
function roundingRule(a: Scalar, b: Scalar): Verdict {
  if (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Math.abs(a - b) <= 3 &&
    (a % 6 === 0 || b % 6 === 0)
  ) {
    return { class: 'systematic', pattern: 'rounding' };
  }
  return { class: 'real' };
}

/**
 * Generic scalar classification. `norm` maps a string to a comparison key; values equal under
 * `norm` but not strictly equal are `equivalent`. `both` classifies two present, different
 * values (default: real).
 */
function scalar(
  field: string,
  a: Scalar,
  b: Scalar,
  norm?: (s: string) => string,
  both: (a: Scalar, b: Scalar) => Verdict = () => ({ class: 'real' }),
): FieldDiff | undefined {
  if (a === b) return undefined;
  if (a === undefined) {
    return make(field, a, b, isZeroish(b) ? { class: 'equivalent' } : missing('missing-a'));
  }
  if (b === undefined) {
    return make(field, a, b, isZeroish(a) ? { class: 'equivalent' } : missing('missing-b'));
  }
  if (norm && typeof a === 'string' && typeof b === 'string' && norm(a) === norm(b)) {
    return make(field, a, b, { class: 'equivalent' });
  }
  return make(field, a, b, both(a, b));
}

function normRoute(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toUpperCase();
}

function normFlightNumber(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}

// --- counts ----------------------------------------------------------------------------------

/** Blank vs 0 is equivalent; blank vs non-zero and any other difference is real. */
function countDiff(
  field: string,
  a: number | undefined,
  b: number | undefined,
): FieldDiff | undefined {
  if (a === b) return undefined;
  if ((a === undefined && b === 0) || (b === undefined && a === 0)) {
    return make(field, a, b, { class: 'equivalent' });
  }
  return make(field, a, b, { class: 'real' });
}

function sumOrValue(
  whole: number | undefined,
  x: number | undefined,
  y: number | undefined,
): number | undefined {
  if (whole !== undefined) return whole;
  if (x === undefined && y === undefined) return undefined;
  return (x ?? 0) + (y ?? 0);
}

function nightLandingPair(a: SourceCounts, b: SourceCounts): [number, number] | undefined {
  if (a.nightLandings !== undefined && b.nightLandings !== undefined) {
    return [a.nightLandings, b.nightLandings];
  }
  if (a.nightFullStopLandings !== undefined && b.nightFullStopLandings !== undefined) {
    return [a.nightFullStopLandings, b.nightFullStopLandings];
  }
  // Mixed definitions: comparable only when the all-landings side has no touch-and-goes.
  if (a.nightLandings !== undefined && b.nightFullStopLandings !== undefined && !a.touchAndGoes) {
    return [a.nightLandings, b.nightFullStopLandings];
  }
  if (b.nightLandings !== undefined && a.nightFullStopLandings !== undefined && !b.touchAndGoes) {
    return [a.nightFullStopLandings, b.nightLandings];
  }
  return undefined;
}

// --- approaches ------------------------------------------------------------------------------

function approachKey(x: Approach): string {
  return `${x.type}|${x.runway ?? ''}|${x.airport ?? ''}`;
}

function approachText(list: Approach[]): string | undefined {
  if (list.length === 0) return undefined;
  const items = list.map((x) => ({
    key: approachKey(x),
    text: [x.type, x.runway, x.airport].filter((p) => p).join(' '),
  }));
  items.sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
  return items.map((i) => i.text).join(', ');
}

function approachDiff(a: Approach[], b: Approach[]): FieldDiff | undefined {
  const ka = a.map(approachKey).sort();
  const kb = b.map(approachKey).sort();
  if (ka.length === kb.length && ka.every((k, i) => k === kb[i])) return undefined;
  return make('approaches', approachText(a), approachText(b), {
    class: approachBlankRunwayOnly(a, b) ? 'equivalent' : 'real',
  });
}

/** Same count, same type and airport multiset, runways differ only where one side is blank. */
function approachBlankRunwayOnly(a: Approach[], b: Approach[]): boolean {
  if (a.length !== b.length) return false;
  const group = (list: Approach[]): Map<string, string[]> => {
    const m = new Map<string, string[]>();
    for (const x of list) {
      const k = `${x.type}|${x.airport ?? ''}`;
      const arr = m.get(k) ?? [];
      arr.push(x.runway ?? '');
      m.set(k, arr);
    }
    return m;
  };
  const ga = group(a);
  const gb = group(b);
  if (ga.size !== gb.size) return false;
  for (const [k, ra] of ga) {
    const rb = gb.get(k);
    if (!rb || rb.length !== ra.length) return false;
    // Cancel runways present on both sides; what is left must be blank on one whole side.
    const rest = [...rb];
    const left: string[] = [];
    for (const r of ra) {
      const i = rest.indexOf(r);
      if (i >= 0) rest.splice(i, 1);
      else left.push(r);
    }
    if (!(left.every((r) => r === '') || rest.every((r) => r === ''))) return false;
  }
  return true;
}

// --- pilot flying ----------------------------------------------------------------------------

function pilotFlyingDiff(a: boolean | undefined, b: boolean | undefined): FieldDiff | undefined {
  if (a === b) return undefined;
  if (a === undefined) return make('pilotFlying', a, b, missing('missing-a'));
  if (b === undefined) return make('pilotFlying', a, b, missing('missing-b'));
  return make('pilotFlying', a, b, { class: 'real' });
}

// --- people ----------------------------------------------------------------------------------

/** `Example; Pat`, `Example, Pat`, `Pat Example` and `pat  example` all give `pat example`. */
export function nameKey(name: string): string {
  let s = name.replace(/\./g, '');
  const i = s.search(/[;,]/);
  if (i >= 0) s = `${s.slice(i + 1)} ${s.slice(0, i)}`;
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function peopleDiff(a: SourceRecord, b: SourceRecord): FieldDiff | undefined {
  const sa = new Set(a.people.map((p) => `${p.role}:${nameKey(p.name)}`));
  const sb = new Set(b.people.map((p) => `${p.role}:${nameKey(p.name)}`));
  const aInB = [...sa].every((k) => sb.has(k));
  const bInA = [...sb].every((k) => sa.has(k));
  if (aInB && bInA) return undefined;
  let verdict: Verdict = { class: 'real' };
  if (aInB) verdict = missing('missing-a');
  else if (bInA) verdict = missing('missing-b');
  // Counts only, never names.
  return make('people', a.people.length, b.people.length, verdict);
}

// --- remarks ---------------------------------------------------------------------------------

function remarksDiff(a: string | undefined, b: string | undefined): FieldDiff | undefined {
  const na = (a ?? '').replace(/\s+/g, ' ').trim();
  const nb = (b ?? '').replace(/\s+/g, ' ').trim();
  // Lengths only, never the text.
  const la = a?.length;
  const lb = b?.length;
  if (na === nb) {
    return a === b ? undefined : make('remarks', la, lb, { class: 'equivalent' });
  }
  if (na === '') return make('remarks', la, lb, missing('missing-a'));
  if (nb === '') return make('remarks', la, lb, missing('missing-b'));
  return make('remarks', la, lb, { class: 'real' });
}
