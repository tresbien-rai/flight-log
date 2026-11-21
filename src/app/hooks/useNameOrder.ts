import { useCallback, useEffect, useState } from 'react';
import type { NameOrder } from '@core/importers';
import { useStore } from '../store/StoreProvider';

const SETTING_KEY = 'app.nameOrder';
export const DEFAULT_NAME_ORDER: NameOrder = 'family-first';

const isNameOrder = (value: unknown): value is NameOrder =>
  value === 'family-first' || value === 'given-first';

/** How people's names are written on screen. Remembered in the store's settings. */
export function useNameOrder(): { nameOrder: NameOrder; setNameOrder: (order: NameOrder) => void } {
  const store = useStore();
  const [chosen, setChosen] = useState<NameOrder>();

  useEffect(() => {
    let cancelled = false;
    store.getSetting<unknown>(SETTING_KEY).then(
      (value) => {
        if (!cancelled && isNameOrder(value)) setChosen((current) => current ?? value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [store]);

  const setNameOrder = useCallback(
    (order: NameOrder) => {
      setChosen(order);
      store.setSetting(SETTING_KEY, order).catch(() => undefined);
    },
    [store],
  );

  return { nameOrder: chosen ?? DEFAULT_NAME_ORDER, setNameOrder };
}
