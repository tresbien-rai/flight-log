import type { Table } from 'dexie';
import type { Logbook } from '@core/model';
import { completeEdits, type AircraftEdits } from '@core/aircraft';
import { decisionKey } from '@core/reconcile';
import { FlightLogDb, type Row } from './db';
import { BOOK_IDS, type BookId, type LogbookStore } from './types';

const CHANNEL_NAME = 'flight-log';
const AIRCRAFT_EDITS = 'aircraftEdits';

function withBook<T extends object>(book: BookId, items: readonly T[]): Row<T>[] {
  return items.map((item) => ({ ...item, book }));
}

function stripBook<T extends object>(row: Row<T>): T {
  const { book, ...rest } = row;
  void book;
  return rest as unknown as T;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = (a: { id: string }, b: { id: string }) => compare(a.id, b.id);

export function createDexieStore(db: FlightLogDb = new FlightLogDb()): LogbookStore {
  /** Tags our own broadcasts: a BroadcastChannel also delivers to other channel objects in this tab. */
  const origin = Math.random().toString(36).slice(2);
  const listeners = new Set<() => void>();
  /** Receives messages from other tabs; open only while someone is subscribed. */
  let channel: BroadcastChannel | undefined;

  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        console.error('LogbookStore listener threw', error);
      }
    }
  };

  /** After a commit: tell this tab's listeners (asynchronously) and every other tab. */
  const announce = () => {
    queueMicrotask(notify);
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const poster = new BroadcastChannel(CHANNEL_NAME);
      poster.postMessage({ origin });
      poster.close();
    } catch {
      // Other tabs catch up the next time they load.
    }
  };

  const bookTables = [
    db.entries,
    db.airframes,
    db.aircraftTypes,
    db.devices,
    db.people,
  ] as unknown as Table[];

  const clearBook = (book: BookId) =>
    Promise.all(bookTables.map((table) => table.where('book').equals(book).delete()));

  return {
    async listBooks() {
      const infos = await db.books.toArray();
      return BOOK_IDS.flatMap((id) => infos.filter((info) => info.book === id));
    },

    loadBook(book) {
      return db.transaction('r', [...bookTables, db.books], async () => {
        if ((await db.books.get(book)) === undefined) return undefined;
        const [entries, airframes, aircraftTypes, devices, people] = await Promise.all([
          db.entries.where('book').equals(book).toArray(),
          db.airframes.where('book').equals(book).toArray(),
          db.aircraftTypes.where('book').equals(book).toArray(),
          db.devices.where('book').equals(book).toArray(),
          db.people.where('book').equals(book).toArray(),
        ]);
        const logbook: Logbook = {
          entries: entries
            .sort((a, b) => compare(a.date, b.date) || compare(a.id, b.id))
            .map(stripBook),
          airframes: airframes.sort(byId).map(stripBook),
          aircraftTypes: aircraftTypes.sort(byId).map(stripBook),
          devices: devices.sort(byId).map(stripBook),
          people: people.sort(byId).map(stripBook),
        };
        return logbook;
      });
    },

    async replaceBook(book, logbook, info) {
      const entryCount = logbook.entries.filter((e) => e.deletedAt === undefined).length;
      await db.transaction('rw', [...bookTables, db.books], async () => {
        await clearBook(book);
        await db.entries.bulkAdd(withBook(book, logbook.entries));
        await db.airframes.bulkAdd(withBook(book, logbook.airframes));
        await db.aircraftTypes.bulkAdd(withBook(book, logbook.aircraftTypes));
        await db.devices.bulkAdd(withBook(book, logbook.devices));
        await db.people.bulkAdd(withBook(book, logbook.people));
        await db.books.put({ ...info, book, entryCount });
      });
      announce();
    },

    async deleteBook(book) {
      await db.transaction('rw', [...bookTables, db.books, db.sources], async () => {
        await clearBook(book);
        await db.books.delete(book);
        if (book !== 'main') await db.sources.delete(book);
      });
      announce();
    },

    async saveSourceFile(file) {
      await db.sources.put(file);
      announce();
    },

    loadSourceFile(source) {
      return db.sources.get(source);
    },

    async listDecisions() {
      return (await db.decisions.toArray()).map((row) => row.decision);
    },

    async putDecisions(decisions) {
      if (decisions.length === 0) return;
      await db.decisions.bulkPut(
        decisions.map((decision) => ({ key: decisionKey(decision), decision })),
      );
      announce();
    },

    async loadAircraftEdits() {
      const row = await db.profile.get(AIRCRAFT_EDITS);
      return completeEdits(row?.value as Partial<AircraftEdits> | undefined);
    },

    async saveAircraftEdits(edits) {
      await db.profile.put({ key: AIRCRAFT_EDITS, value: edits });
      announce();
    },

    async removeDecisions(keys) {
      if (keys.length === 0) return;
      await db.decisions.bulkDelete([...keys]);
      announce();
    },

    async getSetting<T>(key: string) {
      return (await db.settings.get(key))?.value as T | undefined;
    },

    async setSetting<T>(key: string, value: T) {
      await db.settings.put({ key, value });
    },

    subscribe(listener) {
      listeners.add(listener);
      if (channel === undefined && typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (event: MessageEvent<unknown>) => {
          const data = event.data as { origin?: string } | null;
          if (data?.origin !== origin) notify();
        };
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && channel !== undefined) {
          channel.close();
          channel = undefined;
        }
      };
    },
  };
}
