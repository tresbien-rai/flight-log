import { hours } from '../format';
import type { EntryRule, Finding } from '../types';
import { finding, haversineNm, resolveEnds } from './helpers';

const XC_MIN_NM = 50;
const MAX_KT = 600;
const MIN_KT = 40;
const JET_CRUISE_KT = 380;
const MIN_KT_DISTANCE_NM = 50;

export const implausibleDuration: EntryRule = {
  id: 'implausible-duration',
  title: 'Plausible flight duration',
  description:
    'Flags flights that are very long for the aircraft, or whose time and distance imply a speed no aircraft of this kind could fly.',
  scope: 'entry',
  check(entry, ctx) {
    if (entry.kind !== 'flight') return [];
    const total = entry.durations.total;
    const out: Finding[] = [];
    const fields = ['durations.total'];
    if (total > 16 * 60) {
      out.push(
        finding(
          'implausible-duration',
          'warning',
          [entry.id],
          fields,
          `Total time of ${hours(total)} is longer than 16.0 hours for one flight.`,
        ),
      );
    } else if (total > 8 * 60 && ctx.typeOf(entry)?.engine === 'piston') {
      out.push(
        finding(
          'implausible-duration',
          'warning',
          [entry.id],
          fields,
          `Total time of ${hours(total)} is longer than 8.0 hours for a piston aircraft.`,
        ),
      );
    }
    const ends = resolveEnds(entry, ctx);
    if (ends && total > 0 && ends.from.ident !== ends.to.ident) {
      const nm = haversineNm(ends.from, ends.to);
      const kt = nm / (total / 60);
      const where = `${entry.from} to ${entry.to}`;
      // A jet's block time is roughly cruise time plus half an hour on the ground. More than
      // double that plus an hour is almost always a mistyped time. Block speed alone is no
      // guide: a short leg with a long taxi is slow and perfectly normal.
      const engine = ctx.typeOf(entry)?.engine;
      const jet = engine === 'turbofan' || engine === 'turbojet';
      const expected = (nm / JET_CRUISE_KT) * 60 + 30;
      const tooSlow = jet ? total > 2 * expected + 60 : kt < MIN_KT && nm > MIN_KT_DISTANCE_NM;
      if (kt > MAX_KT) {
        out.push(
          finding(
            'implausible-duration',
            'warning',
            [entry.id],
            [...fields, 'from', 'to'],
            `${Math.round(nm)} NM from ${where} in ${hours(total)} implies ${Math.round(kt)} kt, faster than any likely aircraft.`,
          ),
        );
      } else if (tooSlow) {
        out.push(
          finding(
            'implausible-duration',
            'warning',
            [entry.id],
            [...fields, 'from', 'to'],
            `${Math.round(nm)} NM from ${where} in ${hours(total)} implies only ${Math.round(kt)} kt, far slower than this aircraft flies.`,
          ),
        );
      }
    }
    return out;
  },
};

export const xc50TooShort: EntryRule = {
  id: 'xc50-too-short',
  title: '50 NM cross-country is far enough',
  description:
    'Cross-country time over 50 NM needs airports more than 50 NM apart; this rule only checks flights between two different known airports.',
  scope: 'entry',
  check(entry, ctx) {
    if (entry.kind !== 'flight' || entry.durations.crossCountry50 <= 0) return [];
    const ends = resolveEnds(entry, ctx);
    if (!ends || ends.from.ident === ends.to.ident) return [];
    const nm = haversineNm(ends.from, ends.to);
    if (nm >= XC_MIN_NM) return [];
    return [
      finding(
        'xc50-too-short',
        'warning',
        [entry.id],
        ['durations.crossCountry50', 'from', 'to'],
        `Cross-country (50 NM) time of ${hours(entry.durations.crossCountry50)} is logged but ${entry.from} and ${entry.to} are only ${Math.round(nm)} NM apart.`,
      ),
    ];
  },
};

export const unknownAirport: EntryRule = {
  id: 'unknown-airport',
  title: 'Airports are recognised',
  description: 'Each airport on a flight should be found in the airport list.',
  scope: 'entry',
  check(entry, ctx) {
    if (entry.kind !== 'flight' || !ctx.airports) return [];
    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const field of ['from', 'to'] as const) {
      const ident = entry[field];
      if (!ident || seen.has(ident) || ctx.airports(ident)) continue;
      seen.add(ident);
      const fields = entry.from === entry.to ? ['from', 'to'] : [field];
      out.push(
        finding(
          'unknown-airport',
          'note',
          [entry.id],
          fields,
          `The airport "${ident}" is not in the airport list.`,
        ),
      );
    }
    return out;
  },
};

export const missingAirport: EntryRule = {
  id: 'missing-airport',
  title: 'Departure airport recorded',
  description: 'A flight should say where it departed from.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight' || entry.from) return [];
    return [
      finding(
        'missing-airport',
        'note',
        [entry.id],
        ['from'],
        'This flight has no departure airport.',
      ),
    ];
  },
};

export const AIRPORT_RULES = [
  implausibleDuration,
  xc50TooShort,
  unknownAirport,
  missingAirport,
] as const;
