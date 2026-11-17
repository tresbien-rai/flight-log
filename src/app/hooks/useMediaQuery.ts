import { useSyncExternalStore } from 'react';

/** Tracks a CSS media query. Used for behaviour that must match a layout breakpoint. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Keep in step with the `min-width` of the side-pane layout in logbook.css. */
export const WIDE_QUERY = '(min-width: 1000px)';
