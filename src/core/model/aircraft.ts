/** Aircraft model. See docs/DESIGN.md §4.3. */

export type AircraftCategory =
  'airplane' | 'rotorcraft' | 'glider' | 'lighter-than-air' | 'powered-lift' | 'other';

export type AircraftClass =
  'ASEL' | 'AMEL' | 'ASES' | 'AMES' | 'helicopter' | 'gyroplane' | 'other';

export type EngineType =
  'piston' | 'turboprop' | 'turbofan' | 'turbojet' | 'turboshaft' | 'electric' | 'none';

export type DeviceLevel = 'FFS' | 'FTD' | 'AATD' | 'BATD';

export interface AircraftType {
  /** Our own id, e.g. `CRJ-550`. Not the ICAO designator, which variants share. */
  id: string;
  icaoDesignator?: string;
  make: string;
  model: string;
  category: AircraftCategory;
  class: AircraftClass;
  engine: EngineType;
  /** e.g. `CL-65`, shared by the CRJ-200/450/550/700/900. */
  typeRating?: string;
  /** Id of the type this is a converted variant of, e.g. `CRJ-550` → `CRJ-700`. */
  variantOf?: string;
  /** Certificated for two pilots. */
  multiPilot?: boolean;
  notes?: string;
  complex: boolean;
  highPerformance: boolean;
  taa: boolean;
  pressurized: boolean;
  retractable: boolean;
  tailwheel: boolean;
}

/** A value that holds over a date range. Both bounds inclusive; absent means open-ended. */
export interface Dated<T> {
  value: T;
  from?: string;
  to?: string;
}

export interface Airframe {
  id: string;
  serialNumber?: string;
  /** Tail numbers worn over time, normalised (trimmed, upper case). */
  registrations: Dated<string>[];
  /** Aircraft type ids over time. */
  configurations: Dated<string>[];
  /** Per-airframe differences from the type's attributes, e.g. a TAA-equipped example. */
  overrides?: Partial<
    Pick<AircraftType, 'complex' | 'highPerformance' | 'taa' | 'pressurized' | 'retractable'>
  >;
  operatorId?: string;
  notes?: string;
}

export interface TrainingDevice {
  id: string;
  name: string;
  level: DeviceLevel;
  /** Aircraft type id the device represents. */
  represents?: string;
}

/** The value in force on `date`, or undefined if none covers it. */
export function valueOn<T>(periods: readonly Dated<T>[], date: string): T | undefined {
  return periods.find(
    (p) => (p.from === undefined || p.from <= date) && (p.to === undefined || date <= p.to),
  )?.value;
}
