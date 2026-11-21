import type { FlightNumberStyle, NameOrder } from '@core/importers';

/** How things are written on screen. Changed in Settings. */
export interface DisplayPrefs {
  nameOrder: NameOrder;
  flightNumberStyle: FlightNumberStyle;
}

export const DEFAULT_PREFS: DisplayPrefs = {
  nameOrder: 'family-first',
  flightNumberStyle: 'spaced',
};
