import type { FlightNumberStyle, NameOrder } from '@core/importers';
import { useShell } from './shellContext';

const STYLES: { value: FlightNumberStyle; label: string; example: string }[] = [
  { value: 'spaced', label: 'With a space', example: 'DL 3939' },
  { value: 'joined', label: 'Without a space', example: 'DL3939' },
];

const ORDERS: { value: NameOrder; label: string; example: string }[] = [
  { value: 'family-first', label: 'Last name first', example: 'Example, Pat' },
  { value: 'given-first', label: 'First name first', example: 'Pat Example' },
];

export function SettingsRoute() {
  const { prefs, setNameOrder, setFlightNumberStyle } = useShell();
  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="screen-title">Settings</h1>
        <fieldset className="settings-group">
          <legend className="section-title">People’s names</legend>
          <p className="lede">
            How crew names are written on screen. First and last names are stored separately, so
            this can be changed at any time.
          </p>
          <div className="check-list">
            {ORDERS.map((order) => (
              <label key={order.value} className="check">
                <input
                  type="radio"
                  name="name-order"
                  checked={prefs.nameOrder === order.value}
                  onChange={() => setNameOrder(order.value)}
                />
                <span>{order.label}</span>
                <span className="muted">{order.example}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-group">
          <legend className="section-title">Flight numbers</legend>
          <p className="lede">
            How flight numbers are written on screen. They are stored the same way whichever you
            choose, so both forms are found by search.
          </p>
          <div className="check-list">
            {STYLES.map((style) => (
              <label key={style.value} className="check">
                <input
                  type="radio"
                  name="flight-number-style"
                  checked={prefs.flightNumberStyle === style.value}
                  onChange={() => setFlightNumberStyle(style.value)}
                />
                <span>{style.label}</span>
                <span className="muted">{style.example}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
