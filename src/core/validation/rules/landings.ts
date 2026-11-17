import { nightLandings, totalLandings } from '../../model';
import type { Entry } from '../../model';
import { hours } from '../format';
import type { EntryRule } from '../types';
import { finding } from './helpers';

function takeoffs(entry: Entry): number {
  return entry.dayTakeoffs + entry.nightTakeoffs;
}

export const nightLandingWithoutNight: EntryRule = {
  id: 'night-landing-without-night',
  title: 'Night landings need night time',
  description: 'A flight with night landings should have some night time logged.',
  scope: 'entry',
  check(entry) {
    const n = nightLandings(entry.landings);
    if (entry.kind !== 'flight' || n <= 0 || entry.durations.night !== 0) return [];
    return [
      finding(
        'night-landing-without-night',
        'warning',
        [entry.id],
        ['landings', 'durations.night'],
        `${n} night landing${n === 1 ? '' : 's'} logged but night time is ${hours(0)}.`,
      ),
    ];
  },
};

export const nightTakeoffWithoutNight: EntryRule = {
  id: 'night-takeoff-without-night',
  title: 'Night takeoffs need night time',
  description: 'A flight with night takeoffs should have some night time logged.',
  scope: 'entry',
  check(entry) {
    const n = entry.nightTakeoffs;
    if (entry.kind !== 'flight' || n <= 0 || entry.durations.night !== 0) return [];
    return [
      finding(
        'night-takeoff-without-night',
        'warning',
        [entry.id],
        ['nightTakeoffs', 'durations.night'],
        `${n} night takeoff${n === 1 ? '' : 's'} logged but night time is ${hours(0)}.`,
      ),
    ];
  },
};

export const takeoffLandingMismatch: EntryRule = {
  id: 'takeoff-landing-mismatch',
  title: 'Takeoffs and landings agree',
  description:
    'A flight that took off must have landed and the other way round, and the two counts should be within one of each other. Having neither is normal for the pilot monitoring.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight') return [];
    const t = takeoffs(entry);
    const l = totalLandings(entry.landings);
    const fields = ['dayTakeoffs', 'nightTakeoffs', 'landings'];
    if (t === 0 && l === 0) return [];
    if (t === 0 || l === 0) {
      if (!entry.from || !entry.to) return [];
      return [
        finding(
          'takeoff-landing-mismatch',
          'error',
          [entry.id],
          fields,
          `The flight from ${entry.from} to ${entry.to} has ${t} takeoff${t === 1 ? '' : 's'} but ${l} landing${l === 1 ? '' : 's'}.`,
        ),
      ];
    }
    if (Math.abs(t - l) > 1) {
      return [
        finding(
          'takeoff-landing-mismatch',
          'warning',
          [entry.id],
          fields,
          `${t} takeoff${t === 1 ? '' : 's'} but ${l} landing${l === 1 ? '' : 's'} are logged.`,
        ),
      ];
    }
    return [];
  },
};

export const tooManyLandings: EntryRule = {
  id: 'too-many-landings',
  title: 'Plausible number of landings',
  description:
    'More than one landing every four minutes (or more than 60 takeoffs or landings) is very unlikely.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight') return [];
    const t = takeoffs(entry);
    const l = totalLandings(entry.landings);
    const total = entry.durations.total;
    const fields = ['dayTakeoffs', 'nightTakeoffs', 'landings', 'durations.total'];
    if (t > 60 || l > 60) {
      return [
        finding(
          'too-many-landings',
          'error',
          [entry.id],
          fields,
          `${t} takeoffs and ${l} landings are logged in ${hours(total)}, which cannot be right.`,
        ),
      ];
    }
    if (l > 0 && total > 0 && l > Math.max(3, total / 4)) {
      return [
        finding(
          'too-many-landings',
          'warning',
          [entry.id],
          fields,
          `${l} landings in ${hours(total)} is more than one every four minutes.`,
        ),
      ];
    }
    return [];
  },
};

export const pilotFlyingWithoutLanding: EntryRule = {
  id: 'pilot-flying-without-landing',
  title: 'Pilot flying has a takeoff or landing',
  description:
    'On an airline leg where you were the pilot flying, you should have at least one takeoff or landing.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight' || entry.pilotFlying !== true || entry.rule !== '121') return [];
    if (takeoffs(entry) + totalLandings(entry.landings) !== 0) return [];
    return [
      finding(
        'pilot-flying-without-landing',
        'note',
        [entry.id],
        ['pilotFlying', 'dayTakeoffs', 'nightTakeoffs', 'landings'],
        'You are marked as pilot flying but no takeoffs or landings are logged.',
      ),
    ];
  },
};

export const LANDING_RULES = [
  nightLandingWithoutNight,
  nightTakeoffWithoutNight,
  takeoffLandingMismatch,
  tooManyLandings,
  pilotFlyingWithoutLanding,
] as const;
