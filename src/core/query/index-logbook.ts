import { valueOn } from '../model';
import type { AircraftType, Airframe, Entry, Logbook, Person, TrainingDevice } from '../model';
import type { LogbookIndex } from './types';

/** Builds id lookups over a logbook once, for reuse by filters, reports and the UI. */
export function indexLogbook(logbook: Logbook): LogbookIndex {
  const airframes = new Map<string, Airframe>(logbook.airframes.map((a) => [a.id, a]));
  const types = new Map<string, AircraftType>(logbook.aircraftTypes.map((t) => [t.id, t]));
  const devices = new Map<string, TrainingDevice>(logbook.devices.map((d) => [d.id, d]));
  const people = new Map<string, Person>(logbook.people.map((p) => [p.id, p]));

  const airframeOf = (entry: Entry): Airframe | undefined =>
    entry.airframeId === undefined ? undefined : airframes.get(entry.airframeId);

  const deviceOf = (entry: Entry): TrainingDevice | undefined =>
    entry.deviceId === undefined ? undefined : devices.get(entry.deviceId);

  const typeOf = (entry: Entry): AircraftType | undefined => {
    if (entry.typeOverride !== undefined) return types.get(entry.typeOverride);
    const airframe = airframeOf(entry);
    if (airframe) {
      const typeId = valueOn(airframe.configurations, entry.date);
      const type = typeId === undefined ? undefined : types.get(typeId);
      if (type) return type;
    }
    const represents = deviceOf(entry)?.represents;
    return represents === undefined ? undefined : types.get(represents);
  };

  const tailOf = (entry: Entry): string | undefined => {
    const airframe = airframeOf(entry);
    if (airframe) {
      return valueOn(airframe.registrations, entry.date) ?? airframe.registrations[0]?.value;
    }
    return deviceOf(entry)?.name;
  };

  const inUse = new Map<string, AircraftType>();
  let first: string | undefined;
  let last: string | undefined;
  for (const entry of logbook.entries) {
    if (entry.deletedAt !== undefined) continue;
    const type = typeOf(entry);
    if (type) inUse.set(type.id, type);
    if (entry.date !== '') {
      if (first === undefined || entry.date < first) first = entry.date;
      if (last === undefined || entry.date > last) last = entry.date;
    }
  }
  const typesInUse = [...inUse.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    airframeOf,
    deviceOf,
    typeOf,
    tailOf,
    person: (id) => people.get(id),
    typesInUse,
    dateRange: first === undefined || last === undefined ? undefined : { first, last },
  };
}
