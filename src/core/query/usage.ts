import type { Entry } from '../model';
import type { AircraftUsage, LogbookIndex, Usage } from './types';

const empty = (): Usage => ({ flights: 0, minutes: 0, sessions: 0, sessionMinutes: 0 });

function add(map: Map<string, Usage>, id: string | undefined, entry: Entry): void {
  if (id === undefined) return;
  let u = map.get(id);
  if (!u) {
    u = empty();
    map.set(id, u);
  }
  if (entry.kind === 'flight') {
    u.flights++;
    u.minutes += entry.durations.total;
  } else if (entry.kind === 'simulator') {
    u.sessions++;
    u.sessionMinutes += entry.durations.simulator;
  }
  if (entry.date !== '') {
    if (u.first === undefined || entry.date < u.first) u.first = entry.date;
    if (u.last === undefined || entry.date > u.last) u.last = entry.date;
  }
}

/**
 * Flights and flight time per aircraft type, airframe and training device. A flight counts
 * under the type its airframe was on that date; a simulator session counts under its device
 * and under the type the device represents. Deleted entries and ground sessions do not count.
 */
export function aircraftUsage(entries: readonly Entry[], index: LogbookIndex): AircraftUsage {
  const usage: AircraftUsage = { types: new Map(), airframes: new Map(), devices: new Map() };
  for (const entry of entries) {
    if (entry.deletedAt !== undefined || entry.kind === 'ground') continue;
    add(usage.types, index.typeOf(entry)?.id, entry);
    add(usage.airframes, entry.airframeId, entry);
    add(usage.devices, entry.deviceId, entry);
  }
  return usage;
}

export function emptyUsage(): Usage {
  return empty();
}
