import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBackup, serializeBackup, type Backup } from '@core/backup';
import type { Logbook } from '@core/model';
import type { Decision } from '@core/reconcile';
import { loadAudit, writeMainBook } from './audit';
import { collectBackup, restoreBackup } from './backup';
import { FlightLogDb } from './db';
import { createDexieStore } from './dexieStore';
import { importFile } from './importFile';
import type { LogbookStore } from './types';

const IMPORTED = '2025-06-01T12:00:00Z';
const BUILT = '2025-06-02T12:00:00Z';
const BACKED_UP = '2025-06-03T12:00:00Z';
const RESTORED = '2025-07-01T12:00:00Z';

let counter = 0;
const dbs: FlightLogDb[] = [];
function freshStore() {
  const db = new FlightLogDb(`backup-test-${Date.now()}-${counter++}`);
  dbs.push(db);
  return createDexieStore(db);
}
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

const logten = { name: 'logten.txt', text: readFileSync('fixtures/pair/logten.txt', 'utf8') };
const foreflight = {
  name: 'foreflight.csv',
  text: readFileSync('fixtures/pair/foreflight.csv', 'utf8'),
};

const decisions: Decision[] = [
  { kind: 'bulk', pattern: 'rounding', choice: 'more-precise', decidedAt: IMPORTED },
  { kind: 'bulk', pattern: 'real', field: 'tail', choice: 'a', decidedAt: IMPORTED },
];
const edits = {
  types: { C172: { notes: 'Club trainer' } },
  airframes: { 'af:N404GH': { notes: 'Club aircraft' } },
  devices: {},
  added: {},
};
const pilot = { name: 'Pat Example', certificates: [], medical: { class: 'First' } };

/** A device in full use: both exports, decisions, a built logbook, edits, documents, settings. */
async function populated(): Promise<LogbookStore> {
  const store = freshStore();
  await importFile(store, logten, { now: () => IMPORTED });
  await importFile(store, foreflight, { now: () => IMPORTED });
  await store.putDecisions(decisions);
  await store.saveAircraftEdits(edits);
  await store.saveProfileDoc('pilot', pilot);
  await store.setSetting('app.nameOrder', 'given-first');
  await store.setSetting('app.selectedBook', 'foreflight');
  const audit = await loadAudit(store);
  if (!audit.ok) throw new Error('audit did not load');
  await writeMainBook(store, audit.audit, { now: () => BUILT });
  return store;
}

/** A book without the times stamped on import, which a rebuild sets afresh. */
const unstamped = (logbook: Logbook | undefined) =>
  logbook && {
    ...logbook,
    entries: logbook.entries.map((e) => ({ ...e, createdAt: '', updatedAt: '' })),
  };

async function backupOf(store: LogbookStore): Promise<Backup> {
  const parsed = parseBackup(serializeBackup(await collectBackup(store, { now: () => BACKED_UP })));
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.backup;
}

describe('collectBackup', () => {
  it('holds the files, decisions, edits, documents, kept settings and the merged logbook', async () => {
    const store = await populated();
    const backup = await collectBackup(store, { now: () => BACKED_UP });
    expect(backup.createdAt).toBe(BACKED_UP);
    expect(backup.sources.map((s) => [s.source, s.fileName, s.text === logten.text])).toEqual([
      ['logten', 'logten.txt', true],
      ['foreflight', 'foreflight.csv', false],
    ]);
    expect(backup.sources[1]?.text).toBe(foreflight.text);
    expect(backup.decisions).toHaveLength(2);
    expect(backup.aircraftEdits).toEqual(edits);
    expect(backup.documents).toEqual({ pilot });
    // The selected book is one device's display choice and is not carried.
    expect(backup.settings).toEqual({ 'app.nameOrder': 'given-first' });
    expect(backup.main?.updatedAt).toBe(BUILT);
    expect(backup.main?.logbook).toEqual(await store.loadBook('main'));
  });

  it('backs up an empty device', async () => {
    const backup = await collectBackup(freshStore(), { now: () => BACKED_UP });
    expect(backup).toMatchObject({ sources: [], decisions: [], documents: {}, settings: {} });
    expect(backup.main).toBeUndefined();
  });
});

