import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  clearedFilter,
  parseFilterState,
  serializeFilterState,
  type FilterState,
} from '../lib/filterState';

const TEXT_DEBOUNCE_MS = 300;

export interface FilterControls {
  /** The state to filter by. Its text follows typing immediately, at lower priority. */
  filter: FilterState;
  /** What the search box shows. */
  draftText: string;
  setDraftText: (text: string) => void;
  /** Changes part of the filter; this adds a history entry so Back undoes it. */
  update: (patch: Partial<FilterState>) => void;
  clear: () => void;
}

/**
 * Filter state kept in the URL query string. Typing is debounced into the URL (replacing, so it
 * does not flood history) while the list follows each keystroke through `useDeferredValue`.
 */
export function useFilterState(): FilterControls {
  const [params, setParams] = useSearchParams();
  const urlState = useMemo(() => parseFilterState(params), [params]);

  const [draftText, setDraftText] = useState(urlState.text);
  const [seenUrlText, setSeenUrlText] = useState(urlState.text);
  if (urlState.text !== seenUrlText) {
    // The URL changed under us (Back, a link, "Clear filters"): the search box follows it.
    setSeenUrlText(urlState.text);
    setDraftText(urlState.text);
  }

  const update = useCallback(
    (patch: Partial<FilterState>) => {
      setParams((prev) => serializeFilterState({ ...parseFilterState(prev), ...patch }));
    },
    [setParams],
  );

  useEffect(() => {
    if (draftText === urlState.text) return;
    const timer = setTimeout(() => {
      setParams((prev) => serializeFilterState({ ...parseFilterState(prev), text: draftText }), {
        replace: true,
      });
    }, TEXT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftText, urlState.text, setParams]);

  const clear = useCallback(() => {
    setParams((prev) => serializeFilterState(clearedFilter(parseFilterState(prev))));
  }, [setParams]);

  const deferredText = useDeferredValue(draftText);
  const filter = useMemo(() => ({ ...urlState, text: deferredText }), [urlState, deferredText]);

  return { filter, draftText, setDraftText, update, clear };
}
