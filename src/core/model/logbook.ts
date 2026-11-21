import type { Airframe, AircraftType, TrainingDevice } from './aircraft';
import type { Entry } from './entry';

export interface Person {
  id: string;
  /** The name as first written in a source. Shown only when the parts below are absent. */
  name: string;
  /** Given name(s). Absent on records stored before names were split. */
  givenName?: string;
  familyName?: string;
}

/** Everything in one pilot's logbook. */
export interface Logbook {
  entries: Entry[];
  airframes: Airframe[];
  aircraftTypes: AircraftType[];
  devices: TrainingDevice[];
  people: Person[];
}
