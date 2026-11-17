/**
 * Column mappings for the user-defined fields in this pilot's exports. These describe one
 * person's logbook setup, not the file formats, so they live here rather than in the importers.
 */
import type { ColumnMapping, SourceId } from '../src/core/importers';

export const COLUMN_PRESETS: Record<SourceId, Record<string, ColumnMapping>> = {
  logten: {
    // LogTen exports custom fields without their labels. These were identified by matching
    // each column's total against ForeFlight's labelled columns (exact to the minute).
    flight_customTime1: { custom: 'dualGivenCPL', type: 'duration' },
    flight_customTime2: { custom: 'dualGivenIRA', type: 'duration' },
    flight_customTime3: { custom: 'dualGivenPPL', type: 'duration' },
    flight_customTime10: { duration: 'crossCountry50' },
    flight_paxCount: { custom: 'passengerCount', type: 'count' },
  },
  foreflight: {
    'XC (50NM)': { duration: 'crossCountry50' },
    'Part 121': { rule: '121' },
    'DG-PPL': { custom: 'dualGivenPPL', type: 'duration' },
    'DG-IRA': { custom: 'dualGivenIRA', type: 'duration' },
    'DG-CPL': { custom: 'dualGivenCPL', type: 'duration' },
    'Passenger Count': { custom: 'passengerCount', type: 'count' },
    Flag: { custom: 'flag', type: 'toggle' },
  },
};
