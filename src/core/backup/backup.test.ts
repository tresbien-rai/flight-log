import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NO_EDITS } from '../aircraft';
import type { Decision } from '../reconcile';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  isEmptySummary,
  migrate,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  toBackup,
  type Backup,
  type BackupContents,
} from './index';

const SAMPLE_V1 = readFileSync('fixtures/backup/v1.json', 'utf8');
const NOW = '2026-11-23T10:00:00Z';

function sample(): Backup {
  const parsed = parseBackup(SAMPLE_V1);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.backup;
}

const EMPTY: BackupContents = {
  sources: [],
  decisions: [],
  aircraftEdits: NO_EDITS,
  documents: {},
  settings: {},
};

describe('the saved version 1 sample', () => {
  it('reads', () => {
    const backup = sample();
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.createdAt).toBe('2026-11-22T09:00:00Z');
    expect(backup.sources.map((s) => s.source)).toEqual(['logten', 'foreflight']);
    expect(backup.sources[0]?.text).toBe(readFileSync('fixtures/pair/logten.txt', 'utf8'));
    expect(backup.sources[1]?.text).toBe(readFileSync('fixtures/pair/foreflight.csv', 'utf8'));
    expect(backup.decisions).toHaveLength(2);
    expect(backup.aircraftEdits.types).toEqual({ C172: { notes: 'Club trainer' } });
    expect(backup.documents).toHaveProperty('pilot');
    expect(backup.settings).toEqual({
      'app.nameOrder': 'given-first',
      'app.flightNumberStyle': 'joined',
    });
    expect(backup.main?.logbook.entries.length).toBeGreaterThan(0);
  });

  it('survives being written and read again unchanged', () => {
    const backup = sample();
    expect(parseBackup(serializeBackup(backup))).toEqual({ ok: true, backup });
    expect(JSON.parse(serializeBackup(backup))).toEqual(JSON.parse(SAMPLE_V1));
  });

  it('summarises as counts', () => {
    const summary = summarizeBackup(sample());
    expect(summary).toEqual({
      sources: [
        { source: 'logten', fileName: 'logten.txt', importedAt: '2026-11-20T09:00:00Z' },
        { source: 'foreflight', fileName: 'foreflight.csv', importedAt: '2026-11-20T09:00:00Z' },
      ],
      decisions: 2,
      mainEntries: sample().main?.logbook.entries.length,
      aircraftEdits: 2,
      documents: ['pilot', 'reportLayouts'],
    });
    expect(isEmptySummary(summary)).toBe(false);
  });
});

describe('toBackup', () => {
  const rounding: Decision = {
    kind: 'bulk',
    pattern: 'rounding',
    choice: 'more-precise',
    decidedAt: NOW,
  };
  const orphan: Decision = {
    kind: 'orphan',
    side: 'b',
    record: 'abc',
    action: 'keep',
    decidedAt: NOW,
  };
  const file = (source: 'logten' | 'foreflight') => ({
    source,
    fileName: `${source}.txt`,
    text: 'x',
    importedAt: NOW,
  });

  it('gives the same file whatever order the store returned things in', () => {
    const one = toBackup(
      { ...EMPTY, sources: [file('foreflight'), file('logten')], decisions: [rounding, orphan] },
      NOW,
    );
    const other = toBackup(
      { ...EMPTY, sources: [file('logten'), file('foreflight')], decisions: [orphan, rounding] },
      NOW,
    );
    expect(serializeBackup(one)).toBe(serializeBackup(other));
    expect(one.sources.map((s) => s.source)).toEqual(['logten', 'foreflight']);
  });

  it('leaves out the merged logbook when there is none', () => {
    const backup = toBackup(EMPTY, NOW);
    expect('main' in backup).toBe(false);
    expect(parseBackup(serializeBackup(backup))).toEqual({ ok: true, backup });
    expect(summarizeBackup(backup).mainEntries).toBeUndefined();
    expect(isEmptySummary(summarizeBackup(backup))).toBe(true);
  });

  it('does not count deleted entries', () => {
    const backup = sample();
    const main = backup.main;
    if (!main) throw new Error('no main');
    const [first, ...rest] = main.logbook.entries;
    if (!first) throw new Error('no entries');
    const entries = [{ ...first, deletedAt: NOW }, ...rest];
    const summary = summarizeBackup({
      ...backup,
      main: { ...main, logbook: { ...main.logbook, entries } },
    });
    expect(summary.mainEntries).toBe(rest.length);
  });

  it('names the file by its date', () => {
    expect(backupFileName({ createdAt: '2026-11-23T23:59:00Z' })).toBe(
      'flight-log-backup-2026-11-23.json',
    );
  });
});

