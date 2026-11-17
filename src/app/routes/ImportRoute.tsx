import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import type { ConversionNote, ImportIssue } from '@core/importers';
import { detectSource, importFile, loadAirports, type BookInfo, type BookId } from '@storage/index';
import { IssueSummary } from '../components/IssueSummary';
import { BOOK_LABELS } from '../lib/books';
import { formatImportedAt, plural } from '../lib/format';
import { useStore } from '../store/StoreProvider';
import { useShell } from './shellContext';

const SOURCE_NAMES = { logten: 'LogTen Pro', foreflight: 'ForeFlight' } as const;

interface PickedFile {
  name: string;
  text: string;
}

type Phase =
  | { name: 'idle' }
  | { name: 'working'; fileName: string; step: string }
  | { name: 'confirm'; file: PickedFile; existing: BookInfo }
  | {
      name: 'done';
      fileName: string;
      book: BookId;
      info: BookInfo;
    }
  | { name: 'failed'; fileName: string; title: string; detail: string; advice: string };

const EXPORT_ADVICE =
  'In LogTen Pro, export the logbook as tab-delimited text. In ForeFlight, export the logbook as CSV. Then choose that file.';

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsText(file);
  });
}

/** Lets the browser paint a "working" state before a long synchronous parse. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function ImportRoute() {
  const store = useStore();
  const navigate = useNavigate();
  const { books, retryBooks, selectBook } = useShell();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<BookId>();
  const [removeError, setRemoveError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  const bookList = books.status === 'ready' ? books.value : [];
  const busy = phase.name === 'working';

  async function runImport(file: PickedFile) {
    setPhase({ name: 'working', fileName: file.name, step: 'Loading airport data…' });
    try {
      const airports = await loadAirports().catch(() => undefined);
      if (!airports) {
        setPhase({
          name: 'failed',
          fileName: file.name,
          title: 'The airport data could not be loaded.',
          detail: 'The logbook needs it to work out local dates, so nothing was imported.',
          advice: 'Reload the page while online, then choose the file again.',
        });
        return;
      }
      setPhase({ name: 'working', fileName: file.name, step: 'Converting and saving entries…' });
      await nextFrame();
      const outcome = await importFile(store, file, {
        airports,
        now: () => new Date().toISOString(),
      });
      if (outcome.ok) {
        setPhase({ name: 'done', fileName: file.name, book: outcome.book, info: outcome.info });
      } else if (outcome.reason === 'unknown-format') {
        setPhase({
          name: 'failed',
          fileName: file.name,
          title: 'This file is not a recognised logbook export.',
          detail: outcome.message,
          advice: EXPORT_ADVICE,
        });
      } else {
        setPhase({
          name: 'failed',
          fileName: file.name,
          title: 'The file looks like a logbook export, but it could not be read.',
          detail: outcome.message,
          advice:
            'Nothing on this device changed. Export the logbook again and choose the new file.',
        });
      }
    } catch (error) {
      setPhase({
        name: 'failed',
        fileName: file.name,
        title: 'The logbook could not be saved on this device.',
        detail: messageOf(error),
        advice:
          'Nothing was imported. Check that the browser has free storage and is not in private browsing, then try again.',
      });
    }
  }

  async function handleFile(file: File) {
    setPhase({ name: 'working', fileName: file.name, step: 'Reading the file…' });
    let text: string;
    try {
      text = await readFileText(file);
    } catch (error) {
      setPhase({
        name: 'failed',
        fileName: file.name,
        title: 'The file could not be read.',
        detail: messageOf(error),
        advice:
          'Choose the file again. If it is in cloud storage, download it to this device first.',
      });
      return;
    }
    const picked = { name: file.name, text };
    const source = detectSource(text);
    const existing = source ? bookList.find((b) => b.book === source) : undefined;
    if (existing) {
      setPhase({ name: 'confirm', file: picked, existing });
      return;
    }
    await runImport(picked);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) void handleFile(file);
  }

  async function removeBook(book: BookId) {
    try {
      await store.deleteBook(book);
      setRemoving(undefined);
      setRemoveError(undefined);
    } catch (error) {
      setRemoveError(`The book could not be removed: ${messageOf(error)} Try again.`);
    }
  }

  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="screen-title">Import a logbook export</h1>
        <p className="lede">
          Choose the file you exported from LogTen Pro (tab-delimited text) or ForeFlight (CSV). It
          is read on this device and never uploaded.
        </p>

        <div
          className={`dropzone${dragging ? ' dropzone--over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="dropzone-text">Drop a file here, or</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choose a file
          </button>
          <input
            ref={inputRef}
            type="file"
            className="visually-hidden"
            accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values"
            aria-label="Logbook export file"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleFile(file);
            }}
          />
        </div>

        <div aria-live="polite" className="outcome-region">
          {phase.name === 'working' ? (
            <div className="outcome" role="status">
              <p className="outcome-title">Importing {phase.fileName}</p>
              <p className="muted">{phase.step}</p>
              <progress className="progress" aria-label="Import progress" />
            </div>
          ) : null}

          {phase.name === 'confirm' ? (
            <div
              className="outcome outcome--warn"
              role="alertdialog"
              aria-labelledby="confirm-title"
            >
              <p id="confirm-title" className="outcome-title">
                This replaces your {BOOK_LABELS[phase.existing.book]} book.
              </p>
              <p>
                The device already holds {BOOK_LABELS[phase.existing.book]} from{' '}
                {phase.existing.fileName ?? 'an earlier import'} (
                {plural(phase.existing.entryCount, 'entry', 'entries')}, imported{' '}
                {formatImportedAt(phase.existing.updatedAt)}). Importing {phase.file.name} deletes
                those entries and puts this file&rsquo;s in their place.
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void runImport(phase.file)}
                >
                  Replace {BOOK_LABELS[phase.existing.book]} book
                </button>
                <button type="button" className="btn" onClick={() => setPhase({ name: 'idle' })}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {phase.name === 'done' ? (
            <div className="outcome outcome--ok" role="status">
              <p className="outcome-title">
                Imported {plural(phase.info.entryCount, 'entry', 'entries')}
              </p>
              <p>
                {phase.fileName} was recognised as a{' '}
                {phase.info.source ? SOURCE_NAMES[phase.info.source] : 'logbook'} export. It is
                saved as the {BOOK_LABELS[phase.book]} book.
              </p>
              <IssueSummary
                title="Import issues"
                emptyText="No import issues."
                items={phase.info.issues.map(toItem)}
              />
              <IssueSummary
                title="Conversion notes"
                emptyText="No conversion notes."
                items={phase.info.notes.map(toItem)}
              />
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    selectBook(phase.book);
                    void navigate('/');
                  }}
                >
                  Open logbook
                </button>
              </div>
            </div>
          ) : null}

          {phase.name === 'failed' ? (
            <div className="outcome outcome--error" role="alert">
              <p className="outcome-title">{phase.title}</p>
              <p>
                <span className="muted">{phase.fileName}</span>
              </p>
              <p>{phase.detail}</p>
              <p>{phase.advice}</p>
            </div>
          ) : null}
        </div>

        <h2 className="section-title">Books on this device</h2>
        {books.status === 'loading' ? <p className="muted">Loading…</p> : null}
        {books.status === 'error' ? (
          <p role="alert">
            The list of books could not be read: {books.message}{' '}
            <button type="button" className="btn" onClick={retryBooks}>
              Try again
            </button>
          </p>
        ) : null}
        {books.status === 'ready' && bookList.length === 0 ? (
          <p className="muted">No books yet. Import a file above to create one.</p>
        ) : null}
        {removeError ? <p role="alert">{removeError}</p> : null}
        <ul className="book-list">
          {bookList.map((b) => (
            <li key={b.book} className="book-item">
              <div className="book-main">
                <p className="book-name">{BOOK_LABELS[b.book]}</p>
                <p className="muted book-meta">
                  {b.fileName ?? 'No file'} &middot; imported {formatImportedAt(b.updatedAt)}{' '}
                  &middot; {plural(b.entryCount, 'entry', 'entries')}
                </p>
                {removing === b.book ? (
                  <div
                    className="inline-confirm"
                    role="alertdialog"
                    aria-label={`Remove ${BOOK_LABELS[b.book]}`}
                  >
                    <p>
                      Remove the {BOOK_LABELS[b.book]} book from this device? Its{' '}
                      {plural(b.entryCount, 'entry', 'entries')} are deleted here. The file you
                      imported is not touched.
                    </p>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void removeBook(b.book)}
                      >
                        Remove {BOOK_LABELS[b.book]}
                      </button>
                      <button type="button" className="btn" onClick={() => setRemoving(undefined)}>
                        Keep
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              {removing === b.book ? null : (
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove ${BOOK_LABELS[b.book]}`}
                  onClick={() => setRemoving(b.book)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function toItem(x: ImportIssue | ConversionNote) {
  return {
    code: x.code,
    message: x.message,
    line: x.line,
    severity: 'severity' in x ? x.severity : undefined,
  };
}
