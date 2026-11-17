import type { Logbook } from '@core/model';
import { BOOK_IDS, type BookId, type BookInfo, type LogbookStore } from '@storage/index';

/** A `LogbookStore` held in memory, for component tests. */
export function createMemoryStore(): LogbookStore & { settings: Map<string, unknown> } {
  const books = new Map<BookId, { logbook: Logbook; info: BookInfo }>();
  const settings = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  const notify = () => queueMicrotask(() => [...listeners].forEach((l) => l()));

  return {
    settings,
    listBooks: async () =>
      BOOK_IDS.flatMap((id) => {
        const held = books.get(id);
        return held ? [held.info] : [];
      }),
    loadBook: async (book) => books.get(book)?.logbook,
    replaceBook: async (book, logbook, info) => {
      books.set(book, { logbook, info: { ...info, book, entryCount: logbook.entries.length } });
      notify();
    },
    deleteBook: async (book) => {
      books.delete(book);
      notify();
    },
    getSetting: async <T>(key: string) => settings.get(key) as T | undefined,
    setSetting: async (key, value) => {
      settings.set(key, value);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
