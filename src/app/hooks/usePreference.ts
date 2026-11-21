import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store/StoreProvider';

/** A display preference remembered in the store's settings. */
export function usePreference<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (value: T) => void] {
  const store = useStore();
  const [chosen, setChosen] = useState<T>();

  useEffect(() => {
    let cancelled = false;
    store.getSetting<unknown>(key).then(
      (value) => {
        // A choice made while the setting was loading wins over the stored one.
        if (!cancelled && isValid(value)) setChosen((current) => current ?? value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [store, key, isValid]);

  const choose = useCallback(
    (value: T) => {
      setChosen(value);
      store.setSetting(key, value).catch(() => undefined);
    },
    [store, key],
  );

  return [chosen ?? fallback, choose];
}
