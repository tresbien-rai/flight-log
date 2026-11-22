import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COLUMN_PRESETS, importLogTen, toLogbook } from '@core/importers';
import type { Logbook } from '@core/model';
import { FlightLogDb } from './db';
import { createDexieStore } from './dexieStore';
import type { BookInfo } from './types';

let counter = 0;
const dbs: FlightLogDb[] = [];
function freshStore() {
  const db = new FlightLogDb(`test-${Date.now()}-${counter++}`);
  dbs.push(db);
  return { db, store: createDexieStore(db) };
}
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

const info = (over: Partial<Omit<BookInfo, 'book' | 'entryCount'>> = {}) => ({
  updatedAt: '2025-01-01T00:00:00Z',
  issues: [],
  notes: [],
  ...over,
});

function sampleLogbook(): Logbook {
  const text = readFileSync('fixtures/logten/sample.txt', 'utf8');
  const result = importLogTen(text, { columns: COLUMN_PRESETS.logten });
  const { logbook } = toLogbook(result);
  const stamped = logbook.entries.map((e) => ({
    ...e,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }));
  return { ...logbook, entries: stamped };
}

const empty: Logbook = { entries: [], airframes: [], aircraftTypes: [], devices: [], people: [] };

describe('dexie store', () => {
  it('round-trips a logbook exactly', async () => {
    const { store } = freshStore();
    const logbook = sampleLogbook();
    expect(logbook.entries.length).toBeGreaterThan(0);
    expect(logbook.airframes.length).toBeGreaterThan(0);
    await store.replaceBook('logten', logbook, info());
    const loaded = await store.loadBook('logten');
    const sortById = <T extends { id: string }>(xs: T[]) =>
      [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(loaded).toEqual({
      entries: [...logbook.entries].sort(
        (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.id < b.id ? -1 : 1),
      ),
      airframes: sortById(logbook.airframes),
      aircraftTypes: sortById(logbook.aircraftTypes),
      devices: sortById(logbook.devices),
      people: sortById(logbook.people),
    });
    for (const e of loaded?.entries ?? []) expect('book' in e).toBe(false);
  });

  it('returns undefined for a missing book', async () => {
    const { store } = freshStore();
    expect(await store.loadBook('main')).toBeUndefined();
  });

  it('sorts entries by date then id', async () => {
    const { store } = freshStore();
    const base = sampleLogbook().entries[0]!;
    const mk = (id: string, date: string) => ({ ...base, id, date });
    await store.replaceBook(
      'main',
      { ...empty, entries: [mk('b', '2024-02-01'), mk('z', '2024-01-01'), mk('a', '2024-02-01')] },
      info(),
    );
    const loaded = await store.loadBook('main');
    expect(loaded?.entries.map((e) => e.id)).toEqual(['z', 'a', 'b']);
  });

  it('replace removes the old rows', async () => {
    const { store } = freshStore();
    const first = sampleLogbook();
    await store.replaceBook('logten', first, info());
    const base = first.entries[0]!;
    const second: Logbook = { ...empty, entries: [{ ...base, id: 'only-one' }] };
    await store.replaceBook('logten', second, info());
    expect(await store.loadBook('logten')).toEqual(second);
  });

  it('keeps books isolated', async () => {
    const { store } = freshStore();
    const logbook = sampleLogbook();
    await store.replaceBook('logten', logbook, info());
    await store.replaceBook('foreflight', { ...empty, entries: [logbook.entries[0]!] }, info());
    await store.replaceBook('foreflight', empty, info());
    expect((await store.loadBook('logten'))?.entries).toHaveLength(logbook.entries.length);
    expect((await store.loadBook('foreflight'))?.entries).toHaveLength(0);
    await store.deleteBook('foreflight');
    expect((await store.loadBook('logten'))?.entries).toHaveLength(logbook.entries.length);
  });

  it('is atomic: a failing replace leaves the previous contents intact', async () => {
    const { store } = freshStore();
    const good = sampleLogbook();
    await store.replaceBook('logten', good, info({ fileName: 'old.txt' }));
    const base = good.entries[0]!;
    const bad: Logbook = {
      ...empty,
      entries: [
        { ...base, id: 'dup' },
        { ...base, id: 'dup' },
      ],
    };
    await expect(store.replaceBook('logten', bad, info({ fileName: 'new.txt' }))).rejects.toThrow();
    const loaded = await store.loadBook('logten');
    expect(loaded?.entries).toHaveLength(good.entries.length);
    expect(loaded?.entries.some((e) => e.id === 'dup')).toBe(false);
    expect((await store.listBooks())[0]?.fileName).toBe('old.txt');
  });

  it('lists books in BOOK_IDS order with entryCount excluding deleted entries', async () => {
    const { store } = freshStore();
    const base = sampleLogbook().entries[0]!;
    const logbook: Logbook = {
      ...empty,
      entries: [
        { ...base, id: 'a' },
        { ...base, id: 'b', deletedAt: '2025-02-02T00:00:00Z' },
        { ...base, id: 'c' },
      ],
    };
    await store.replaceBook('foreflight', logbook, info({ source: 'foreflight' }));
    await store.replaceBook('main', empty, info());
    await store.replaceBook('logten', empty, info());
    const books = await store.listBooks();
    expect(books.map((b) => b.book)).toEqual(['main', 'logten', 'foreflight']);
    expect(books.map((b) => b.entryCount)).toEqual([0, 0, 2]);
    // Deleted entries are still loaded.
    expect((await store.loadBook('foreflight'))?.entries).toHaveLength(3);
  });

  it('deleteBook removes rows and info', async () => {
    const { store, db } = freshStore();
    await store.replaceBook('logten', sampleLogbook(), info());
    await store.deleteBook('logten');
    expect(await store.loadBook('logten')).toBeUndefined();
    expect(await store.listBooks()).toEqual([]);
    expect(await db.entries.count()).toBe(0);
    expect(await db.airframes.count()).toBe(0);
  });

  it('stores settings', async () => {
    const { store } = freshStore();
    expect(await store.getSetting('x')).toBeUndefined();
    await store.setSetting('x', { a: [1, 2], b: 'c' });
    expect(await store.getSetting('x')).toEqual({ a: [1, 2], b: 'c' });
    await store.setSetting('x', 5);
    expect(await store.getSetting<number>('x')).toBe(5);
  });

  it('stores profile documents apart from aircraft edits, without announcing them', async () => {
    const { store } = freshStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(await store.loadProfileDoc('pilot')).toBeUndefined();
    await store.saveProfileDoc('pilot', { name: 'Pat Example' });
    await store.saveProfileDoc('reportLayouts', [{ id: 'a' }]);
    expect(await store.loadProfileDoc('pilot')).toEqual({ name: 'Pat Example' });
    expect(await store.loadProfileDoc('reportLayouts')).toEqual([{ id: 'a' }]);
    expect((await store.loadAircraftEdits()).types).toEqual({});
    await new Promise((r) => setTimeout(r, 20));
    expect(listener).not.toHaveBeenCalled();
  });

  describe('subscribe', () => {
    it('notifies asynchronously after replace and delete; settings do not notify', async () => {
      const { store } = freshStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      await store.replaceBook('main', empty, info());
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
      await store.deleteBook('main');
      await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
      await store.setSetting('k', 1);
      await new Promise((r) => setTimeout(r, 20));
      expect(listener).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('stops calling after unsubscribe', async () => {
      const { store } = freshStore();
      const listener = vi.fn();
      store.subscribe(listener)();
      await store.replaceBook('main', empty, info());
      await new Promise((r) => setTimeout(r, 20));
      expect(listener).not.toHaveBeenCalled();
    });

    it('a throwing listener does not break others', async () => {
      const { store } = freshStore();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const good = vi.fn();
      const u1 = store.subscribe(() => {
        throw new Error('boom');
      });
      const u2 = store.subscribe(good);
      await store.replaceBook('main', empty, info());
      await vi.waitFor(() => expect(good).toHaveBeenCalledTimes(1));
      u1();
      u2();
      spy.mockRestore();
    });

    it('notifies when another tab announces a change', async () => {
      const { store } = freshStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);
      const other = new BroadcastChannel('flight-log');
      other.postMessage('changed');
      await vi.waitFor(() => expect(listener).toHaveBeenCalled());
      other.close();
      unsubscribe();
    });

    it('announces local writes to other tabs', async () => {
      const { store } = freshStore();
      const other = new BroadcastChannel('flight-log');
      const received = new Promise<void>((resolve) => {
        other.onmessage = () => resolve();
      });
      await store.replaceBook('main', empty, info());
      await received;
      other.close();
    });
  });

  it('replaceBook + loadBook of 2,000 entries is fast', async () => {
    const { store } = freshStore();
    const base = sampleLogbook().entries[0]!;
    const entries = Array.from({ length: 2000 }, (_, i) => ({
      ...base,
      id: `perf-${String(i).padStart(5, '0')}`,
      date: `20${10 + (i % 15)}-0${1 + (i % 9)}-1${i % 10}`,
    }));
    const start = performance.now();
    await store.replaceBook('main', { ...empty, entries }, info());
    const loaded = await store.loadBook('main');
    const elapsed = performance.now() - start;
    expect(loaded?.entries).toHaveLength(2000);
    expect(elapsed).toBeLessThan(2000);
  });
});
