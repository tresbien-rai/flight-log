import type { DurationField } from '../../model';
import { fieldLabel, hours } from '../format';
import type { EntryRule, Finding } from '../types';
import { finding } from './helpers';

const COMPONENT_FIELDS = [
  'pic',
  'sic',
  'solo',
  'night',
  'crossCountry',
  'crossCountry50',
  'actualInstrument',
  'simulatedInstrument',
  'dualReceived',
  'dualGiven',
] as const satisfies readonly DurationField[];

const SIMULATOR_FIELDS = ['simulatedInstrument', 'dualReceived', 'dualGiven'] as const;

export const componentExceedsTotal: EntryRule = {
  id: 'component-exceeds-total',
  title: 'Components within total',
  description:
    'No single category of time (PIC, night, instrument, dual and so on) can be longer than the total time of the flight.',
  scope: 'entry',
  check(entry) {
    const d = entry.durations;
    const out: Finding[] = [];
    if (entry.kind === 'flight') {
      for (const f of COMPONENT_FIELDS) {
        if (d[f] > d.total) {
          out.push(
            finding(
              'component-exceeds-total',
              'error',
              [entry.id],
              [`durations.${f}`, 'durations.total'],
              `${fieldLabel(f)} (${hours(d[f])}) exceeds total time (${hours(d.total)}).`,
            ),
          );
        }
      }
    } else if (entry.kind === 'simulator') {
      for (const f of SIMULATOR_FIELDS) {
        if (d[f] > d.simulator) {
          out.push(
            finding(
              'component-exceeds-total',
              'error',
              [entry.id],
              [`durations.${f}`, 'durations.simulator'],
              `${fieldLabel(f)} (${hours(d[f])}) exceeds simulator time (${hours(d.simulator)}).`,
            ),
          );
        }
      }
    }
    return out;
  },
};

export const picSicOverlap: EntryRule = {
  id: 'pic-sic-overlap',
  title: 'PIC and SIC not overlapping',
  description:
    'You cannot be both pilot in command and second in command for the same minutes, so PIC plus SIC should not be longer than the total.',
  scope: 'entry',
  check(entry) {
    const { pic, sic, total } = entry.durations;
    if (entry.kind !== 'flight' || pic + sic <= total) return [];
    return [
      finding(
        'pic-sic-overlap',
        'warning',
        [entry.id],
        ['durations.pic', 'durations.sic', 'durations.total'],
        `PIC (${hours(pic)}) plus SIC (${hours(sic)}) is longer than total time (${hours(total)}).`,
      ),
    ];
  },
};

export const instrumentExceedsTotal: EntryRule = {
  id: 'instrument-exceeds-total',
  title: 'Instrument time within total',
  description:
    'Actual plus simulated instrument time together cannot be longer than the total time of the flight.',
  scope: 'entry',
  check(entry) {
    const { actualInstrument: a, simulatedInstrument: s, total } = entry.durations;
    if (entry.kind !== 'flight' || a + s <= total) return [];
    if (a > total || s > total) return []; // already reported by component-exceeds-total
    return [
      finding(
        'instrument-exceeds-total',
        'error',
        [entry.id],
        ['durations.actualInstrument', 'durations.simulatedInstrument', 'durations.total'],
        `Actual instrument (${hours(a)}) plus simulated instrument (${hours(s)}) exceeds total time (${hours(total)}).`,
      ),
    ];
  },
};

export const dualGivenWithoutPic: EntryRule = {
  id: 'dual-given-without-pic',
  title: 'Dual given within PIC',
  description:
    'An instructor logs the instruction as pilot in command, so dual given should not exceed PIC time.',
  scope: 'entry',
  check(entry) {
    const { dualGiven, pic } = entry.durations;
    if (entry.kind !== 'flight' || dualGiven <= pic) return [];
    return [
      finding(
        'dual-given-without-pic',
        'warning',
        [entry.id],
        ['durations.dualGiven', 'durations.pic'],
        `Dual given (${hours(dualGiven)}) exceeds PIC time (${hours(pic)}).`,
      ),
    ];
  },
};

export const xc50ExceedsXc: EntryRule = {
  id: 'xc50-exceeds-xc',
  title: '50 NM cross-country within cross-country',
  description:
    'Cross-country time over 50 NM is a subset of cross-country time, so it cannot be longer than it.',
  scope: 'entry',
  check(entry) {
    const { crossCountry: xc, crossCountry50: xc50 } = entry.durations;
    if (entry.kind !== 'flight' || xc <= 0 || xc50 <= xc) return [];
    return [
      finding(
        'xc50-exceeds-xc',
        'warning',
        [entry.id],
        ['durations.crossCountry50', 'durations.crossCountry'],
        `Cross-country (50 NM) time (${hours(xc50)}) exceeds cross-country time (${hours(xc)}).`,
      ),
    ];
  },
};

export const zeroTotal: EntryRule = {
  id: 'zero-total',
  title: 'Flight has time',
  description: 'A flight entry with a total time of zero is probably missing its time.',
  scope: 'entry',
  check(entry) {
    if (entry.kind !== 'flight' || entry.durations.total !== 0) return [];
    return [
      finding(
        'zero-total',
        'warning',
        [entry.id],
        ['durations.total'],
        'This flight has a total time of 0.0.',
      ),
    ];
  },
};

export const COMPONENT_RULES = [
  componentExceedsTotal,
  picSicOverlap,
  instrumentExceedsTotal,
  dualGivenWithoutPic,
  xc50ExceedsXc,
  zeroTotal,
] as const;
