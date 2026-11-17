import { useEffect, useState } from 'react';
import type { AirportLookup } from '@core/airports';
import { loadAirports } from '@storage/index';

export type AirportsState =
  { status: 'loading' } | { status: 'ready'; airports: AirportLookup } | { status: 'failed' };

/** Loads the bundled airport table once (it is a separate chunk). */
export function useAirports(): AirportsState {
  const [state, setState] = useState<AirportsState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    loadAirports().then(
      (airports) => {
        if (!cancelled) setState({ status: 'ready', airports });
      },
      () => {
        if (!cancelled) setState({ status: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
