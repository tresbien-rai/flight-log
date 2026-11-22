import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import type { BookId } from '@storage/index';
import { useBooks } from '../hooks/useBook';
import { useDisplayPrefs } from '../hooks/useDisplayPrefs';
import { useSelectedBook } from '../hooks/useSelectedBook';
import type { ShellContext } from '../routes/shellContext';
import { BookSwitcher } from './BookSwitcher';

export function AppShell() {
  const { state: books, retry: retryBooks } = useBooks();
  const list = books.status === 'ready' ? books.value : undefined;
  const { bookId, selectBook: rememberBook } = useSelectedBook(list);
  const { prefs, setNameOrder, setFlightNumberStyle } = useDisplayPrefs();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // An open entry belongs to one book, so switching books closes it.
  const selectBook = (id: BookId) => {
    rememberBook(id);
    if (pathname.startsWith('/entry/')) void navigate('/');
  };
  const onImport = pathname.startsWith('/import');
  const onAudit = pathname.startsWith('/audit');
  const onAircraft = pathname.startsWith('/aircraft');
  const onSettings = pathname.startsWith('/settings');
  const context: ShellContext = {
    books,
    retryBooks,
    bookId,
    selectBook,
    prefs,
    setNameOrder,
    setFlightNumberStyle,
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-name">Flight Log</span>
        <nav className="app-nav" aria-label="Main">
          <Link
            to="/"
            aria-current={onImport || onAudit || onSettings || onAircraft ? undefined : 'page'}
          >
            Logbook
          </Link>
          <Link to="/aircraft" aria-current={onAircraft ? 'page' : undefined}>
            Aircraft
          </Link>
          <Link to="/audit" aria-current={onAudit ? 'page' : undefined}>
            Audit
          </Link>
          <Link to="/import" aria-current={onImport ? 'page' : undefined}>
            Import
          </Link>
          <Link to="/settings" aria-current={onSettings ? 'page' : undefined}>
            Settings
          </Link>
        </nav>
        {list && list.length > 0 && bookId ? (
          <BookSwitcher books={list} value={bookId} onChange={selectBook} />
        ) : null}
      </header>
      <main className="app-main">
        <Outlet context={context} />
      </main>
    </div>
  );
}
