import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import type { BookId } from '@storage/index';
import { useBooks } from '../hooks/useBook';
import { useSelectedBook } from '../hooks/useSelectedBook';
import type { ShellContext } from '../routes/shellContext';
import { BookSwitcher } from './BookSwitcher';

export function AppShell() {
  const { state: books, retry: retryBooks } = useBooks();
  const list = books.status === 'ready' ? books.value : undefined;
  const { bookId, selectBook: rememberBook } = useSelectedBook(list);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // An open entry belongs to one book, so switching books closes it.
  const selectBook = (id: BookId) => {
    rememberBook(id);
    if (pathname.startsWith('/entry/')) void navigate('/');
  };
  const onImport = pathname.startsWith('/import');
  const onAudit = pathname.startsWith('/audit');
  const context: ShellContext = { books, retryBooks, bookId, selectBook };

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-name">Flight Log</span>
        <nav className="app-nav" aria-label="Main">
          <Link to="/" aria-current={onImport || onAudit ? undefined : 'page'}>
            Logbook
          </Link>
          <Link to="/audit" aria-current={onAudit ? 'page' : undefined}>
            Audit
          </Link>
          <Link to="/import" aria-current={onImport ? 'page' : undefined}>
            Import
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
