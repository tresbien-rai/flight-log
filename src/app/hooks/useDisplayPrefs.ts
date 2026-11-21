import type { FlightNumberStyle, NameOrder } from '@core/importers';
import type { DisplayPrefs } from '../lib/prefs';
import { usePreference } from './usePreference';

const isNameOrder = (value: unknown): value is NameOrder =>
  value === 'family-first' || value === 'given-first';
const isFlightNumberStyle = (value: unknown): value is FlightNumberStyle =>
  value === 'spaced' || value === 'joined';

/** How names and flight numbers are written on screen. Remembered in the store's settings. */
export function useDisplayPrefs(): {
  prefs: DisplayPrefs;
  setNameOrder: (order: NameOrder) => void;
  setFlightNumberStyle: (style: FlightNumberStyle) => void;
} {
  const [nameOrder, setNameOrder] = usePreference('app.nameOrder', 'family-first', isNameOrder);
  const [flightNumberStyle, setFlightNumberStyle] = usePreference(
    'app.flightNumberStyle',
    'spaced',
    isFlightNumberStyle,
  );
  return { prefs: { nameOrder, flightNumberStyle }, setNameOrder, setFlightNumberStyle };
}
