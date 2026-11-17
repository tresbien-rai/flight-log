import { hours } from '../format';
import type { EntryRule } from '../types';
import { finding } from './helpers';

export const approachWithoutInstrument: EntryRule = {
  id: 'approach-without-instrument',
  title: 'Approaches need instrument time',
  description:
    'A flight with instrument approaches should have actual or simulated instrument time.',
  scope: 'entry',
  check(entry) {
    const { actualInstrument: a, simulatedInstrument: s } = entry.durations;
    const n = entry.approaches.length;
    if (entry.kind !== 'flight' || n === 0 || a + s !== 0) return [];
    return [
      finding(
        'approach-without-instrument',
        'note',
        [entry.id],
        ['approaches', 'durations.actualInstrument', 'durations.simulatedInstrument'],
        `${n} approach${n === 1 ? '' : 'es'} logged but instrument time is ${hours(0)}.`,
      ),
    ];
  },
};

export const holdsWithoutInstrument: EntryRule = {
  id: 'holds-without-instrument',
  title: 'Holds need instrument time',
  description: 'A flight with holding patterns should have actual or simulated instrument time.',
  scope: 'entry',
  check(entry) {
    const { actualInstrument: a, simulatedInstrument: s } = entry.durations;
    if (entry.kind !== 'flight' || entry.holds <= 0 || a + s !== 0) return [];
    return [
      finding(
        'holds-without-instrument',
        'note',
        [entry.id],
        ['holds', 'durations.actualInstrument', 'durations.simulatedInstrument'],
        `${entry.holds} hold${entry.holds === 1 ? '' : 's'} logged but instrument time is ${hours(0)}.`,
      ),
    ];
  },
};

export const INSTRUMENT_RULES = [approachWithoutInstrument, holdsWithoutInstrument] as const;
