/**
 * The built-in aircraft type list. See docs/DESIGN.md §4.3 and §7.5.
 *
 * Our type ids are model-level (`C-172S`, `CRJ-700`), finer than ICAO designators, which
 * several types share (`C172`, `CRJ7`). Each source spelling is mapped onto one of these once;
 * a type that is not listed keeps the source's own code. Attributes here are facts about the
 * type and win over whatever a source says, except TAA, which depends on the avionics fitted
 * and so belongs to the airframe.
 */
import type { AircraftType } from '../model';

export interface CatalogType extends AircraftType {
  icaoDesignator: string;
  /** Source type codes that mean exactly this type, e.g. LogTen's `C-172S`. */
  codes: readonly string[];
  /**
   * Picks this type out of the others sharing its ICAO designator by the source's model text
   * (e.g. `172S Skyhawk`), upper-cased.
   */
  modelPattern?: RegExp;
  /** The type to assume for its ICAO designator when the model text does not say. */
  isDefaultForIcao?: boolean;
}

type Flags = Pick<
  AircraftType,
  'complex' | 'highPerformance' | 'taa' | 'pressurized' | 'retractable' | 'tailwheel'
>;

const FIXED: Flags = {
  complex: false,
  highPerformance: false,
  taa: false,
  pressurized: false,
  retractable: false,
  tailwheel: false,
};
/** Retractable gear, flaps and a controllable-pitch propeller (14 CFR 61.1). */
const COMPLEX: Flags = { ...FIXED, complex: true, retractable: true };
/**
 * Transport jets: pressurised, retractable gear. Not "complex" or "high performance" in the
 * 14 CFR 61.1 sense, which is defined by propeller and horsepower.
 */
const JET: Flags = { ...FIXED, pressurized: true, retractable: true };

const SINGLE = { category: 'airplane', class: 'ASEL', engine: 'piston' } as const;
const AIRLINER = {
  category: 'airplane',
  class: 'AMEL',
  engine: 'turbofan',
  multiPilot: true,
  ...JET,
} as const;

const skyhawk = (letter: 'N' | 'P' | 'R' | 'S'): CatalogType => ({
  id: `C-172${letter}`,
  icaoDesignator: 'C172',
  make: 'Cessna',
  model: `172${letter} Skyhawk`,
  ...SINGLE,
  ...FIXED,
  codes: [`C-172${letter}`, `C172${letter}`],
  modelPattern: new RegExp(`\\b172${letter}\\b`),
});

const skylane = (letter: 'R' | 'T'): CatalogType => ({
  id: `C-182${letter}`,
  icaoDesignator: 'C182',
  make: 'Cessna',
  model: `182${letter} Skylane`,
  ...SINGLE,
  ...FIXED,
  highPerformance: true,
  codes: [`C-182${letter}`, `C182${letter}`],
  modelPattern: new RegExp(`\\b182${letter}\\b`),
});

const crj = (number: string, icao: string, over: Partial<CatalogType> = {}): CatalogType => ({
  id: `CRJ-${number}`,
  icaoDesignator: icao,
  make: 'Bombardier',
  model: `CRJ${number}`,
  ...AIRLINER,
  typeRating: 'CL-65',
  codes: [`CRJ-${number}`, `CRJ${number}`],
  modelPattern: new RegExp(`\\b${number}(NG|LR|ER)?\\b`),
  ...over,
});

export const CATALOG: readonly CatalogType[] = [
  skyhawk('N'),
  skyhawk('P'),
  skyhawk('R'),
  skyhawk('S'),
  {
    id: 'C-172RG',
    icaoDesignator: 'C72R',
    make: 'Cessna',
    model: '172RG Cutlass RG',
    ...SINGLE,
    ...COMPLEX,
    codes: ['C-172RG', 'C172RG'],
  },
  skylane('R'),
  skylane('T'),
  {
    id: 'PA-28-161',
    icaoDesignator: 'P28A',
    make: 'Piper',
    model: 'PA-28-161 Warrior',
    ...SINGLE,
    ...FIXED,
    codes: ['PA-28-161', 'PA-28A-161'],
    modelPattern: /\b161\b|WARRIOR/,
  },
  {
    id: 'PA-28-181',
    icaoDesignator: 'P28A',
    make: 'Piper',
    model: 'PA-28-181 Archer',
    ...SINGLE,
    ...FIXED,
    codes: ['PA-28-181', 'PA-28A-181'],
    modelPattern: /\b181\b|ARCHER/,
  },
  {
    id: 'PA-28R-200',
    icaoDesignator: 'P28R',
    make: 'Piper',
    model: 'PA-28R-200 Arrow II',
    ...SINGLE,
    ...COMPLEX,
    codes: ['PA-28R-200'],
    modelPattern: /\b200\b/,
  },
  {
    id: 'PA-28R-201',
    icaoDesignator: 'P28R',
    make: 'Piper',
    model: 'PA-28R-201 Arrow III',
    ...SINGLE,
    ...COMPLEX,
    codes: ['PA-28R-201'],
    modelPattern: /\b201\b/,
  },
  {
    id: 'PIAT',
    icaoDesignator: 'PIAT',
    make: 'Pipistrel',
    model: 'Alpha Trainer',
    ...SINGLE,
    ...FIXED,
    codes: [],
  },
  {
    id: 'BE76',
    icaoDesignator: 'BE76',
    make: 'Beechcraft',
    model: '76 Duchess',
    category: 'airplane',
    class: 'AMEL',
    engine: 'piston',
    ...COMPLEX,
    codes: [],
  },
  // One type rating for the family; the 450 and 550 are converted 200s and 700s.
  crj('200', 'CRJ2', { isDefaultForIcao: true }),
  crj('450', 'CRJ2', { variantOf: 'CRJ-200' }),
  crj('700', 'CRJ7', { isDefaultForIcao: true }),
  crj('550', 'CRJ7', { variantOf: 'CRJ-700' }),
  crj('900', 'CRJ9', { isDefaultForIcao: true }),
  // Flown only in simulators so far.
  {
    id: 'A320',
    icaoDesignator: 'A320',
    make: 'Airbus',
    model: 'A320',
    ...AIRLINER,
    codes: ['A-320'],
  },
  {
    id: 'ERJ-145',
    icaoDesignator: 'E145',
    make: 'Embraer',
    model: 'ERJ 145',
    ...AIRLINER,
    codes: ['EMB-145', 'ERJ-145'],
  },
];
