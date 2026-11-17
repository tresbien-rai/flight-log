import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { amendPairDecision, decisionKey, type Decision } from '@core/reconcile';
import { loadAudit, reresolve, writeMainBook } from './audit';
import { FlightLogDb } from './db';
import { createDexieStore } from './dexieStore';
import { importFile } from './importFile';

const NOW = '2025-06-01T12:00:00Z';
const LATER = '2025-07-01T12:00:00Z';

let counter = 0;
const dbs: FlightLogDb[] = [];
function freshStore() {
  const db = new FlightLogDb(`audit-test-${Date.now()}-${counter++}`);
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

async function bothImported() {
  const store = freshStore();
  await importFile(store, logten, { now: () => NOW });
  await importFile(store, foreflight, { now: () => NOW });
  return store;
}

describe('source files', () => {
  it('importFile keeps the file text, and deleting the book removes it', async () => {
    const store = freshStore();
    await importFile(store, logten, { now: () => NOW });
    expect(await store.loadSourceFile('logten')).toEqual({
      source: 'logten',
      fileName: 'logten.txt',
      text: logten.text,
      importedAt: NOW,
    });
    expect(await store.loadSourceFile('foreflight')).toBeUndefined();
    await store.deleteBook('logten');
    expect(await store.loadSourceFile('logten')).toBeUndefined();
  });

  it('a failed import stores no file', async () => {
    const store = freshStore();
    await importFile(store, { name: 'x.csv', text: 'Date,Tail\n' }, { now: () => NOW });
    expect(await store.loadSourceFile('logten')).toBeUndefined();
    expect(await store.loadSourceFile('foreflight')).toBeUndefined();
  });
});

describe('decisions', () => {
  const bulk = (choice: 'a' | 'b'): Decision => ({
    kind: 'bulk',
    pattern: 'rounding',
    choice,
    decidedAt: NOW,
  });
  const orphan: Decision = {
    kind: 'orphan',
    side: 'b',
    record: 'x',
    action: 'keep',
    decidedAt: NOW,
  };

  it('stores, replaces by key and removes', async () => {
    const store = freshStore();
    expect(await store.listDecisions()).toEqual([]);
    await store.putDecisions([bulk('a'), orphan]);
    await store.putDecisions([bulk('b')]);
    const held = await store.listDecisions();
    expect(held).toHaveLength(2);
    expect(held).toContainEqual(bulk('b'));
    expect(held).toContainEqual(orphan);
    await store.removeDecisions([decisionKey(orphan), 'no-such-key']);
    expect(await store.listDecisions()).toEqual([bulk('b')]);
  });

  it('notifies subscribers of decision and source-file writes', async () => {
    const store = freshStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    await store.putDecisions([orphan]);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    await store.removeDecisions([decisionKey(orphan)]);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    await store.saveSourceFile({ source: 'logten', fileName: 'f', text: 't', importedAt: NOW });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(3));
    await store.putDecisions([]);
    await store.removeDecisions([]);
    await new Promise((r) => setTimeout(r, 10));
    expect(listener).toHaveBeenCalledTimes(3);
    off();
  });
});

describe('loadAudit', () => {
  it('says which files are missing', async () => {
    const store = freshStore();
    expect(await loadAudit(store)).toEqual({ ok: false, missing: ['logten', 'foreflight'] });
    await importFile(store, logten, { now: () => NOW });
    expect(await loadAudit(store)).toEqual({ ok: false, missing: ['foreflight'] });
  });

  it('pairs the two stored files and accounts for every row', async () => {
    const outcome = await loadAudit(await bothImported());
    if (!outcome.ok) throw new Error('expected an audit');
    const { a, b, resolution } = outcome.audit;
    expect(a.source).toBe('logten');
    expect(b.source).toBe('foreflight');
    const orphansOn = (side: 'a' | 'b') => resolution.orphans.filter((o) => o.side === side).length;
    expect(resolution.pairs.length + orphansOn('a')).toBe(a.records.length);
    expect(resolution.pairs.length + orphansOn('b')).toBe(b.records.length);
    expect(resolution.pairs.map((p) => p.match)).toEqual([
      'exact',
      'exact',
      'unconfirmed',
      'exact',
    ]);
    expect(resolution.orphans.map((o) => [o.side, o.record.kind])).toEqual([
      ['a', 'ground'],
      ['b', 'simulator'],
    ]);
    expect(resolution.open).toEqual({ matches: 1, fields: 6, orphans: 2 });
  });

  it('applies stored decisions, and they survive a re-import of the same files', async () => {
    const store = await bothImported();
    const first = await loadAudit(store);
    if (!first.ok) throw new Error('expected an audit');
    const before = first.audit.resolution.open;
    const pair = first.audit.resolution.pairs.find((p) =>
      p.fields.some((f) => f.by === 'undecided'),
    );
    if (!pair) throw new Error('fixtures should disagree somewhere');
    const field = pair.fields.find((f) => f.by === 'undecided')!.field;
    const decision = amendPairDecision(pair, { match: 'confirmed', fields: { [field]: 'b' } }, NOW);

    expect(reresolve(first.audit, [decision]).resolution.open.fields).toBe(before.fields - 1);

    await store.putDecisions([decision]);
    await importFile(store, logten, { now: () => LATER });
    await importFile(store, foreflight, { now: () => LATER });
    const again = await loadAudit(store);
    if (!again.ok) throw new Error('expected an audit');
    expect(again.audit.resolution.open.fields).toBe(before.fields - 1);
    expect(again.audit.resolution.stale).toEqual([]);
  });
});

describe('writeMainBook', () => {
  it('writes the merged logbook as main and keeps acknowledgements across rebuilds', async () => {
    const store = await bothImported();
    const outcome = await loadAudit(store);
    if (!outcome.ok) throw new Error('expected an audit');
    const { resolution } = outcome.audit;

    const info = await writeMainBook(store, outcome.audit, { now: () => NOW });
    expect(info.entryCount).toBe(resolution.pairs.length + resolution.orphans.length);
    expect((await store.listBooks()).map((b) => b.book)).toEqual(['main', 'logten', 'foreflight']);

    const main = (await store.loadBook('main'))!;
    expect(main.entries).toHaveLength(info.entryCount);
    expect(main.entries.every((e) => e.createdAt === NOW && e.id.startsWith('main:'))).toBe(true);

    const marked = { ...main.entries[0]!, acknowledged: ['some-rule'] };
    await store.replaceBook(
      'main',
      { ...main, entries: [marked, ...main.entries.slice(1)] },
      { updatedAt: NOW, issues: [], notes: [] },
    );
    await writeMainBook(store, outcome.audit, { now: () => LATER });
    const rebuilt = (await store.loadBook('main'))!;
    const same = rebuilt.entries.find((e) => e.id === marked.id)!;
    expect(same).toMatchObject({ acknowledged: ['some-rule'], createdAt: NOW, updatedAt: LATER });

    // The source files and books are untouched.
    expect((await store.loadBook('logten'))!.entries.length).toBe(outcome.audit.a.records.length);
  });
});
