import { useEffect, useRef, useState } from 'react';
import {
  backupFileName,
  isEmptySummary,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type Backup,
  type BackupSummary,
} from '@core/backup';
import { collectBackup, loadAirports, restoreBackup, type RestoreOutcome } from '@storage/index';
import { BOOK_LABELS } from '../lib/books';
import { canShareFile, downloadText, readFileText, shareText } from '../lib/files';
import { formatImportedAt, plural } from '../lib/format';
import { useStore } from '../store/StoreProvider';

/** When a backup was last downloaded or shared from this device. Not itself backed up. */
export const LAST_BACKUP_SETTING = 'backup.lastMadeAt';

const JSON_TYPE = 'application/json';
const SOURCE_NAMES = { logten: 'LogTen Pro', foreflight: 'ForeFlight' } as const;
const DOCUMENT_NAMES: Record<string, string> = {
  pilot: 'Pilot details for the report',
  reportLayouts: 'Saved report layouts',
};

type Phase =
  | { name: 'idle' }
  | { name: 'working'; step: string }
  | { name: 'made'; fileName: string; how: 'downloaded' | 'shared' }
  | { name: 'confirm'; fileName: string; backup: Backup; current: Backup; saved?: string }
  | { name: 'restored'; backup: Backup; outcome: RestoreOutcome }
  | { name: 'failed'; title: string; detail: string; advice: string };

const now = () => new Date().toISOString();
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** Lets the browser paint a "working" state before a long synchronous step. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

function SummaryList({ summary }: { summary: BackupSummary }) {
  if (isEmptySummary(summary)) return <p className="muted">Nothing.</p>;
  return (
    <ul className="backup-summary">
      {summary.mainEntries !== undefined ? (
        <li>
          {BOOK_LABELS.main}: {plural(summary.mainEntries, 'entry', 'entries')}
        </li>
      ) : null}
      {summary.sources.map((s) => (
        <li key={s.source}>
          {SOURCE_NAMES[s.source]} export {s.fileName}, imported {formatImportedAt(s.importedAt)}
        </li>
      ))}
      {summary.decisions > 0 ? <li>{plural(summary.decisions, 'audit decision')}</li> : null}
      {summary.aircraftEdits > 0 ? (
        <li>
          {plural(summary.aircraftEdits, 'edited aircraft or type', 'edited aircraft and types')}
        </li>
      ) : null}
      {summary.documents.map((doc) => (
        <li key={doc}>{DOCUMENT_NAMES[doc] ?? doc}</li>
      ))}
    </ul>
  );
}

