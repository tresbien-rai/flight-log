import { useOutletContext } from 'react-router';
import type { FlightNumberStyle, NameOrder } from '@core/importers';
import type { DisplayPrefs } from '../lib/prefs';
import type { BookId, BookInfo } from '@storage/index';
import type { Loadable } from '../hooks/useBook';

/** The entries behind a number tapped on the experience report. */
export interface ReportList {
  bookId: BookId;
  /** What the number was, e.g. "CRJ-700 · PIC". */
  label: string;
  entryIds: readonly string[];
}

/** What the shell shares with the screens it frames. */
export interface ShellContext {
  books: Loadable<BookInfo[]>;
  retryBooks: () => void;
  /** The book being shown, if any book exists. */
  bookId: BookId | undefined;
  selectBook: (id: BookId) => void;
  /** How names and flight numbers are written on screen. */
  prefs: DisplayPrefs;
  setNameOrder: (order: NameOrder) => void;
  setFlightNumberStyle: (style: FlightNumberStyle) => void;
  /** The last list opened from the report; kept in memory only. */
  reportList: ReportList | undefined;
  /** Opens the logbook showing only these entries. */
  showReportList: (list: ReportList) => void;
}

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}
