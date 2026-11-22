import { useCallback, useEffect, useState } from 'react';
import { applyAircraftEdits } from '@core/aircraft';
import type { Logbook } from '@core/model';
import type { BookId, BookInfo } from '@storage/index';
import { useStore } from '../store/StoreProvider';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Loads one book, with the pilot's aircraft edits applied, and reloads it whenever the store
 * reports a write.
 * `bookId` undefined means "no book chosen": the result is `missing`.
 */
export function useBook(bookId: BookId | undefined): {
  state: Loadable<Logbook>;
  retry: () => void;
} {
  const store = useStore();
  const [loaded, setLoaded] = useState<{ bookId: BookId; state: Loadable<Logbook> }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (bookId === undefined) return;
    let cancelled = false;
    const load = () => {
      Promise.all([store.loadBook(bookId), store.loadAircraftEdits()]).then(
        ([logbook, edits]) => {
          if (cancelled) return;
          setLoaded({
            bookId,
            state: logbook
              ? { status: 'ready', value: applyAircraftEdits(logbook, edits) }
              : { status: 'missing' },
          });
        },
        (error: unknown) => {
          if (!cancelled)
            setLoaded({ bookId, state: { status: 'error', message: messageOf(error) } });
        },
      );
    };
    load();
    const unsubscribe = store.subscribe(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store, bookId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (bookId === undefined) return { state: { status: 'missing' }, retry };
  if (loaded?.bookId !== bookId) return { state: { status: 'loading' }, retry };
  return { state: loaded.state, retry };
}

/** The books on this device, reloaded whenever the store reports a write. */
export function useBooks(): { state: Loadable<BookInfo[]>; retry: () => void } {
  const store = useStore();
  const [state, setState] = useState<Loadable<BookInfo[]>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      store.listBooks().then(
        (books) => {
          if (!cancelled) setState({ status: 'ready', value: books });
        },
        (error: unknown) => {
          if (!cancelled) setState({ status: 'error', message: messageOf(error) });
        },
      );
    };
    load();
    const unsubscribe = store.subscribe(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
