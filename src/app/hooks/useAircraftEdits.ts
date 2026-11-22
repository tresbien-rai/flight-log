import { useCallback, useEffect, useState } from 'react';
import { NO_EDITS, type AircraftEdits } from '@core/aircraft';
import { useStore } from '../store/StoreProvider';

/** The pilot's aircraft edits, kept current, and a way to save new ones. */
export function useAircraftEdits(): {
  edits: AircraftEdits;
  save: (next: AircraftEdits) => Promise<void>;
} {
  const store = useStore();
  const [edits, setEdits] = useState<AircraftEdits>(NO_EDITS);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      store.loadAircraftEdits().then(
        (value) => {
          if (!cancelled) setEdits(value);
        },
        () => undefined,
      );
    };
    load();
    const unsubscribe = store.subscribe(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store]);

  const save = useCallback((next: AircraftEdits) => store.saveAircraftEdits(next), [store]);
  return { edits, save };
}
