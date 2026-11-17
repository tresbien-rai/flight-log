import { valueOn } from '../../model';
import type { EntryRule, Finding } from '../types';
import { finding } from './helpers';

export const missingAircraft: EntryRule = {
  id: 'missing-aircraft',
  title: 'Aircraft or device recorded',
  description:
    'A flight needs an aircraft that exists in your logbook, and a simulator session needs a known training device.',
  scope: 'entry',
  check(entry, ctx) {
    if (entry.kind === 'flight') {
      if (entry.airframeId === undefined) {
        return [
          finding(
            'missing-aircraft',
            'warning',
            [entry.id],
            ['airframeId'],
            'This flight has no aircraft.',
          ),
        ];
      }
      if (!ctx.airframeOf(entry)) {
        return [
          finding(
            'missing-aircraft',
            'warning',
            [entry.id],
            ['airframeId'],
            `The aircraft "${entry.airframeId}" is not in the logbook.`,
          ),
        ];
      }
    } else if (entry.kind === 'simulator') {
      if (entry.deviceId === undefined) {
        return [
          finding(
            'missing-aircraft',
            'warning',
            [entry.id],
            ['deviceId'],
            'This simulator session has no training device.',
          ),
        ];
      }
      if (!ctx.deviceOf(entry)) {
        return [
          finding(
            'missing-aircraft',
            'warning',
            [entry.id],
            ['deviceId'],
            `The training device "${entry.deviceId}" is not in the logbook.`,
          ),
        ];
      }
    }
    return [];
  },
};

export const aircraftNotInService: EntryRule = {
  id: 'aircraft-not-in-service',
  title: 'Aircraft in service on the date',
  description:
    'The aircraft should have a type and a registration on the date of the flight; a gap means the dates on the aircraft record are wrong or the flight is.',
  scope: 'entry',
  check(entry, ctx) {
    if (entry.kind !== 'flight') return [];
    const airframe = ctx.airframeOf(entry);
    if (!airframe) return [];
    const out: Finding[] = [];
    if (
      airframe.configurations.length > 0 &&
      entry.typeOverride === undefined &&
      valueOn(airframe.configurations, entry.date) === undefined
    ) {
      out.push(
        finding(
          'aircraft-not-in-service',
          'warning',
          [entry.id],
          ['airframeId', 'date'],
          `Aircraft "${airframe.id}" has no type in force on ${entry.date}.`,
        ),
      );
    }
    if (
      airframe.registrations.length > 0 &&
      valueOn(airframe.registrations, entry.date) === undefined
    ) {
      out.push(
        finding(
          'aircraft-not-in-service',
          'warning',
          [entry.id],
          ['airframeId', 'date'],
          `Aircraft "${airframe.id}" has no registration in force on ${entry.date}.`,
        ),
      );
    }
    return out;
  },
};

export const AIRCRAFT_RULES = [missingAircraft, aircraftNotInService] as const;
