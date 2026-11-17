/**
 * Turns a Resolution into the merged logbook. See docs/DESIGN.md §7.1 (stage 6) and §7.5.
 *
 * Pure. Undecided fields carry side `a`'s value and undecided orphans are kept, so the
 * result is always a complete logbook; `Resolution.open` says whether it is final.
 */
import { toLogbook } from '../importers';
import type {
  ConversionNote,
  ImportResult,
  SourceAircraft,
  SourceRecord,
  ToLogbookOptions,
} from '../importers';
import type { Logbook } from '../model';
import type { Resolution } from './types';

export interface MergeSources {
  a: Pick<ImportResult, 'source' | 'aircraft'>;
  b: Pick<ImportResult, 'source' | 'aircraft'>;
}

/**
 * One aircraft list for both sources, by normalised tail. Where both apps know a tail, side
 * `a`'s description is used and side `b` fills in what `a` leaves blank. Only aircraft that
 * a merged record flies are included.
 */
export function mergeAircraft(
  a: readonly SourceAircraft[],
  b: readonly SourceAircraft[],
  tails: ReadonlySet<string>,
): SourceAircraft[] {
  const byTail = new Map<string, SourceAircraft>();
  for (const craft of a) {
    if (tails.has(craft.tail) && !byTail.has(craft.tail)) byTail.set(craft.tail, { ...craft });
  }
  const fromA = new Set(byTail.keys());
  for (const craft of b) {
    if (!tails.has(craft.tail)) continue;
    const held = byTail.get(craft.tail);
    if (!held) {
      byTail.set(craft.tail, { ...craft });
    } else if (fromA.has(craft.tail)) {
      const stated = Object.fromEntries(Object.entries(held).filter(([, v]) => v !== undefined));
      byTail.set(craft.tail, { ...craft, ...stated } as SourceAircraft);
      fromA.delete(craft.tail);
    }
  }
  return [...byTail.values()];
}

/** The merged records as one import, with the entry id each record is to get. */
export function mergedImport(
  resolution: Resolution,
  sources: MergeSources,
): { result: ImportResult; entryIds: Map<SourceRecord, string> } {
  const entryIds = new Map<SourceRecord, string>();
  for (const p of resolution.pairs) entryIds.set(p.record, p.entryId);
  for (const o of resolution.orphans) {
    if (o.action !== 'drop') entryIds.set(o.record, o.entryId);
  }
  const records = [...entryIds.keys()];
  const tails = new Set(records.flatMap((r) => (r.tail === undefined ? [] : [r.tail])));
  return {
    result: {
      source: sources.a.source,
      records,
      aircraft: mergeAircraft(sources.a.aircraft, sources.b.aircraft, tails),
      issues: [],
    },
    entryIds,
  };
}

export function toMergedLogbook(
  resolution: Resolution,
  sources: MergeSources,
  options: Pick<ToLogbookOptions, 'airports' | 'dateBasis'> = {},
): { logbook: Logbook; notes: ConversionNote[] } {
  const { result, entryIds } = mergedImport(resolution, sources);
  return toLogbook(result, {
    ...options,
    batchId: 'merge',
    entryId: (rec) => entryIds.get(rec) ?? `${rec.source}:${rec.line}`,
  });
}
