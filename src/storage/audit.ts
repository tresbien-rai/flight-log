/**
 * Glue between the stored files and decisions and the pure audit steps in core.
 * See docs/DESIGN.md §7.
 */
import type { AirportLookup } from '@core/airports';
import {
  COLUMN_PRESETS,
  importForeFlight,
  importLogTen,
  type ImportResult,
  type SourceId,
} from '@core/importers';
import {
  matchRecords,
  resolve,
  toMergedLogbook,
  type Decision,
  type MatchResult,
  type Resolution,
  type ResolveOptions,
} from '@core/reconcile';
import type { BookInfo, LogbookStore } from './types';

/** Which app is side `a` and which is side `b` in stored decisions. Never swap these. */
export const AUDIT_SIDES = { a: 'logten', b: 'foreflight' } as const satisfies Record<
  'a' | 'b',
  SourceId
>;

export interface Audit {
  a: ImportResult;
  b: ImportResult;
  match: MatchResult;
  decisions: Decision[];
  resolution: Resolution;
  /** What the resolution was made with; kept so a re-resolve uses the same. */
  options: ResolveOptions;
}

export type AuditOutcome = { ok: true; audit: Audit } | { ok: false; missing: SourceId[] };

function parse(source: SourceId, text: string): ImportResult {
  const importer = source === 'logten' ? importLogTen : importForeFlight;
  return importer(text, { columns: COLUMN_PRESETS[source] });
}

/** Parses both stored files, pairs them and applies every stored decision. */
export async function loadAudit(
  store: LogbookStore,
  options: ResolveOptions = {},
): Promise<AuditOutcome> {
  const [fileA, fileB, decisions] = await Promise.all([
    store.loadSourceFile(AUDIT_SIDES.a),
    store.loadSourceFile(AUDIT_SIDES.b),
    store.listDecisions(),
  ]);
  if (!fileA || !fileB) {
    const missing: SourceId[] = [];
    if (!fileA) missing.push(AUDIT_SIDES.a);
    if (!fileB) missing.push(AUDIT_SIDES.b);
    return { ok: false, missing };
  }
  const a = parse(AUDIT_SIDES.a, fileA.text);
  const b = parse(AUDIT_SIDES.b, fileB.text);
  const match = matchRecords(a.records, b.records);
  return {
    ok: true,
    audit: { a, b, match, decisions, options, resolution: resolve(match, decisions, options) },
  };
}

/**
 * The same audit with a different set of decisions or options; nothing is parsed or matched
 * again.
 */
export function reresolve(
  audit: Audit,
  decisions: Decision[],
  options: ResolveOptions = audit.options,
): Audit {
  return { ...audit, decisions, options, resolution: resolve(audit.match, decisions, options) };
}

/**
 * Writes the merged logbook as the `main` book, replacing what was there. An entry that was
 * already in `main` keeps its creation time and acknowledged findings.
 */
export async function writeMainBook(
  store: LogbookStore,
  audit: Audit,
  deps: { airports?: AirportLookup; now: () => string },
): Promise<BookInfo> {
  const { logbook, notes } = toMergedLogbook(audit.resolution, audit, { airports: deps.airports });
  const now = deps.now();
  const previous = new Map((await store.loadBook('main'))?.entries.map((e) => [e.id, e]));
  const entries = logbook.entries.map((e) => {
    const old = previous.get(e.id);
    return {
      ...e,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      acknowledged: old?.acknowledged ?? [],
    };
  });
  const info = { updatedAt: now, issues: [], notes };
  await store.replaceBook('main', { ...logbook, entries }, info);
  return { ...info, book: 'main', entryCount: entries.length };
}
