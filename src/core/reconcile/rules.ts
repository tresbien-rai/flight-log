/**
 * Proposes an operating rule for merged flights that neither app marks. See docs/DESIGN.md
 * §7.4. Pure. A proposal is only a suggestion with its evidence; nothing is applied until
 * the pilot confirms it, which stores one RuleDecision per flight.
 */
import type { SourceRecord } from '../importers';
import type { EngineType, OperatingRule } from '../model';
import { mergeAircraft, type MergeSources } from './merge';
import type { Fingerprint, Resolution, RuleDecision } from './types';

export interface RuleProposal {
  /** Stable within one resolution: `<rule>:<label>`. */
  id: string;
  rule: OperatingRule;
  /**
   * - `airline`: a turbine aircraft, a flight number, and SIC time or a named PIC / SIC.
   * - `general`: none of that.
   */
  basis: 'airline' | 'general';
  /** What the flights have in common: the type code for airline legs, else the engine kind. */
  label: string;
  /** Anchor fingerprints, as RuleDecision.entry, in date order. */
  entries: Fingerprint[];
  /** Entry ids, in the same order. */
  entryIds: string[];
  /** First and last date, `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** How many of the flights carry each piece of evidence. */
  evidence: { flightNumber: number; sicTime: number; crewNamed: number };
}

const TURBINE: ReadonlySet<EngineType> = new Set(['turbofan', 'turbojet', 'turboprop']);

const hasSicTime = (r: SourceRecord) => (r.durations.sic ?? 0) > 0;
const hasFlightDeckCrew = (r: SourceRecord) =>
  r.people.some((p) => p.role === 'PIC' || p.role === 'SIC');

/** One proposal per group of open flights, airline groups first, each in date order. */
export function proposeRules(resolution: Resolution, sources: MergeSources): RuleProposal[] {
  const open: { record: SourceRecord; anchor: Fingerprint; entryId: string }[] = [];
  for (const p of resolution.pairs) {
    if (p.rule === 'open') open.push({ record: p.record, anchor: p.fa, entryId: p.entryId });
  }
  for (const o of resolution.orphans) {
    if (o.rule === 'open')
      open.push({ record: o.record, anchor: o.fingerprint, entryId: o.entryId });
  }
  const tails = new Set(open.flatMap((x) => (x.record.tail === undefined ? [] : [x.record.tail])));
  const aircraft = new Map(
    mergeAircraft(sources.a.aircraft, sources.b.aircraft, tails).map((c) => [c.tail, c]),
  );

  const groups = new Map<string, RuleProposal>();
  open.sort((x, y) => (x.record.date < y.record.date ? -1 : x.record.date > y.record.date ? 1 : 0));
  for (const { record, anchor, entryId } of open) {
    const craft = record.tail === undefined ? undefined : aircraft.get(record.tail);
    const turbine = craft?.engine !== undefined && TURBINE.has(craft.engine);
    const airline =
      turbine &&
      record.flightNumber !== undefined &&
      (hasSicTime(record) || hasFlightDeckCrew(record));
    const rule: OperatingRule = airline ? '121' : '91';
    const label = airline
      ? (craft?.typeCode ?? 'unknown type')
      : craft === undefined
        ? 'no aircraft'
        : turbine
          ? 'turbine'
          : (craft.engine ?? 'unknown engine');
    const id = `${rule}:${label}`;
    let group = groups.get(id);
    if (!group) {
      group = {
        id,
        rule,
        basis: airline ? 'airline' : 'general',
        label,
        entries: [],
        entryIds: [],
        from: record.date,
        to: record.date,
        evidence: { flightNumber: 0, sicTime: 0, crewNamed: 0 },
      };
      groups.set(id, group);
    }
    group.entries.push(anchor);
    group.entryIds.push(entryId);
    group.to = record.date;
    if (record.flightNumber !== undefined) group.evidence.flightNumber++;
    if (hasSicTime(record)) group.evidence.sicTime++;
    if (hasFlightDeckCrew(record)) group.evidence.crewNamed++;
  }
  return [...groups.values()].sort(
    (x, y) =>
      (x.basis === y.basis ? 0 : x.basis === 'airline' ? -1 : 1) ||
      (x.from < y.from ? -1 : x.from > y.from ? 1 : 0) ||
      (x.id < y.id ? -1 : 1),
  );
}

/** The decisions that give every flight of a proposal the rule (the proposed one by default). */
export function ruleDecisions(
  entries: readonly Fingerprint[],
  rule: OperatingRule,
  decidedAt: string,
): RuleDecision[] {
  return entries.map((entry) => ({ kind: 'rule', entry, rule, decidedAt }));
}
