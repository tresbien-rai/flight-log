import { formatDecimal } from '@core/time/duration';

export function App() {
  return (
    <main className="shell">
      <h1>Flight Log</h1>
      <p>scaffold OK (96 min = {formatDecimal(96)} h)</p>
    </main>
  );
}