describe('parseBackup refuses', () => {
  const edited = (change: (json: Record<string, unknown>) => void) => {
    const json = JSON.parse(SAMPLE_V1) as Record<string, unknown>;
    change(json);
    return parseBackup(JSON.stringify(json));
  };

  it('text that is not JSON', () => {
    expect(parseBackup('Date,Tail\n')).toMatchObject({ ok: false, reason: 'not-json' });
    expect(parseBackup('')).toMatchObject({ ok: false, reason: 'not-json' });
  });

  it('JSON that is not a backup', () => {
    for (const text of ['[]', 'null', '3', '{}', '{"format":"other","version":1}']) {
      expect(parseBackup(text)).toMatchObject({ ok: false, reason: 'not-a-backup' });
    }
  });

  it('a backup from a newer app, saying so', () => {
    const result = edited((json) => (json.version = BACKUP_VERSION + 1));
    expect(result).toMatchObject({ ok: false, reason: 'newer' });
    expect(!result.ok && result.message).toMatch(/newer version/);
  });

  it('a missing or nonsensical version', () => {
    for (const version of [undefined, '1', 0, 1.5]) {
      expect(edited((json) => (json.version = version))).toMatchObject({
        ok: false,
        reason: 'damaged',
      });
    }
  });

  it.each([
    ['no date', (json: Record<string, unknown>) => delete json.createdAt],
    ['no export list', (json: Record<string, unknown>) => delete json.sources],
    [
      'an export without its text',
      (json: Record<string, unknown>) => {
        delete (json.sources as Record<string, unknown>[])[0]?.text;
      },
    ],
    [
      'an export from an unknown app',
      (json: Record<string, unknown>) => {
        (json.sources as Record<string, unknown>[])[0]!.source = 'other';
      },
    ],
    [
      'the same export twice',
      (json: Record<string, unknown>) => {
        const sources = json.sources as unknown[];
        sources.push(sources[0]);
      },
    ],
    ['no decisions', (json: Record<string, unknown>) => delete json.decisions],
    [
      'something that is not a decision',
      (json: Record<string, unknown>) => {
        (json.decisions as unknown[]).push({ kind: 'whim' });
      },
    ],
    ['no aircraft edits', (json: Record<string, unknown>) => delete json.aircraftEdits],
    [
      'a merged logbook without its people',
      (json: Record<string, unknown>) => {
        delete ((json.main as Record<string, unknown>).logbook as Record<string, unknown>).people;
      },
    ],
    [
      'an entry without an id',
      (json: Record<string, unknown>) => {
        const logbook = (json.main as Record<string, unknown>).logbook as Record<string, unknown>;
        delete (logbook.entries as Record<string, unknown>[])[0]?.id;
      },
    ],
    [
      'an entry without a date',
      (json: Record<string, unknown>) => {
        const logbook = (json.main as Record<string, unknown>).logbook as Record<string, unknown>;
        delete (logbook.entries as Record<string, unknown>[])[0]?.date;
      },
    ],
  ])('a backup with %s', (_name, change) => {
    expect(edited(change)).toMatchObject({ ok: false, reason: 'damaged' });
  });
});

describe('parseBackup forgives', () => {
  it('missing documents, settings and parts of the aircraft edits', () => {
    const json = JSON.parse(SAMPLE_V1) as Record<string, unknown>;
    delete json.documents;
    delete json.settings;
    json.aircraftEdits = { types: {} };
    const parsed = parseBackup(JSON.stringify(json));
    expect(parsed).toMatchObject({
      ok: true,
      backup: { documents: {}, settings: {}, aircraftEdits: NO_EDITS },
    });
  });

  it('fields a later minor change might add, by dropping them', () => {
    const json = JSON.parse(SAMPLE_V1) as Record<string, unknown>;
    json.somethingNew = true;
    const parsed = parseBackup(JSON.stringify(json));
    expect(parsed.ok && 'somethingNew' in parsed.backup).toBe(false);
  });
});

describe('migrate', () => {
  it('applies each step in turn and stamps the version', () => {
    const steps = {
      1: (b: Record<string, unknown>) => ({ ...b, two: true }),
      2: (b: Record<string, unknown>) => ({ ...b, three: b.two }),
    };
    expect(migrate({ version: 1 }, 1, steps, 3)).toEqual({ version: 3, two: true, three: true });
    expect(migrate({ version: 2, two: 'kept' }, 2, steps, 3)).toEqual({
      version: 3,
      two: 'kept',
      three: 'kept',
    });
  });

  it('returns the current version untouched', () => {
    const backup = { version: BACKUP_VERSION };
    expect(migrate(backup, BACKUP_VERSION)).toBe(backup);
  });

  it('fails loudly on a gap', () => {
    expect(() => migrate({ version: 1 }, 1, {}, 2)).toThrow(/No migration/);
  });
});
