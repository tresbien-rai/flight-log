import { valueOn } from '../model';
import type { AircraftType, Airframe, Entry, Logbook, TrainingDevice } from '../model';
import type { RuleContext, ValidateOptions } from './types';

/** Indexes the logbook's reference data once so rules can look things up cheaply. */
export function createContext(logbook: Logbook, options: ValidateOptions = {}): RuleContext {
  const airframes = new Map<string, Airframe>(logbook.airframes.map((a) => [a.id, a]));
  const types = new Map<string, AircraftType>(logbook.aircraftTypes.map((t) => [t.id, t]));
  const devices = new Map<string, TrainingDevice>(logbook.devices.map((d) => [d.id, d]));

  const airframeOf = (entry: Entry): Airframe | undefined =>
    entry.airframeId === undefined ? undefined : airframes.get(entry.airframeId);

  return {
    logbook,
    airports: options.airports,
    airframeOf,
    typeOf(entry) {
      if (entry.typeOverride !== undefined) return types.get(entry.typeOverride);
      const airframe = airframeOf(entry);
      if (!airframe) return undefined;
      const typeId = valueOn(airframe.configurations, entry.date);
      return typeId === undefined ? undefined : types.get(typeId);
    },
    deviceOf: (entry) => (entry.deviceId === undefined ? undefined : devices.get(entry.deviceId)),
  };
}
