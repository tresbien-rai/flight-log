import type { AircraftType, Dated, Entry } from '../../model';
import { clock, instantMs } from '../format';
import type { Finding, LogbookRule } from '../types';
import { airportKey, dayNumber, finding } from './helpers';

const MINUTE_MS = 60_000;
const NEAR_DAYS = 3;

export const duplicateEntry: LogbookRule = {
  id: 'duplicate-entry',
  title: 'No duplicate flights',
  description:
    'Two flights with the same date, aircraft, airports and out time (or total time, when there are no clock times) are probably the same flight entered twice.',
  scope: 'logbook',
  check(entries) {
    const groups = new Map<string, Entry[]>();
    for (const e of entries) {
      if (e.kind !== 'flight' || !e.airframeId || !e.from) continue;
      let when: string;
      if (e.out) when = `out:${e.out}`;
      else if (e.durations.total > 0) when = `total:${e.durations.total}`;
      else continue;
      const key = [
        e.date,
        e.airframeId,
        e.from.toUpperCase(),
        (e.to ?? '').toUpperCase(),
        when,
      ].join('|');
      const group = groups.get(key);
      if (group) group.push(e);
      else groups.set(key, [e]);
    }
    const out: Finding[] = [];
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const first = group[0]!;
      out.push(
        finding(
          'duplicate-entry',
          // Without clock times, equal totals on one day are common (back-to-back lessons).
          first.out ? 'warning' : 'note',
          group.map((e) => e.id),
          ['date', first.out ? 'out' : 'durations.total'],
          `${group.length} flights on ${first.date} in ${first.airframeId} from ${first.from}${first.to ? ` to ${first.to}` : ''} look identical.`,
        ),
      );
    }
    return out;
  },
};

export const overlappingTimes: LogbookRule = {
  id: 'overlapping-times',
  title: 'No overlapping flights',
  description: 'You cannot be on two flights at once, so out-to-in periods should not overlap.',
  scope: 'logbook',
  check(entries) {
    const items = entries
      .map((entry) => ({ entry, out: instantMs(entry.out), in: instantMs(entry.in) }))
      .filter(
        (i): i is { entry: Entry; out: number; in: number } =>
          i.out !== undefined && i.in !== undefined && i.in > i.out,
      );
    items.sort((a, b) => a.out - b.out);
    const out: Finding[] = [];
    let active: typeof items = [];
    for (const cur of items) {
      active = active.filter((a) => a.in - cur.out > MINUTE_MS);
      for (const a of active) {
        const overlap = Math.min(a.in, cur.in) - cur.out;
        if (overlap <= MINUTE_MS) continue;
        out.push(
          finding(
            'overlapping-times',
            'error',
            [a.entry.id, cur.entry.id],
            ['out', 'in'],
            `Flights overlap by ${Math.round(overlap / MINUTE_MS)} minutes: ${clock(a.entry.out!)}-${clock(a.entry.in!)} and ${clock(cur.entry.out!)}-${clock(cur.entry.in!)}.`,
          ),
        );
      }
      active.push(cur);
    }
    return out;
  },
};

export const positionDiscontinuity: LogbookRule = {
  id: 'position-discontinuity',
  title: 'Legs join up',
  description:
    'On the same day, an airline leg should depart from the airport where the previous leg landed.',
  scope: 'logbook',
  check(entries, ctx) {
    const legs = entries.filter(
      (e) =>
        e.kind === 'flight' &&
        e.rule === '121' &&
        instantMs(e.out) !== undefined &&
        instantMs(e.in) !== undefined,
    );
    const out: Finding[] = [];
    for (let i = 1; i < legs.length; i++) {
      const prev = legs[i - 1]!;
      const cur = legs[i]!;
      if (prev.date !== cur.date || !prev.to || !cur.from) continue;
      if (airportKey(prev.to, ctx) === airportKey(cur.from, ctx)) continue;
      out.push(
        finding(
          'position-discontinuity',
          'note',
          [prev.id, cur.id],
          ['to', 'from'],
          `A leg landed at ${prev.to} but the next leg on ${cur.date} departed from ${cur.from}.`,
        ),
      );
    }
    return out;
  },
};

interface Boundary {
  kind: 'type' | 'registration';
  end: string;
  start: string;
  before: string;
  after: string;
}

/** Changes between consecutive periods: a period that ends and a different one that starts later. */
function boundaries(periods: readonly Dated<string>[], kind: Boundary['kind']): Boundary[] {
  const starts = periods
    .filter((p): p is Dated<string> & { from: string } => p.from !== undefined)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const out: Boundary[] = [];
  for (const p of periods) {
    if (p.to === undefined) continue;
    const next = starts.find((s) => s.from > p.to! && s.value !== p.value);
    if (next) out.push({ kind, end: p.to, start: next.from, before: p.value, after: next.value });
  }
  return out;
}

