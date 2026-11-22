import { useCallback, useEffect, useState } from 'react';
import type { ProfileDoc } from '@storage/index';
import { useStore } from '../store/StoreProvider';

/**
 * One of the pilot's own documents (saved layouts, the pilot profile), read through `complete`
 * so a missing or older copy is always usable. `ready` is false until the first read finishes.
 */
export function useProfileDoc<T>(
  doc: ProfileDoc,
  complete: (stored: unknown) => T,
): { value: T; ready: boolean; save: (value: T) => Promise<void> } {
  const store = useStore();
  const [state, setState] = useState<{ value: T; ready: boolean }>(() => ({
    value: complete(undefined),
    ready: false,
  }));

  useEffect(() => {
    let cancelled = false;
    store.loadProfileDoc(doc).then(
      (stored) => {
        if (!cancelled) setState((s) => (s.ready ? s : { value: complete(stored), ready: true }));
      },
      () => {
        if (!cancelled) setState((s) => ({ ...s, ready: true }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store, doc, complete]);

  const save = useCallback(
    (value: T) => {
      setState({ value, ready: true });
      return store.saveProfileDoc(doc, value);
    },
    [store, doc],
  );

  return { ...state, save };
}
