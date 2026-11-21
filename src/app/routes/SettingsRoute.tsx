import type { NameOrder } from '@core/importers';
import { useShell } from './shellContext';

const ORDERS: { value: NameOrder; label: string; example: string }[] = [
  { value: 'family-first', label: 'Last name first', example: 'Example, Pat' },
  { value: 'given-first', label: 'First name first', example: 'Pat Example' },
];

export function SettingsRoute() {
  const { nameOrder, setNameOrder } = useShell();
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
                  checked={nameOrder === order.value}
                  onChange={() => setNameOrder(order.value)}
                />
                <span>{order.label}</span>
                <span className="muted">{order.example}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
