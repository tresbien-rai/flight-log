import type { Airframe, AircraftType, TrainingDevice } from './aircraft';
import type { Entry } from './entry';

export interface Person {
  id: string;
  name: string;
}

/** Everything in one pilot's logbook. */
export interface Logbook {
  entries: Entry[];
  airframes: Airframe[];
  aircraftTypes: AircraftType[];
  devices: TrainingDevice[];
  people: Person[];
}
