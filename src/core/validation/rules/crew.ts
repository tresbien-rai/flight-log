import { hours } from '../format';
import type { EntryRule } from '../types';
import { finding } from './helpers';

const FLYING_ROLES = ['PIC', 'SIC', 'instructor', 'student', 'examiner'];

export const soloInconsistent: EntryRule = {
  id: 'solo-inconsistent',
  title: 'Solo time is really solo',
  description:
    'Solo time means flying alone as pilot in command: no instruction received and no other pilot, instructor, student or examiner aboard.',
  scope: 'entry',
  check(entry) {
    const { solo, pic, dualReceived } = entry.durations;
    if (entry.kind !== 'flight' || solo <= 0) return [];
    const reasons: string[] = [];
    const fields = ['durations.solo'];
    if (solo > pic) {
      reasons.push(`solo (${hours(solo)}) exceeds PIC (${hours(pic)})`);
      fields.push('durations.pic');
    }
    if (dualReceived > 0) {
      reasons.push(`dual received is ${hours(dualReceived)}`);
      fields.push('durations.dualReceived');
    }
    // A PIC in the crew list on a solo flight is the pilot naming themself, so it is ignored.
    const others = entry.crew.filter((c) => c.role !== 'PIC' && FLYING_ROLES.includes(c.role));
    if (others.length > 0) {
      reasons.push(`crew includes ${[...new Set(others.map((c) => c.role))].join(', ')}`);
      fields.push('crew');
    }
    if (reasons.length === 0) return [];
    return [
      finding(
        'solo-inconsistent',
        'error',
        [entry.id],
        fields,
        `Solo time of ${hours(solo)} is inconsistent: ${reasons.join('; ')}.`,
      ),
    ];
  },
};

export const dualReceivedWithoutInstructor: EntryRule = {
  id: 'dual-received-without-instructor',
  title: 'Dual received names an instructor',
  description: 'Instruction received should name the instructor or examiner in the crew.',
  scope: 'entry',
  check(entry) {
    const dual = entry.durations.dualReceived;
    if (entry.kind !== 'flight' || dual <= 0) return [];
    if (entry.crew.some((c) => c.role === 'instructor' || c.role === 'examiner')) return [];
    return [
      finding(
        'dual-received-without-instructor',
        'note',
        [entry.id],
        ['durations.dualReceived', 'crew'],
        `Dual received of ${hours(dual)} is logged but no instructor or examiner is named.`,
      ),
    ];
  },
};

export const airlineIncomplete: EntryRule = {
  id: 'airline-incomplete',
  title: 'Airline leg is complete',
  description: 'A Part 121 leg should have a flight number, crew and seat recorded.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight' || entry.rule !== '121') return [];
    const missing: string[] = [];
    const fields: string[] = [];
    if (!entry.flightNumber) {
      missing.push('flight number');
      fields.push('flightNumber');
    }
    if (entry.crew.length === 0) {
      missing.push('crew');
      fields.push('crew');
    }
    if (entry.seat === undefined) {
      missing.push('seat');
      fields.push('seat');
    }
    if (missing.length === 0) return [];
    return [
      finding(
        'airline-incomplete',
        'note',
        [entry.id],
        fields,
        `This Part 121 leg is missing its ${missing.join(', ')}.`,
      ),
    ];
  },
};

export const seatTimeMismatch: EntryRule = {
  id: 'seat-time-mismatch',
  title: 'Seat matches PIC/SIC time',
  description: 'The seat you flew from should agree with whether the time is logged as PIC or SIC.',
  scope: 'entry',
  check(entry) {
    const { pic, sic } = entry.durations;
    if (entry.kind !== 'flight') return [];
    if (entry.seat === 'SIC' && pic > 0 && sic === 0) {
      return [
        finding(
          'seat-time-mismatch',
          'warning',
          [entry.id],
          ['seat', 'durations.pic', 'durations.sic'],
          `Seat is SIC but the time is logged as PIC (${hours(pic)}) with no SIC time.`,
        ),
      ];
    }
    if (entry.seat === 'PIC' && sic > 0 && pic === 0) {
      return [
        finding(
          'seat-time-mismatch',
          'warning',
          [entry.id],
          ['seat', 'durations.pic', 'durations.sic'],
          `Seat is PIC but the time is logged as SIC (${hours(sic)}) with no PIC time.`,
        ),
      ];
    }
    return [];
  },
};

export const CREW_RULES = [
  soloInconsistent,
  dualReceivedWithoutInstructor,
  airlineIncomplete,
  seatTimeMismatch,
] as const;
