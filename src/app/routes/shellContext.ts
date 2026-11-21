import { useOutletContext } from 'react-router';
import type { NameOrder } from '@core/importers';
import type { BookId, BookInfo } from '@storage/index';
import type { Loadable } from '../hooks/useBook';

/** What the shell shares with the screens it frames. */
export interface ShellContext {
  books: Loadable<BookInfo[]>;
  retryBooks: () => void;
  /** The book being shown, if any book exists. */
  bookId: BookId | undefined;
  selectBook: (id: BookId) => void;
  /** How people's names are written on screen. */
  nameOrder: NameOrder;
  setNameOrder: (order: NameOrder) => void;
}

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}
