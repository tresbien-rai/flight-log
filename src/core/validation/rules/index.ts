import type { Rule } from '../types';
import { AIRCRAFT_RULES } from './aircraft';
import { AIRPORT_RULES } from './airports';
import { CLOCK_RULES } from './clock';
import { COMPONENT_RULES } from './components';
import { CREW_RULES } from './crew';
import { INSTRUMENT_RULES } from './instrument';
import { LANDING_RULES } from './landings';
import { LOGBOOK_RULES } from './logbook';
import { SHAPE_RULES } from './shape';

/** Every built-in rule, in a stable order. */
export const ALL_RULES: readonly Rule[] = [
  ...COMPONENT_RULES,
  ...CREW_RULES,
  ...CLOCK_RULES,
  ...LANDING_RULES,
  ...INSTRUMENT_RULES,
  ...AIRPORT_RULES,
  ...AIRCRAFT_RULES,
  ...SHAPE_RULES,
  ...LOGBOOK_RULES,
];
