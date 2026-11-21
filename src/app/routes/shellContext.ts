import { useOutletContext } from 'react-router';
import type { FlightNumberStyle, NameOrder } from '@core/importers';
import type { DisplayPrefs } from '../lib/prefs';
import type { BookId, BookInfo } from '@storage/index';
import type { Loadable } from '../hooks/useBook';

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
}

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}
