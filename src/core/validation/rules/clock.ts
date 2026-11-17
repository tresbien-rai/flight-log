import type { Entry } from '../../model';
import { clock, hours, instantMs, minutesBetween } from '../format';
import type { EntryRule } from '../types';
import { dayNumber, finding } from './helpers';

/** Tolerance that absorbs tenth-of-an-hour rounding of a typed total. */
const TOLERANCE_MIN = 3;

const SEQUENCE = ['out', 'off', 'on', 'in'] as const;

export const clockOrder: EntryRule = {
  id: 'clock-order',
  title: 'Clock times in order',
  description: 'Out, off, on and in times must happen in that order (equal times are allowed).',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight') return [];
    let prev: { name: string; ms: number; text: string } | undefined;
    for (const name of SEQUENCE) {
      const text = entry[name];
      const ms = instantMs(text);
      if (text === undefined || ms === undefined) continue;
      if (prev && ms < prev.ms) {
        return [
          finding(
            'clock-order',
            'error',
            [entry.id],
            [prev.name, name],
            `The ${name} time (${clock(text)}) is earlier than the ${prev.name} time (${clock(prev.text)}).`,
          ),
        ];
      }
      prev = { name, ms, text };
    }
    return [];
  },
};

/** In minus out, when both are present and in is not before out. */
function blockMinutes(entry: Entry): number | undefined {
  const block = minutesBetween(entry.out, entry.in);
  return block !== undefined && block >= 0 ? block : undefined;
}

export const totalVsBlock: EntryRule = {
  id: 'total-vs-block',
  title: 'Total matches block time',
  description: 'When the total is taken from block times it must equal the time from out to in.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight' || entry.totalSource !== 'block') return [];
    const block = blockMinutes(entry);
    if (block === undefined || block === entry.durations.total) return [];
    return [
      finding(
        'total-vs-block',
        'error',
        [entry.id],
        ['durations.total', 'out', 'in'],
        `Total time (${hours(entry.durations.total)}) does not equal block time (${hours(block)}) from ${clock(entry.out!)} to ${clock(entry.in!)}.`,
      ),
    ];
  },
};

export const totalVsHobbs: EntryRule = {
  id: 'total-vs-hobbs',
  title: 'Total matches Hobbs',
  description: 'When the total is taken from the Hobbs meter it must equal the Hobbs difference.',
  scope: 'entry',
  check(entry) {
    const { hobbsIn, hobbsOut } = entry;
    if (entry.kind !== 'flight' || entry.totalSource !== 'hobbs') return [];
    if (hobbsIn === undefined || hobbsOut === undefined) return [];
    const fields = ['durations.total', 'hobbsOut', 'hobbsIn'];
    if (hobbsIn < hobbsOut) {
      return [
        finding(
          'total-vs-hobbs',
          'error',
          [entry.id],
          fields,
          `Hobbs in (${(hobbsIn / 10).toFixed(1)}) is lower than Hobbs out (${(hobbsOut / 10).toFixed(1)}).`,
        ),
      ];
    }
    const derived = Math.round((hobbsIn - hobbsOut) * 6);
    if (derived === entry.durations.total) return [];
    return [
      finding(
        'total-vs-hobbs',
        'error',
        [entry.id],
        fields,
        `Total time (${hours(entry.durations.total)}) does not equal the Hobbs difference (${hours(derived)}).`,
      ),
    ];
  },
};

export const blockTypedMismatch: EntryRule = {
  id: 'block-typed-mismatch',
  title: 'Typed total close to block time',
  description:
    'A total you typed should agree with the time from out to in, give or take a few minutes of rounding; a bigger gap often means a typo.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight' || entry.totalSource !== 'typed') return [];
    const block = blockMinutes(entry);
    if (block === undefined) return [];
    const total = entry.durations.total;
    if (Math.abs(total - block) <= TOLERANCE_MIN) return [];
    return [
      finding(
        'block-typed-mismatch',
        'warning',
        [entry.id],
        ['durations.total', 'out', 'in'],
        `Typed total (${hours(total)}) differs from block time (${hours(block)}) between ${clock(entry.out!)} and ${clock(entry.in!)}.`,
      ),
    ];
  },
};

export const airborneExceedsBlock: EntryRule = {
  id: 'airborne-exceeds-block',
  title: 'Airborne time within total',
  description:
    'The time between takeoff and landing cannot be longer than the total time of the flight.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight') return [];
    const airborne = minutesBetween(entry.off, entry.on);
    if (airborne === undefined || airborne <= entry.durations.total + TOLERANCE_MIN) return [];
    return [
      finding(
        'airborne-exceeds-block',
        'error',
        [entry.id],
        ['off', 'on', 'durations.total'],
        `Airborne time (${hours(airborne)}) from ${clock(entry.off!)} to ${clock(entry.on!)} exceeds total time (${hours(entry.durations.total)}).`,
      ),
    ];
  },
};

export const dateVsOut: EntryRule = {
  id: 'date-vs-out',
  title: 'Date matches out time',
  description:
    'The local date can differ from the UTC date of the out time by at most one day; more than that suggests a wrong date.',
  scope: 'entry',
  check(entry) {
    const ms = instantMs(entry.out);
    if (entry.kind !== 'flight' || ms === undefined) return [];
    const utcDate = new Date(ms).toISOString().slice(0, 10);
    const a = dayNumber(utcDate);
    const b = dayNumber(entry.date);
    if (a === undefined || b === undefined || Math.abs(a - b) <= 1) return [];
    return [
      finding(
        'date-vs-out',
        'warning',
        [entry.id],
        ['date', 'out'],
        `The entry date (${entry.date}) is more than a day from the UTC date of the out time (${utcDate}).`,
      ),
    ];
  },
};

export const CLOCK_RULES = [
  clockOrder,
  totalVsBlock,
  totalVsHobbs,
  blockTypedMismatch,
  airborneExceedsBlock,
  dateVsOut,
] as const;