export const nearConfigurationChange: LogbookRule = {
  id: 'near-configuration-change',
  title: 'Flights near an aircraft change',
  description:
    'Flights within three days of an aircraft changing type or registration are the ones most likely to be assigned to the wrong one.',
  scope: 'logbook',
  check(entries, ctx) {
    const cache = new Map<string, Boundary[]>();
    const out: Finding[] = [];
    for (const e of entries) {
      if (e.kind !== 'flight') continue;
      const airframe = ctx.airframeOf(e);
      const day = dayNumber(e.date);
      if (!airframe || day === undefined) continue;
      let list = cache.get(airframe.id);
      if (!list) {
        list = [
          ...boundaries(airframe.configurations, 'type'),
          ...boundaries(airframe.registrations, 'registration'),
        ];
        cache.set(airframe.id, list);
      }
      let best: { b: Boundary; dist: number } | undefined;
      for (const b of list) {
        for (const edge of [b.end, b.start]) {
          const n = dayNumber(edge);
          if (n === undefined) continue;
          const dist = Math.abs(day - n);
          if (dist <= NEAR_DAYS && (!best || dist < best.dist)) best = { b, dist };
        }
      }
      if (!best) continue;
      const { b } = best;
      out.push(
        finding(
          'near-configuration-change',
          'note',
          [e.id],
          ['date', 'airframeId'],
          `This flight on ${e.date} is within ${NEAR_DAYS} days of a ${b.kind} change on aircraft "${airframe.id}" (${b.before} until ${b.end}, ${b.after} from ${b.start}).`,
        ),
      );
    }
    return out;
  },
};

export const hobbsDiscontinuity: LogbookRule = {
  id: 'hobbs-discontinuity',
  title: 'Hobbs readings join up',
  description:
    'The Hobbs-out of a flight should equal the Hobbs-in of the previous flight in the same aircraft.',
  scope: 'logbook',
  check(entries) {
    const last = new Map<string, Entry>();
    const out: Finding[] = [];
    for (const e of entries) {
      if (e.kind !== 'flight' || !e.airframeId) continue;
      const prev = last.get(e.airframeId);
      last.set(e.airframeId, e);
      if (!prev || prev.hobbsIn === undefined || e.hobbsOut === undefined) continue;
      if (prev.hobbsIn === e.hobbsOut) continue;
      out.push(
        finding(
          'hobbs-discontinuity',
          'note',
          [prev.id, e.id],
          ['hobbsIn', 'hobbsOut'],
          `Hobbs out (${(e.hobbsOut / 10).toFixed(1)}) on ${e.date} does not match the previous Hobbs in (${(prev.hobbsIn / 10).toFixed(1)}) for aircraft "${e.airframeId}".`,
        ),
      );
    }
    return out;
  },
};

function isVariantRelated(a: AircraftType, b: AircraftType, byId: Map<string, AircraftType>) {
  const chain = (from: AircraftType, target: string): boolean => {
    const seen = new Set<string>();
    let cur: AircraftType | undefined = from;
    while (cur?.variantOf !== undefined && !seen.has(cur.id)) {
      if (cur.variantOf === target) return true;
      seen.add(cur.id);
      cur = byId.get(cur.variantOf);
    }
    return false;
  };
  return chain(a, b.id) || chain(b, a.id);
}

export const inconsistentTypeAttributes: LogbookRule = {
  id: 'inconsistent-type-attributes',
  title: 'Aircraft types agree',
  description:
    'Two aircraft types with the same ICAO designator should have the same engine and class unless one is a variant of the other.',
  scope: 'logbook',
  check(_entries, ctx) {
    const types = ctx.logbook.aircraftTypes;
    const byId = new Map(types.map((t) => [t.id, t]));
    const byDesignator = new Map<string, AircraftType[]>();
    for (const t of types) {
      if (!t.icaoDesignator) continue;
      const key = t.icaoDesignator.toUpperCase();
      const group = byDesignator.get(key);
      if (group) group.push(t);
      else byDesignator.set(key, [t]);
    }
    const out: Finding[] = [];
    for (const group of byDesignator.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]!;
          const b = group[j]!;
          if (isVariantRelated(a, b, byId)) continue;
          const diffs: string[] = [];
          if (a.engine !== b.engine) diffs.push(`engine (${a.engine} vs ${b.engine})`);
          if (a.class !== b.class) diffs.push(`class (${a.class} vs ${b.class})`);
          if (diffs.length === 0) continue;
          out.push(
            finding(
              'inconsistent-type-attributes',
              'note',
              [],
              [],
              `Aircraft types "${a.id}" and "${b.id}" share the designator ${a.icaoDesignator} but differ in ${diffs.join(' and ')}.`,
            ),
          );
        }
      }
    }
    return out;
  },
};

export const LOGBOOK_RULES = [
  duplicateEntry,
  overlappingTimes,
  positionDiscontinuity,
  nearConfigurationChange,
  hobbsDiscontinuity,
  inconsistentTypeAttributes,
] as const;
