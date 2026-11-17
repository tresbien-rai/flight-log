import type { AirportLookup } from '@core/airports';
import {
  COLUMN_PRESETS,
  importForeFlight,
  importLogTen,
  toLogbook,
  type SourceId,
} from '@core/importers';
import type { BookId, BookInfo, LogbookStore } from './types';

export type ImportOutcome =
  | { ok: true; book: BookId; info: BookInfo }
  | { ok: false; reason: 'unknown-format' | 'parse-failed'; message: string };

/** Identifies the source from the first line(s) only; never parses the whole file. */
export function detectSource(text: string): SourceId | undefined {
  let start = text.charCodeAt(0) === 0xfeff ? 1 : 0; // skip a byte-order mark
  // First non-empty line.
  for (;;) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, '');
    if (line.trim() !== '') {
      if (line.startsWith('ForeFlight Logbook Import')) return 'foreflight';
      if (line.split('\t').some((cell) => cell.trim() === 'flight_flightDate')) return 'logten';
      return undefined;
    }
    if (end >= text.length) return undefined;
    start = end + 1;
  }
}

export async function importFile(
  store: LogbookStore,
  file: { name: string; text: string },
  deps: { airports?: AirportLookup; now: () => string },
): Promise<ImportOutcome> {
  const source = detectSource(file.text);
  if (source === undefined) {
    return {
      ok: false,
      reason: 'unknown-format',
      message: `${file.name} is not a LogTen Pro tab-delimited export or a ForeFlight logbook CSV.`,
    };
  }

  let info: Omit<BookInfo, 'book' | 'entryCount'>;
  let logbook;
  try {
    const importer = source === 'logten' ? importLogTen : importForeFlight;
    const result = importer(file.text, { columns: COLUMN_PRESETS[source] });
    const converted = toLogbook(result, { airports: deps.airports });
    const now = deps.now();
    logbook = {
      ...converted.logbook,
      entries: converted.logbook.entries.map((e) => ({ ...e, createdAt: now, updatedAt: now })),
    };
    info = {
      source,
      fileName: file.name,
      updatedAt: now,
      issues: result.issues,
      notes: converted.notes,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'parse-failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  await store.replaceBook(source, logbook, info);
  const saved = (await store.listBooks()).find((b) => b.book === source);
  return {
    ok: true,
    book: source,
    info: saved ?? { ...info, book: source, entryCount: logbook.entries.length },
  };
}
