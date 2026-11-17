import { DURATION_FIELDS, totalLandings } from '../../model';
import { fieldLabel, hours } from '../format';
import type { EntryRule } from '../types';
import { finding } from './helpers';

export const simulatorShape: EntryRule = {
  id: 'simulator-shape',
  title: 'Simulator and ground entries have the right shape',
  description:
    'Simulator sessions record their time as simulator time with no flight time, takeoffs or landings; ground sessions record only ground training.',
  scope: 'entry',
  check(entry) {
    if (entry.kind === 'simulator') {
      const problems: string[] = [];
      const fields: string[] = [];
      if (entry.durations.total > 0) {
        problems.push(`total time of ${hours(entry.durations.total)}`);
        fields.push('durations.total');
      }
      const t = entry.dayTakeoffs + entry.nightTakeoffs;
      const l = totalLandings(entry.landings);
      if (t > 0 || l > 0) {
        problems.push(`${t} takeoffs and ${l} landings`);
        fields.push('dayTakeoffs', 'nightTakeoffs', 'landings');
      }
      if (problems.length === 0) return [];
      return [
        finding(
          'simulator-shape',
          'warning',
          [entry.id],
          fields,
          `This simulator session has ${problems.join(' and ')}; simulator sessions use simulator time only.`,
        ),
      ];
    }
    if (entry.kind === 'ground') {
      const extra = DURATION_FIELDS.filter((f) => f !== 'groundTraining' && entry.durations[f] > 0);
      if (extra.length === 0) return [];
      return [
        finding(
          'simulator-shape',
          'warning',
          [entry.id],
          extra.map((f) => `durations.${f}`),
          `This ground session has ${extra.map((f) => `${fieldLabel(f).toLowerCase()} (${hours(entry.durations[f])})`).join(', ')}; ground sessions use ground training time only.`,
        ),
      ];
    }
    return [];
  },
};

export const SHAPE_RULES = [simulatorShape] as const;
