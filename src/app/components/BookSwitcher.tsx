import type { BookId, BookInfo } from '@storage/index';
import { BOOK_LABELS } from '../lib/books';

/** Chooses which book on this device the app shows. Only books that exist are offered. */
export function BookSwitcher({
  books,
  value,
  onChange,
}: {
  books: readonly BookInfo[];
  value: BookId;
  onChange: (id: BookId) => void;
}) {
  return (
    <div className="book-switcher">
      <label htmlFor="book-select" className="book-switcher-label">
        Book
      </label>
      <select
        id="book-select"
        className="book-select"
        value={value}
        onChange={(e) => onChange(e.target.value as BookId)}
      >
        {books.map((b) => (
          <option key={b.book} value={b.book}>
            {BOOK_LABELS[b.book]}
          </option>
        ))}
      </select>
    </div>
  );
}
