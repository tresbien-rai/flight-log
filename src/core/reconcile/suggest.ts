/**
 * Which app's takeoffs and landings look right, when the two disagree. Pure.
 *
 * Every takeoff is followed by a landing, so a side whose takeoffs and landings do not add up
 * is suspect; a pilot-flying leg with clock times should hold exactly one takeoff and one
 * landing, by day or by night as the sun was; a pilot-monitoring leg should hold none.
 */
import type { AirportLookup } from '../airports/types';
import type { SourceRecord } from '../importers';
import { isNightForLandings } from '../time/sun';
import type { Side, Suggestion } from './types';

export interface TolCounts {
  dayTakeoffs: number;
  nightTakeoffs: number;
  dayLandings: number;
  nightLandings: number;
  /** Landings of every kind, day and night. */
  landings: number;
  /** Known only when the source separates them. */
  touchAndGoes?: number;
}

/** One app's takeoffs and landings on one comparable footing. */
export function tolCounts(r: SourceRecord): TolCounts {
  const c = r.counts;
  const dayTakeoffs = c.dayTakeoffs ?? 0;
  const nightTakeoffs = c.nightTakeoffs ?? 0;
  if (c.dayLandings !== undefined || c.nightLandings !== undefined) {
    const day = c.dayLandings ?? 0;
    const night = c.nightLandings ?? 0;
    const out: TolCounts = {
      dayTakeoffs,
      nightTakeoffs,
      dayLandings: day,
      nightLandings: night,
      landings: day + night,
    };
    if (c.touchAndGoes !== undefined) out.touchAndGoes = c.touchAndGoes;
    return out;
  }
  // Full-stop counts by day and night, plus a total of every landing.
  const nightFs = c.nightFullStopLandings ?? 0;
  const fullStop = c.fullStopLandings ?? (c.dayFullStopLandings ?? 0) + nightFs;
  const landings = c.allLandings ?? fullStop;
  const out: TolCounts = {
    dayTakeoffs,
    nightTakeoffs,
    dayLandings: landings - nightFs,
    nightLandings: nightFs,
    landings,
  };
  if (c.allLandings !== undefined) out.touchAndGoes = Math.max(0, c.allLandings - fullStop);
  return out;
}

const takeoffs = (t: TolCounts) => t.dayTakeoffs + t.nightTakeoffs;
const balanced = (t: TolCounts) => takeoffs(t) === t.landings;
const none = (t: TolCounts) => takeoffs(t) === 0 && t.landings === 0;

/** The UTC instant of a clock time on the record's date, or on the next day if before `after`. */
function instant(date: string, minutes: number, after?: number): number | undefined {
  const day = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(day)) return undefined;
  let ms = day + minutes * 60_000;
  if (after !== undefined && ms < after) ms += 86_400_000;
  return ms;
}

/** Day or night at takeoff and at landing, when times and both airports are known. */
export function expectedNight(
  r: SourceRecord,
  airports: AirportLookup,
): { takeoff: boolean; landing: boolean } | undefined {
  const up = r.clock.off ?? r.clock.out;
  const down = r.clock.on ?? r.clock.in;
  if (up === undefined || down === undefined || r.from === undefined) return undefined;
  const from = airports(r.from);
  const to = r.to === undefined ? from : airports(r.to);
  if (!from || !to) return undefined;
  // Both exports date a leg by the UTC date of departure.
  const off = instant(r.date, up);
  const on = off === undefined ? undefined : instant(r.date, down, off);
  if (off === undefined || on === undefined) return undefined;
  return {
    takeoff: isNightForLandings(off, from.lat, from.lon),
    landing: isNightForLandings(on, to.lat, to.lon),
  };
}

/** The one side that passes a test, if exactly one does. */
function onlyOne(a: boolean, b: boolean): Side | undefined {
  return a === b ? undefined : a ? 'a' : 'b';
}

export function suggestTakeoffsLandings(
  a: SourceRecord,
  b: SourceRecord,
  airports?: AirportLookup,
): Suggestion | undefined {
  const ta = tolCounts(a);
  const tb = tolCounts(b);
  const pf = a.pilotFlying ?? b.pilotFlying;

  if (pf === true && airports) {
    const night = expectedNight(a, airports) ?? expectedNight(b, airports);
    if (night) {
      const fits = (t: TolCounts) =>
        t.dayTakeoffs === (night.takeoff ? 0 : 1) &&
        t.nightTakeoffs === (night.takeoff ? 1 : 0) &&
        t.dayLandings === (night.landing ? 0 : 1) &&
        t.nightLandings === (night.landing ? 1 : 0);
      const side = onlyOne(fits(ta), fits(tb));
      if (side) {
        return {
          side,
          reason: night.takeoff || night.landing ? 'pilot-flying-night' : 'pilot-flying-day',
        };
      }
    }
  }
  if (pf === false) {
    const side = onlyOne(none(ta), none(tb));
    if (side) return { side, reason: 'pilot-monitoring' };
  }
  const side = onlyOne(balanced(ta), balanced(tb));
  if (side) return { side, reason: 'balanced' };
  if (pf === true) {
    const flown = onlyOne(!none(ta), !none(tb));
    if (flown) return { side: flown, reason: 'pilot-flying' };
  }
  return undefined;
}
