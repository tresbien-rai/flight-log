import { useCallback, useEffect, useState } from 'react';
import { BOOK_IDS, type BookId, type BookInfo } from '@storage/index';
import { useStore } from '../store/StoreProvider';

const SETTING_KEY = 'app.selectedBook';

const isBookId = (value: unknown): value is BookId =>
  typeof value === 'string' && (BOOK_IDS as readonly string[]).includes(value);

/**
 * Which book the app is showing. The choice is remembered in the store's settings. If the
 * remembered book is not on this device, the first book that is (in BOOK_IDS order) is used.
 */
export function useSelectedBook(books: readonly BookInfo[] | undefined): {
  bookId: BookId | undefined;
  selectBook: (id: BookId) => void;
} {
  const store = useStore();
  const [chosen, setChosen] = useState<BookId>();

  useEffect(() => {
    let cancelled = false;
    store.getSetting<unknown>(SETTING_KEY).then(
      (value) => {
        // A choice made while the setting was loading wins over the stored one.
        if (!cancelled && isBookId(value)) setChosen((current) => current ?? value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [store]);

  const selectBook = useCallback(
    (id: BookId) => {
      setChosen(id);
      store.setSetting(SETTING_KEY, id).catch(() => undefined);
    },
    [store],
  );

  const present = books ?? [];
  const bookId =
    chosen !== undefined && present.some((b) => b.book === chosen) ? chosen : present[0]?.book;
  return { bookId, selectBook };
}
