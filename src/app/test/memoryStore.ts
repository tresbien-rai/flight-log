import type { SourceId } from '@core/importers';
import type { Logbook } from '@core/model';
import { NO_EDITS, type AircraftEdits } from '@core/aircraft';
import { decisionKey, type Decision } from '@core/reconcile';
import {
  BOOK_IDS,
  type BookId,
  type BookInfo,
  type LogbookStore,
  type SourceFile,
} from '@storage/index';

/** A `LogbookStore` held in memory, for component tests. */
export function createMemoryStore(): LogbookStore & { settings: Map<string, unknown> } {
  const books = new Map<BookId, { logbook: Logbook; info: BookInfo }>();
  const settings = new Map<string, unknown>();
  const sources = new Map<SourceId, SourceFile>();
  const decisions = new Map<string, Decision>();
  let aircraftEdits: AircraftEdits = NO_EDITS;
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
      if (book !== 'main') sources.delete(book);
      notify();
    },
    saveSourceFile: async (file) => {
      sources.set(file.source, file);
      notify();
    },
    loadSourceFile: async (source) => sources.get(source),
    listDecisions: async () => [...decisions.values()],
    loadAircraftEdits: async () => aircraftEdits,
    saveAircraftEdits: async (edits) => {
      aircraftEdits = edits;
      notify();
    },
    putDecisions: async (list) => {
      for (const d of list) decisions.set(decisionKey(d), d);
      notify();
    },
    removeDecisions: async (keys) => {
      for (const key of keys) decisions.delete(key);
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
