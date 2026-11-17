import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { FlightLogDb } from './db';
import { createDexieStore } from './dexieStore';
import { detectSource, importFile } from './importFile';

const NOW = '2025-06-01T12:00:00Z';
const deps = { now: () => NOW };

let counter = 0;
const dbs: FlightLogDb[] = [];
function freshStore() {
  const db = new FlightLogDb(`import-test-${Date.now()}-${counter++}`);
  dbs.push(db);
  return createDexieStore(db);
}
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

const logten = readFileSync('fixtures/logten/sample.txt', 'utf8');
const foreflight = readFileSync('fixtures/foreflight/sample.csv', 'utf8');

describe('detectSource', () => {
  it('detects ForeFlight', () => {
    expect(detectSource(foreflight)).toBe('foreflight');
    expect(detectSource('\r\n\nForeFlight Logbook Import,x')).toBe('foreflight');
  });
  it('detects LogTen, tolerating padded headers', () => {
    expect(detectSource(logten)).toBe('logten');
    expect(detectSource('a\t flight_flightDate \tb\n1\t2\t3')).toBe('logten');
  });
  it('returns undefined otherwise', () => {
    expect(detectSource('')).toBeUndefined();
    expect(detectSource('   \n\n')).toBeUndefined();
    expect(detectSource('Date,Tail\n2024-01-01,N1')).toBeUndefined();
    // Only the first line counts.
    expect(detectSource('hello\nForeFlight Logbook Import')).toBeUndefined();
    expect(detectSource('hello\nflight_flightDate\tx')).toBeUndefined();
  });
});

describe('importFile', () => {
  it.each([
    ['logten', 'sample.txt', logten],
    ['foreflight', 'sample.csv', foreflight],
  ] as const)('imports a %s file', async (source, name, text) => {
    const store = freshStore();
    const outcome = await importFile(store, { name, text }, deps);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.book).toBe(source);
    expect(outcome.info).toMatchObject({
      book: source,
      source,
      fileName: name,
      updatedAt: NOW,
    });
    const loaded = await store.loadBook(source);
    expect(loaded?.entries.length).toBeGreaterThan(0);
    expect(outcome.info.entryCount).toBe(
      loaded?.entries.filter((e) => e.deletedAt === undefined).length,
    );
    for (const e of loaded?.entries ?? []) {
      expect(e.createdAt).toBe(NOW);
      expect(e.updatedAt).toBe(NOW);
    }
    expect(await store.listBooks()).toEqual([outcome.info]);
  });

  it('reports an unknown format and writes nothing', async () => {
    const store = freshStore();
    const outcome = await importFile(store, { name: 'x.csv', text: 'a,b\n1,2' }, deps);
    expect(outcome).toMatchObject({ ok: false, reason: 'unknown-format' });
    expect(await store.listBooks()).toEqual([]);
  });

  it('reports a parse failure and leaves existing data untouched', async () => {
    const store = freshStore();
    await importFile(store, { name: 'good.txt', text: logten }, deps);
    const before = await store.loadBook('logten');
    // Detected as ForeFlight by its banner, but the importer rejects it: no Flights Table.
    const outcome = await importFile(
      store,
      { name: 'bad.csv', text: 'ForeFlight Logbook Import,nothing else' },
      deps,
    );
    expect(outcome).toMatchObject({ ok: false, reason: 'parse-failed' });
    if (!outcome.ok) expect(outcome.message.length).toBeGreaterThan(0);
    expect(await store.listBooks()).toHaveLength(1);
    expect(await store.loadBook('logten')).toEqual(before);
    expect(await store.loadBook('foreflight')).toBeUndefined();
  });

  it('re-importing replaces the book', async () => {
    const store = freshStore();
    await importFile(store, { name: 'a.txt', text: logten }, deps);
    const later = await importFile(
      store,
      { name: 'b.txt', text: logten },
      { now: () => '2025-07-01T00:00:00Z' },
    );
    expect(later.ok && later.info.fileName).toBe('b.txt');
    expect((await store.loadBook('logten'))?.entries[0]?.updatedAt).toBe('2025-07-01T00:00:00Z');
  });
});