describe('restoreBackup', () => {
  it('brings a new device to the same state, rebuilding the imported books', async () => {
    const old = await populated();
    const fresh = freshStore();
    const outcome = await restoreBackup(fresh, await backupOf(old), { now: () => RESTORED });
    expect(outcome.unreadable).toEqual([]);
    expect(outcome.books.map((b) => b.book)).toEqual(['main', 'logten', 'foreflight']);

    // The merged logbook comes back exactly; the imported books match apart from their stamps.
    expect(await fresh.loadBook('main')).toEqual(await old.loadBook('main'));
    for (const book of ['logten', 'foreflight'] as const) {
      const rebuilt = await fresh.loadBook(book);
      expect(unstamped(rebuilt)).toEqual(unstamped(await old.loadBook(book)));
      expect(rebuilt?.entries.every((e) => e.updatedAt === RESTORED)).toBe(true);
    }
    const strip = (infos: Awaited<ReturnType<LogbookStore['listBooks']>>) =>
      infos.map((info) => ({ ...info, updatedAt: info.book === 'main' ? info.updatedAt : '' }));
    expect(strip(await fresh.listBooks())).toEqual(strip(await old.listBooks()));

    expect(await fresh.loadSourceFile('logten')).toEqual(await old.loadSourceFile('logten'));
    expect(await fresh.loadSourceFile('foreflight')).toEqual(
      await old.loadSourceFile('foreflight'),
    );
    expect(await fresh.listDecisions()).toHaveLength(2);
    expect(await fresh.listDecisions()).toEqual(expect.arrayContaining(decisions));
    expect(await fresh.loadAircraftEdits()).toEqual(edits);
    expect(await fresh.loadProfileDoc('pilot')).toEqual(pilot);
    expect(await fresh.getSetting('app.nameOrder')).toBe('given-first');
  });

  it('gives the same audit after a restore: every decision still finds its rows', async () => {
    const old = await populated();
    const fresh = freshStore();
    await restoreBackup(fresh, await backupOf(old), { now: () => RESTORED });
    const [before, after] = await Promise.all([loadAudit(old), loadAudit(fresh)]);
    if (!before.ok || !after.ok) throw new Error('audit did not load');
    expect(after.audit.resolution).toEqual(before.audit.resolution);
  });

  it('removes what the backup does not hold, but leaves this device’s display settings', async () => {
    const target = await populated();
    await target.saveProfileDoc('reportLayouts', [{ id: 'x' }]);
    const listener = vi.fn();
    target.subscribe(listener);
    const empty = await backupOf(freshStore());
    await restoreBackup(target, empty, { now: () => RESTORED });
    expect(await target.listBooks()).toEqual([]);
    expect(await target.loadBook('logten')).toBeUndefined();
    expect(await target.loadSourceFile('logten')).toBeUndefined();
    expect(await target.listDecisions()).toEqual([]);
    expect(await target.loadAircraftEdits()).toEqual({
      types: {},
      airframes: {},
      devices: {},
      added: {},
    });
    expect(await target.loadProfileDoc('pilot')).toBeUndefined();
    expect(await target.loadProfileDoc('reportLayouts')).toBeUndefined();
    expect(await target.getSetting('app.selectedBook')).toBe('foreflight');
    expect(await target.getSetting('app.nameOrder')).toBe('given-first');
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  });

  it('keeps an export file it cannot read and says so', async () => {
    const backup = await backupOf(await populated());
    const first = backup.sources[0];
    if (!first) throw new Error('no source');
    backup.sources[0] = { ...first, text: 'not an export\n' };
    const fresh = freshStore();
    const outcome = await restoreBackup(fresh, backup, { now: () => RESTORED });
    expect(outcome.unreadable).toHaveLength(1);
    expect(outcome.unreadable[0]).toMatchObject({ source: 'logten', fileName: 'logten.txt' });
    expect(outcome.books.map((b) => b.book)).toEqual(['main', 'foreflight']);
    expect(await fresh.loadBook('logten')).toBeUndefined();
    expect((await fresh.loadSourceFile('logten'))?.text).toBe('not an export\n');
    expect(await fresh.loadBook('foreflight')).toBeDefined();
  });

  it('changes nothing when the write fails', async () => {
    const target = await populated();
    const before = await collectBackup(target, { now: () => BACKED_UP });
    const backup = await backupOf(freshStore());
    // Two aircraft with one id cannot both be added; the whole restore must roll back.
    backup.main = {
      logbook: {
        entries: [],
        airframes: [
          { id: 'dup', registrations: [], configurations: [] },
          { id: 'dup', registrations: [], configurations: [] },
        ] as never,
        aircraftTypes: [],
        devices: [],
        people: [],
      },
      updatedAt: BUILT,
      issues: [],
      notes: [],
    };
    await expect(restoreBackup(target, backup, { now: () => RESTORED })).rejects.toThrow();
    expect(await collectBackup(target, { now: () => BACKED_UP })).toEqual(before);
    expect((await target.loadBook('logten'))?.entries.length).toBeGreaterThan(0);
  });
});
