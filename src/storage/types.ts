/**
 * Local persistence. See docs/DESIGN.md §3.3.
 *
 * A "book" is one complete logbook held on this device. Each imported export is kept as its
 * own book so the two apps' versions can be browsed and compared; `main` is the pilot's own
 * merged logbook (empty until the audit step exists).
 */
import type { ConversionNote, ImportIssue, SourceId } from '@core/importers';
import type { Logbook } from '@core/model';

export const BOOK_IDS = ['main', 'logten', 'foreflight'] as const;
export type BookId = (typeof BOOK_IDS)[number];

/** What is known about how a book got here. */
export interface BookInfo {
  book: BookId;
  /** Set for books that came from an import. */
  source?: SourceId;
  fileName?: string;
  /** UTC ISO instant. */
  updatedAt: string;
  entryCount: number;
  issues: ImportIssue[];
  notes: ConversionNote[];
}

export interface LogbookStore {
  /** Books present on this device, in BOOK_IDS order. */
  listBooks(): Promise<BookInfo[]>;
  /** The whole book, or undefined if it does not exist. Deleted entries are included. */
  loadBook(book: BookId): Promise<Logbook | undefined>;
  /** Replace a book's entire contents and its info in one transaction. */
  replaceBook(
    book: BookId,
    logbook: Logbook,
    info: Omit<BookInfo, 'book' | 'entryCount'>,
  ): Promise<void>;
  deleteBook(book: BookId): Promise<void>;

  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting<T>(key: string, value: T): Promise<void>;

  /** Called after any write to books (not settings). Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