/** Whether the browser has promised not to clear this site's data on its own. */
function useStoragePromise(): { kept: boolean | undefined; ask: () => void } {
  const [kept, setKept] = useState<boolean>();
  useEffect(() => {
    let cancelled = false;
    navigator.storage?.persisted?.().then(
      (value) => {
        if (!cancelled) setKept(value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const ask = () => {
    navigator.storage?.persist?.().then(setKept, () => undefined);
  };
  return { kept, ask };
}

/**
 * Download a backup of everything that cannot be rebuilt, and restore one. Works with no
 * network and no account. See docs/DESIGN.md §3.3.
 */
export function BackupSettings({
  onRestored,
}: {
  /** Called after a restore so the screen can show the restored settings. */
  onRestored: (backup: Backup) => void;
}) {
  const store = useStore();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [lastMade, setLastMade] = useState<string>();
  const [shareable] = useState(() => canShareFile('flight-log-backup.json', JSON_TYPE));
  const storage = useStoragePromise();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = phase.name === 'working';

  useEffect(() => {
    let cancelled = false;
    store.getSetting<unknown>(LAST_BACKUP_SETTING).then(
      (value) => {
        if (!cancelled && typeof value === 'string') setLastMade((current) => current ?? value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [store]);

  async function make(how: 'downloaded' | 'shared') {
    setPhase({ name: 'working', step: 'Gathering the backup…' });
    try {
      const backup = await collectBackup(store, { now });
      const fileName = backupFileName(backup);
      const text = serializeBackup(backup);
      if (how === 'shared') {
        if (!(await shareText(fileName, text, JSON_TYPE))) {
          setPhase({ name: 'idle' });
          return;
        }
      } else {
        downloadText(fileName, text, JSON_TYPE);
      }
      setLastMade(backup.createdAt);
      store.setSetting(LAST_BACKUP_SETTING, backup.createdAt).catch(() => undefined);
      setPhase({ name: 'made', fileName, how });
    } catch (error) {
      setPhase({
        name: 'failed',
        title: 'The backup could not be made.',
        detail: messageOf(error),
        advice: 'Nothing on this device changed. Try again.',
      });
    }
  }

  /** From the restore confirmation: saves what is about to be replaced, and stays there. */
  function saveCurrent(confirm: Extract<Phase, { name: 'confirm' }>) {
    const fileName = backupFileName(confirm.current);
    try {
      downloadText(fileName, serializeBackup(confirm.current), JSON_TYPE);
    } catch {
      return;
    }
    setLastMade(confirm.current.createdAt);
    store.setSetting(LAST_BACKUP_SETTING, confirm.current.createdAt).catch(() => undefined);
    setPhase({ ...confirm, saved: fileName });
  }

  async function choose(file: File) {
    setPhase({ name: 'working', step: 'Reading the backup…' });
    try {
      const parsed = parseBackup(await readFileText(file));
      if (!parsed.ok) {
        setPhase({
          name: 'failed',
          title:
            parsed.reason === 'newer'
              ? 'This backup is from a newer version of Flight Log.'
              : parsed.reason === 'damaged'
                ? 'This backup is damaged.'
                : 'This file is not a Flight Log backup.',
          detail: `${file.name}: ${parsed.message}`,
          advice:
            parsed.reason === 'newer'
              ? 'Nothing on this device changed. Reload the app while online to update it, then restore again.'
              : 'Nothing on this device changed. Choose a file named like flight-log-backup-2026-11-23.json.',
        });
        return;
      }
      const current = await collectBackup(store, { now });
      setPhase({ name: 'confirm', fileName: file.name, backup: parsed.backup, current });
    } catch (error) {
      setPhase({
        name: 'failed',
        title: 'The file could not be read.',
        detail: messageOf(error),
        advice: 'Nothing on this device changed. Choose the file again.',
      });
    }
  }

  async function restore(backup: Backup) {
    setPhase({ name: 'working', step: 'Loading airport data…' });
    try {
      const airports = await loadAirports().catch(() => undefined);
      if (!airports) {
        setPhase({
          name: 'failed',
          title: 'The airport data could not be loaded.',
          detail: 'Rebuilding the imported books needs it, so nothing was restored.',
          advice: 'Nothing on this device changed. Reload the page while online, then try again.',
        });
        return;
      }
      setPhase({ name: 'working', step: 'Rebuilding the books and saving…' });
      await nextFrame();
      const outcome = await restoreBackup(store, backup, { airports, now });
      onRestored(backup);
      setPhase({ name: 'restored', backup, outcome });
    } catch (error) {
      setPhase({
        name: 'failed',
        title: 'The backup could not be restored.',
        detail: messageOf(error),
        advice:
          'Nothing on this device changed. Check that the browser has free storage and is not in private browsing, then try again.',
      });
    }
  }

  const replacing = phase.name === 'confirm' && !isEmptySummary(summarizeBackup(phase.current));

  return (
    <fieldset className="settings-group">
      <legend className="section-title">Backup</legend>
      <p className="lede">
        A backup is one file with everything that cannot be rebuilt: your export files, audit
        decisions, aircraft edits, report layouts, pilot details and your merged logbook. Keep it
        somewhere other than this device.
      </p>
      <p>
        {lastMade
          ? `Last backup made on this device: ${formatImportedAt(lastMade)}.`
          : 'No backup has been made on this device yet.'}
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void make('downloaded')}
        >
          Download a backup
        </button>
        {shareable ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void make('shared')}>
            Share a backup…
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Restore from a backup…
        </button>
        <input
          ref={inputRef}
          type="file"
          className="visually-hidden"
          accept=".json,application/json"
          aria-label="Backup file"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void choose(file);
          }}
        />
      </div>

      <div aria-live="polite" className="outcome-region">
        {phase.name === 'working' ? (
          <div className="outcome" role="status">
            <p className="outcome-title">{phase.step}</p>
            <progress className="progress" aria-label="Backup progress" />
          </div>
        ) : null}

        {phase.name === 'made' ? (
          <div className="outcome outcome--ok" role="status">
            <p className="outcome-title">
              {phase.how === 'shared' ? 'Backup shared' : 'Backup downloaded'}
            </p>
            <p>
              {phase.fileName}{' '}
              {phase.how === 'shared'
                ? 'went to the place you chose.'
                : 'is in this device’s downloads. Move it somewhere off this device.'}
            </p>
          </div>
        ) : null}

        {phase.name === 'confirm' ? (
          <div className="outcome outcome--warn" role="alertdialog" aria-labelledby="restore-title">
            <p id="restore-title" className="outcome-title">
              {replacing ? 'Restoring replaces what is on this device.' : 'Restore this backup?'}
            </p>
            <p>
              {phase.fileName}, made {formatImportedAt(phase.backup.createdAt)}, holds:
            </p>
            <SummaryList summary={summarizeBackup(phase.backup)} />
            {replacing ? (
              <>
                <p>This device now holds the following, which is deleted and not merged:</p>
                <SummaryList summary={summarizeBackup(phase.current)} />
              </>
            ) : null}
            {phase.saved ? <p>Downloaded what is here as {phase.saved}.</p> : null}
            <p className="muted">
              The LogTen and ForeFlight books are rebuilt from the export files in the backup.
            </p>
            <div className="actions">
              <button
                type="button"
                className={replacing ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => void restore(phase.backup)}
              >
                {replacing ? 'Replace with this backup' : 'Restore this backup'}
              </button>
              {replacing ? (
                <button type="button" className="btn" onClick={() => saveCurrent(phase)}>
                  Download what is here first
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => setPhase({ name: 'idle' })}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {phase.name === 'restored' ? (
          <div
            className={`outcome ${phase.outcome.unreadable.length > 0 ? 'outcome--warn' : 'outcome--ok'}`}
            role="status"
          >
            <p className="outcome-title">
              Restored the backup of {formatImportedAt(phase.backup.createdAt)}
            </p>
            <p>
              {phase.outcome.books.length > 0
                ? `Books on this device: ${phase.outcome.books.map((b) => BOOK_LABELS[b.book]).join(', ')}.`
                : 'The backup held no books.'}
            </p>
            {phase.outcome.unreadable.map((u) => (
              <p key={u.source}>
                The {SOURCE_NAMES[u.source]} export {u.fileName} was restored but could not be read
                into a book: {u.message} Export the logbook from {SOURCE_NAMES[u.source]} again and
                import it.
              </p>
            ))}
          </div>
        ) : null}

        {phase.name === 'failed' ? (
          <div className="outcome outcome--error" role="alert">
            <p className="outcome-title">{phase.title}</p>
            <p>{phase.detail}</p>
            <p>{phase.advice}</p>
          </div>
        ) : null}
      </div>

      {storage.kept === true ? (
        <p className="muted">The browser has agreed not to clear this app’s data on its own.</p>
      ) : null}
      {storage.kept === false ? (
        <p className="muted">
          The browser may clear this app’s data when the device runs short of space.{' '}
          <button type="button" className="btn btn-link" onClick={storage.ask}>
            Ask it to keep the data
          </button>
        </p>
      ) : null}
    </fieldset>
  );
}
