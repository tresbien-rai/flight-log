/**
 * Glue between the device's store and the backup file in core. See docs/DESIGN.md §3.3.
 */
import type { AirportLookup } from '@core/airports';
import { toBackup, type Backup, type BackupContents } from '@core/backup';
import type { SourceId } from '@core/importers';
import { convertSource } from './importFile';
import { PROFILE_DOCS, type BookInfo, type LogbookStore, type StoreSnapshot } from './types';

/** The settings a backup carries. The rest are display choices of one device. */
export const BACKUP_SETTINGS = ['app.nameOrder', 'app.flightNumberStyle'] as const;

const SOURCES: readonly SourceId[] = ['logten', 'foreflight'];

/** Reads everything a backup holds from the store. */
export async function collectBackup(
  store: LogbookStore,
  deps: { now: () => string },
): Promise<Backup> {
  const [files, decisions, aircraftEdits, docs, settings, main, books] = await Promise.all([
    Promise.all(SOURCES.map((source) => store.loadSourceFile(source))),
    store.listDecisions(),
    store.loadAircraftEdits(),
    Promise.all(PROFILE_DOCS.map((doc) => store.loadProfileDoc(doc))),
    Promise.all(BACKUP_SETTINGS.map((key) => store.getSetting<unknown>(key))),
    store.loadBook('main'),
    store.listBooks(),
  ]);
  const contents: BackupContents = {
    sources: files.flatMap((file) => (file ? [file] : [])),
    decisions,
    aircraftEdits,
    documents: {},
    settings: {},
  };
  PROFILE_DOCS.forEach((doc, i) => {
    if (docs[i] !== undefined) contents.documents[doc] = docs[i];
  });
  BACKUP_SETTINGS.forEach((key, i) => {
    if (settings[i] !== undefined) contents.settings[key] = settings[i];
  });
  const info = books.find((b) => b.book === 'main');
  if (main && info) {
    contents.main = {
      logbook: main,
      updatedAt: info.updatedAt,
      issues: info.issues,
      notes: info.notes,
    };
  }
  return toBackup(contents, deps.now());
}

export interface RestoreOutcome {
  /** The books now on the device. */
  books: Pick<BookInfo, 'book' | 'fileName'>[];
  /**
   * Export files that were restored but could not be read into a book. The file is on the
   * device; importing it again, or a fresh export, brings the book back.
   */
  unreadable: { source: SourceId; fileName: string; message: string }[];
}

/**
 * Replaces what is on the device with the backup. The two imported books are rebuilt from the
 * backup's export files before anything is written, and everything is then written in one
 * step, so a failure leaves the device as it was.
 */
export async function restoreBackup(
  store: LogbookStore,
  backup: Backup,
  deps: { airports?: AirportLookup; now: () => string },
): Promise<RestoreOutcome> {
  const snapshot: StoreSnapshot = {
    books: [],
    sources: backup.sources,
    decisions: backup.decisions,
    aircraftEdits: backup.aircraftEdits,
    documents: {},
    settings: {},
  };
  const unreadable: RestoreOutcome['unreadable'] = [];
  if (backup.main) {
    const { logbook, ...info } = backup.main;
    snapshot.books.push({ book: 'main', logbook, info });
  }
  for (const file of backup.sources) {
    try {
      const { logbook, info } = convertSource(
        file.source,
        { name: file.fileName, text: file.text },
        deps,
      );
      snapshot.books.push({ book: file.source, logbook, info });
    } catch (error) {
      unreadable.push({
        source: file.source,
        fileName: file.fileName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const doc of PROFILE_DOCS) {
    if (backup.documents[doc] !== undefined) snapshot.documents[doc] = backup.documents[doc];
  }
  for (const key of BACKUP_SETTINGS) {
    if (backup.settings[key] !== undefined) snapshot.settings[key] = backup.settings[key];
  }
  await store.replaceAll(snapshot);
  return {
    books: snapshot.books.map(({ book, info }) => ({ book, fileName: info.fileName })),
    unreadable,
  };
}
